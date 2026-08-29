-- ============================================================================
-- D211 / B2a — the ledger's fee contract, expressed once in SQL.
--
-- WHY THIS EXISTS
--
-- `/founder`, `/admin/reports` and `/admin` answer "what have success fees
-- earned" through a different mechanism from `/admin/pilot` and
-- `/founder/yesterday`. Those two moved to gross / reversals / net in PR B
-- (`lib/evidence-scope.ts`). The executive three did not, because they read
-- `admin_success_fee_revenue`, which is:
--
--     SELECT COALESCE(SUM(ABS(amount)), 0) FROM merchant_transactions
--      WHERE transaction_type = 'success_fee' AND created_at >= p_since;
--
-- Four defects in five lines. It omits `success_fee_arrears`, so it
-- under-reports exactly the merchants who ran out of balance. It counts a
-- reversed charge as revenue in full. `ABS` is not arithmetic but a guess --
-- "whatever sign this row carries, treat it as billed" -- which is exactly
-- wrong for a reversal and silently absorbs a row the money path could not
-- have written. And it applies NO D188 scope at all: no redemption, deal or
-- merchant join, so a fee against a demo-tagged deal lands in an executive
-- revenue figure.
--
-- WHY IT IS SQL AND NOT THE TYPESCRIPT READER
--
-- D149 is closed on the rule these surfaces already state: "SQL SUM -- never
-- pull fee rows into JS (PostgREST 1000-row cap under-reports)". These figures
-- are marketplace-wide, so the row count grows with the whole marketplace and
-- a bounded read would report UNAVAILABLE permanently at scale. The contract
-- therefore exists in two languages, and that is a real risk: a second place
-- to enforce a rule is a second place to drift. It is held in step by shared
-- semantic fixtures -- `supabase/tests/fixtures/fee-contract-cases.json` --
-- which prove the same cases against this function and against
-- `aggregateLedgerFees`, with a generator drift check in CI.
--
-- THE SIGNED CONTRACT (founder-ratified 2026-08-29, drift D218)
--
-- Every sign read back from the live RPC bodies on production, never assumed:
--
--   type                  writes         sign      bucket
--   success_fee           -p_amount      negative  gross      (wallet debit)
--   success_fee_arrears    p_amount      POSITIVE  gross      (accrued debt)
--   fee_reversal           v_fee_amount  positive  reversals
--   arrears_settlement    -v_settled     negative  excluded
--   topup / boost_fee / subscription / refund / dispute        excluded
--
-- The arrears leg is positive because it accrues a debt rather than moving the
-- wallet. Two rows against ONE redemption therefore carry OPPOSITE signs,
-- which is why sign can never classify a row and the type must.
--
-- `arrears_settlement` is excluded from all three figures: it moves an amount a
-- `success_fee_arrears` row already counted as billed. In gross it would double
-- the fee; in reversals it would subtract a fee nobody reversed.
--
-- THE WINDOW, AND THE THING IT IS EASY TO GET WRONG
--
-- Three different questions use the window differently, and conflating any two
-- of them produces a wrong money figure:
--
--   1. MONETARY TOTALS include a ledger movement only when the MOVEMENT's own
--      `merchant_transactions.created_at` falls in [p_since, p_until). That is
--      when the money moved. A reversal posted inside the window against a
--      redemption verified long before it therefore counts -- which is the
--      whole point of reporting reversals at all.
--
--   2. The COMPLETENESS CANDIDATE SET is genuine successful redemptions whose
--      `redeemed_at` falls in [p_since, p_until). A missing fee on a redemption
--      OUTSIDE the requested window must never make the requested period
--      unavailable.
--
--   3. The SEARCH for each candidate's fee row spans ALL DATES. A fee posted
--      seconds after midnight still proves its redemption was billed. So a fee
--      row outside the window can prove completeness WITHOUT contributing to
--      that window's gross.
--
-- AVAILABILITY IS ALL-OR-NOTHING (founder ruling 2026-08-29)
--
-- An executive surface must never display a partial total. If any candidate
-- redemption has no fee row, or any included fee/reversal row contradicts its
-- own type's sign, then gross, reversals AND net are all NULL together. The
-- diagnostic counts stay populated so an operator can see why. Legitimate zero
-- activity is available zeros, never unavailable -- "nothing happened" and "we
-- could not tell" are different answers and this function keeps them apart.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The private contract. Every fee figure in the product resolves here.
--
-- Scope is TWO parameters on purpose. A single nullable id array where NULL
-- means "global" is one forgotten argument away from an operator scoped to one
-- node seeing marketplace-wide money. `p_scoped` states the intent and the
-- function refuses the two incoherent combinations outright.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fee_totals(
  p_since        timestamptz,
  p_until        timestamptz,
  p_scoped       boolean,
  p_merchant_ids uuid[]
)
RETURNS TABLE (
  gross_kes        numeric,
  reversals_kes    numeric,
  net_kes          numeric,
  available        boolean,
  missing_fee_rows integer,
  invalid_rows     integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gross     numeric := 0;
  v_reversals numeric := 0;
  v_invalid   integer := 0;
  v_missing   integer := 0;
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'invalid_window: p_since is required';
  END IF;
  IF p_until IS NOT NULL AND p_until <= p_since THEN
    RAISE EXCEPTION 'invalid_window: p_until (%) must be after p_since (%)', p_until, p_since;
  END IF;
  IF p_scoped IS NULL THEN
    RAISE EXCEPTION 'invalid_scope: p_scoped is required';
  END IF;
  -- NULL never means global. A scoped caller that lost its id array gets an
  -- error, not the whole marketplace.
  IF p_scoped AND p_merchant_ids IS NULL THEN
    RAISE EXCEPTION 'invalid_scope: a scoped call must supply a merchant id array';
  END IF;
  IF NOT p_scoped AND p_merchant_ids IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_scope: a global call must not supply merchant ids';
  END IF;

  -- One statement, four answers, so the totals, the invalid count and the
  -- completeness check can never be computed over row sets that disagree.
  --
  -- `candidate`  — genuine successes verified in [p_since, p_until). Question 2.
  -- `classified` — every genuine linked movement, bucketed and oriented.
  -- `relevant`   — the fee-bearing ones, each marked in_window and malformed.
  --
  -- A movement is MALFORMED when it contradicts something the money path
  -- guarantees. Each of these is representable in the database and each was
  -- found by review rather than by imagination:
  --
  --   * oriented amount NULL or <= 0 — a sign contradicting its own type, or a
  --     zero fee neither RPC can write.
  --   * oriented amount NaN — a valid `numeric` value. PostgreSQL orders NaN
  --     ABOVE every finite number, so `> 0` accepts it and `<= 0` does not
  --     catch it, and SUM propagates it: without this the function would return
  --     gross = NaN with invalid_rows = 0 and available = true. Verified in
  --     psql, not assumed.
  --   * created_at not finite — `infinity` is a valid `timestamptz` that sorts
  --     above every bound. `Date.parse('infinity')` is NaN, so the TypeScript
  --     contract already calls it unknown; SQL must agree or the two
  --     implementations answer differently on the same row.
  --   * the movement's own `merchant_id` differs from its redemption's. Nothing
  --     enforces equality, and `deduct_success_fee_or_record_arrears` takes a
  --     caller-supplied reference id, so one merchant's wallet debit can point
  --     at another's redemption. Attributing it to either merchant is a guess;
  --     it is surfaced instead. The scope predicate deliberately matches on
  --     EITHER merchant so such a row is visible from both scopes rather than
  --     invisible from one — it can never contribute to a total, so appearing
  --     twice costs nothing.
  --
  -- Malformed rows count toward `invalid_rows` when they are in the window OR
  -- when an in-window candidate's completeness would otherwise rest on them.
  -- Not "any malformed row ever": one bad row from last year must not blank
  -- every future period, which is the same rule that windows the candidate set.
  WITH candidate AS (
    SELECT r.id
      FROM public.redemptions r
      JOIN public.merchants m ON m.id = r.merchant_id
      JOIN public.deals     d ON d.id = r.deal_id
     WHERE r.status = 'success'
       AND NOT r.is_demo AND NOT m.is_demo AND NOT d.is_demo
       -- Scope matches the redemption's merchant OR its deal's owner, for the
       -- same reason `classified` below does. A success naming merchant A
       -- against B's deal, with NO fee movement at all, cannot be recovered by
       -- `touched` or `classified` -- there is no movement to reach it
       -- through -- so scoping completeness on `r.merchant_id` alone left B
       -- reading an available zero while A and the global report both
       -- surfaced the missing fee. On a well-formed chain the two merchants
       -- are equal and the extra arm is a no-op; only a corrupt chain differs,
       -- and both owners should see corruption on a chain they are part of.
       AND (NOT p_scoped
            OR r.merchant_id = ANY (p_merchant_ids)
            OR d.merchant_id = ANY (p_merchant_ids))
       AND r.redeemed_at >= p_since
       AND (p_until IS NULL OR r.redeemed_at < p_until)
  ),
  -- Redemptions whose fee history this window has to read, found through
  -- `idx_mtx_fee_window` instead of by scanning the ledger.
  --
  -- The previous shape expressed the same set as a DISJUNCTION inside the join
  -- (`in-window OR candidate OR has-an-in-window-sibling`). That is correct and
  -- unindexable: an OR across three branches collapses to a Filter, so the
  -- planner drove from `redemptions` and the created_at index never applied.
  -- Computing the set FIRST turns the same rule into an index range scan
  -- followed by `reference_id` probes.
  touched AS (
    SELECT DISTINCT t.reference_id AS id
      FROM public.merchant_transactions t
     WHERE t.transaction_type IN ('success_fee', 'success_fee_arrears', 'fee_reversal')
       AND t.reference_id IS NOT NULL
       -- Windowed rows, PLUS every row whose timestamp cannot be placed at all.
       --
       -- An unplaceable row (`infinity`, `-infinity`) belongs to no window, so
       -- no window can legitimately exclude it on date grounds -- and if it is
       -- not read here it is never classified, never flagged, and the report
       -- returns an available zero over money that moved. That is the opposite
       -- of the "one bad row must not blank every period" rule: those rows have
       -- a date placing them elsewhere. This one has none.
       --
       -- The consequence is deliberate: an unplaceable fee row makes EVERY
       -- report unavailable until it is corrected. It has to, because there is
       -- no period it could belong to instead.
       AND (NOT isfinite(t.created_at)
            OR (t.created_at >= p_since
                AND (p_until IS NULL OR t.created_at < p_until)))
  ),
  -- Deliberately unscoped: `touched` is already bounded by the window and the
  -- index, and scoping it on `t.merchant_id` would hide a cross-merchant row
  -- whose REDEMPTION is in scope while its movement is not. `classified` below
  -- applies the scope, on either merchant, as it always has.
  subject AS (
    SELECT id FROM candidate
    UNION
    SELECT id FROM touched
  ),
  classified AS (
    SELECT
      r.id AS redemption_id,
      t.created_at,
      -- A fee may only be counted against a redemption the counter actually
      -- verified. `deduct_success_fee_or_record_arrears` will write a row
      -- against a pending, failed or flagged redemption if service_role asks
      -- it to, and `readLedgerFeeTotals` builds its genuine set with
      -- `.eq("status", "success")` — so without this the SQL and TypeScript
      -- contracts disagree, and the SQL one reports a fee against an unverified
      -- redemption as earned.
      CASE t.transaction_type
        WHEN 'success_fee'         THEN 'gross'
        WHEN 'success_fee_arrears' THEN 'gross'
        WHEN 'fee_reversal'        THEN 'reversal'
        ELSE 'excluded'
      END AS bucket,
      -- Each type read through the sign the money path actually writes. No ABS:
      -- a row that contradicts its own type is a fact about the ledger, and
      -- normalising it away is how a wrong-signed row becomes a plausible
      -- number.
      CASE t.transaction_type
        WHEN 'success_fee'         THEN -t.amount
        WHEN 'success_fee_arrears' THEN  t.amount
        WHEN 'fee_reversal'        THEN  t.amount
        ELSE NULL
      END AS oriented_amount,
      t.created_at AS movement_at,
      r.redeemed_at,
      r.success_fee_charged AS fee_snapshot,
      -- Three ways a row can contradict the chain it hangs from. Each is
      -- representable by a direct insert and none is possible through the
      -- sanctioned path.
      (t.merchant_id IS DISTINCT FROM r.merchant_id) AS merchant_mismatch,
      -- `claim_deal` always copies the deal's merchant into the redemption, so
      -- a redemption naming merchant A against merchant B's deal is the same
      -- corruption one level up, and it would attribute B's supply to A.
      (d.merchant_id IS DISTINCT FROM r.merchant_id) AS deal_mismatch,
      -- A reversal must be corroborated by its audit row.
      --
      -- `reverse_success_fee` writes three things atomically: the wallet
      -- credit, this ledger row, and a `fee_reversals` audit row pointing back
      -- at it through `wallet_transaction_id`. A `fee_reversal` row inserted
      -- directly by service_role has none of that -- no wallet was credited and
      -- no admin approved anything -- yet it is correctly signed, so every
      -- other test here passes it and it SUBTRACTS from net. A fabricated or
      -- orphaned reversal would read as money returned.
      --
      -- Gross needs no equivalent because its evidence is the redemption
      -- itself, which the D188 chain already requires. The asymmetry is not an
      -- inconsistency: a reversal has an audit table precisely because it is
      -- an admin action rather than a consequence of one.
      (t.transaction_type = 'fee_reversal'
       AND NOT EXISTS (
         SELECT 1 FROM public.fee_reversals fr
          WHERE fr.wallet_transaction_id = t.id
            AND fr.redemption_id  = r.id
            AND fr.merchant_id    = r.merchant_id
            AND fr.amount         = t.amount
            -- `reverse_success_fee` raises unless the approver's role is
            -- `admin`, so a genuine audit row always names one. The column is
            -- nullable, so an approver-less row is representable and would
            -- otherwise satisfy every other part of this check.
            --
            -- Non-NULL rather than "is an admin today": roles change for
            -- legitimate reasons, and re-checking a past approval against a
            -- present role would blank old periods whenever someone's role
            -- moved. What is durable is that an approver was recorded.
            AND fr.approver_user_id IS NOT NULL
            -- Both the ledger row and the audit row derive from
            -- `redemptions.success_fee_charged`. Matching them to each other
            -- only proves they were written together; matching them to the
            -- snapshot is what ties them to the fee that was actually billed.
            AND fr.amount         = r.success_fee_charged
       )) AS reversal_uncorroborated
      FROM public.merchant_transactions t
      JOIN public.redemptions r ON r.id = t.reference_id
      JOIN public.merchants   m ON m.id = r.merchant_id
      JOIN public.deals       d ON d.id = r.deal_id
     -- FOUR demo tags, not three. D188's lesson is that `redemptions.is_demo`
     -- is not a discriminator because `claim_deal` never sets it — which is a
     -- reason to add the parent join, NOT a reason to ignore a tag that IS set
     -- deliberately. The seed scripts tag `merchant_transactions.is_demo`, and
     -- the money path never does (the column takes its default), so this can
     -- only ever exclude a row something synthetic created.
     WHERE t.transaction_type IN ('success_fee', 'success_fee_arrears', 'fee_reversal')
       -- The three fee-bearing types, and the SAME three the CASE below
       -- buckets as gross or reversal. Stated here rather than left to the
       -- `bucket <> 'excluded'` filter downstream for two reasons: it is
       -- semantics-preserving (an excluded row contributes to none of the
       -- three answers), and it is what lets the partial index below serve
       -- this scan instead of the planner reading every top-up in history.
       -- `fee_totals_contract_test.sql` asserts the index predicate names
       -- exactly this set, so the two cannot drift.
       AND r.status = 'success'
       -- FLAGGED SUCCESSES STILL COUNT (founder ruling 2026-08-29).
       --
       -- `status = 'success'` is the authoritative financial event.
       -- `fraud_flags` and `review_required` are mutable review metadata and
       -- do NOT independently remove an otherwise successful redemption from
       -- earned-fee totals. If adjudication later invalidates the fee, the
       -- correction is an explicit `fee_reversal` -- which lands in the window
       -- its own movement falls in.
       --
       -- The point is auditability: a historical figure must change through a
       -- ledger movement, not because someone toggled a review flag. Keying on
       -- review metadata would let last month's revenue move silently, with no
       -- row to point at.
       AND NOT t.is_demo
       AND NOT r.is_demo AND NOT m.is_demo AND NOT d.is_demo
       -- Scope matches on ANY of the three merchants a corrupt chain can name:
       -- the redemption's, the movement's, or the DEAL's. A well-formed chain
       -- has all three equal, so this is a no-op on real data; on a corrupt one
       -- it makes the inconsistency visible from every side rather than
       -- invisible from two of them. Without the deal arm, a deal owned by B
       -- whose redemption and movement both name A leaves B reading available
       -- zero while the corruption sits on B's own deal.
       AND (NOT p_scoped
            OR r.merchant_id = ANY (p_merchant_ids)
            OR t.merchant_id = ANY (p_merchant_ids)
            OR d.merchant_id = ANY (p_merchant_ids))
       -- The whole linked history of every subject redemption, and nothing
       -- else. A subject is either a completeness candidate or a redemption
       -- touched in-window, and its WHOLE history is needed because two rules
       -- below compare a movement against its siblings: a reversal needs its
       -- original fee, and a duplicate fee is only visible next to the row it
       -- duplicates.
       --
       -- Semantics-preserving. A row belonging to no subject can reach none of
       -- the three answers: it fails `in_window` so it cannot enter the totals;
       -- the invalid count needs `in_window` or an unbilled candidate, and
       -- every unbilled candidate is a subject; and completeness only reads a
       -- candidate's own rows.
       AND t.reference_id IN (SELECT id FROM subject)
  ),
  relevant AS (
    SELECT
      c.redemption_id,
      c.bucket,
      c.oriented_amount,
      isfinite(c.created_at)
        AND c.created_at >= p_since
        AND (p_until IS NULL OR c.created_at < p_until) AS in_window,
      -- A row whose timestamp cannot be placed belongs to no window, so it can
      -- never be excluded from one on date grounds. Carried separately from
      -- `in_window` because the invalid count must see it even though the
      -- totals must not.
      NOT isfinite(c.movement_at) AS unplaceable,
      (c.oriented_amount IS NULL
        OR c.oriented_amount = 'NaN'::numeric
        OR c.oriented_amount <= 0
        OR NOT isfinite(c.created_at)
        OR c.merchant_mismatch
        OR c.deal_mismatch
        -- The amount must be the fee that was actually billed.
        -- `deduct_success_fee_or_record_arrears` writes the redemption's own
        -- `success_fee_charged` and pins it to the canonical config fee, and
        -- nothing in the schema updates that snapshot afterwards. A correctly
        -- signed row carrying a different number was not written by the money
        -- path, and reporting it means reporting revenue nobody billed.
        OR c.oriented_amount IS DISTINCT FROM c.fee_snapshot
        -- A fee cannot predate the verification that caused it.
        -- `verify_redemption` sets `redeemed_at` and writes the fee in one
        -- transaction, so `created_at >= redeemed_at` always holds. Without
        -- this, a fee posted against a PENDING redemption that later became
        -- successful is retroactively legitimised by the status it acquired
        -- afterwards, and a report covering the earlier period counts it.
        -- Both buckets. `reverse_success_fee` refuses a redemption that is not
        -- already `success`, so a reversal cannot predate verification either.
        OR (isfinite(c.movement_at)
            AND c.redeemed_at IS NOT NULL
            AND c.movement_at < c.redeemed_at)
        OR c.reversal_uncorroborated) AS malformed_base
      FROM classified c
     WHERE c.bucket <> 'excluded'
  ),
  -- Two rules a row cannot answer on its own, only next to its siblings.
  --
  -- `verify_redemption` writes exactly one fee per redemption and
  -- `reverse_success_fee` refuses a redemption with no fee to reverse -- but
  -- `deduct_success_fee_or_record_arrears` takes a caller-supplied reference
  -- id, so a retry or a direct call can post a second well-formed fee, and a
  -- reversal can be fabricated against a redemption that was never billed.
  -- Both shapes are individually well-formed; only the set gives them away.
  scored AS (
    SELECT
      x.*,
      COUNT(*) FILTER (WHERE x.bucket = 'gross' AND NOT x.malformed_base)
        OVER (PARTITION BY x.redemption_id) AS wellformed_gross_siblings
      FROM relevant x
  ),
  marked AS (
    SELECT
      y.redemption_id,
      y.bucket,
      y.oriented_amount,
      y.in_window,
      y.unplaceable,
      (y.malformed_base
        -- KES 60 reported for one KES 30 success fee, every row of it
        -- individually valid.
        OR (y.bucket = 'gross' AND NOT y.malformed_base
            AND y.wellformed_gross_siblings > 1)
        -- Money returned for a fee that was never charged.
        OR (y.bucket = 'reversal' AND y.wellformed_gross_siblings = 0)
      ) AS malformed
      FROM scored y
  ),
  -- Completeness, computed ONCE and then used twice.
  --
  -- The search spans ALL DATES, so a fee posted seconds after midnight still
  -- proves its redemption billed. It must be a WELL-FORMED gross row: a zero,
  -- wrong-signed, NaN, unplaceable or cross-merchant row is not a fee, and
  -- treating it as proof of billing would let a malformed row buy an
  -- `available = true` with nothing behind it.
  unbilled AS (
    SELECT k.id
      FROM candidate k
     WHERE NOT EXISTS (
       SELECT 1 FROM marked x
        WHERE x.redemption_id = k.id
          AND x.bucket = 'gross'
          AND NOT x.malformed
     )
  ),
  totals AS (
    SELECT
      COALESCE(SUM(x.oriented_amount)
               FILTER (WHERE x.bucket = 'gross'    AND x.in_window AND NOT x.malformed), 0) AS gross,
      COALESCE(SUM(x.oriented_amount)
               FILTER (WHERE x.bucket = 'reversal' AND x.in_window AND NOT x.malformed), 0) AS reversals,
      -- WHICH ROWS THIS PERIOD'S ANSWER DEPENDS ON. This predicate has been
      -- wrong in both directions and is the part of the function worth
      -- distrusting:
      --
      --   * in-window rows always count — they are what the totals are made of;
      --   * an out-of-window row counts ONLY if it is gross AND its redemption
      --     has no well-formed gross row anywhere. That is exactly "evidence
      --     the completeness answer rests on".
      --
      -- Everything else has no bearing on this period and must not blank it.
      -- A malformed REVERSAL in September cannot enter August's totals or
      -- prove August's completeness — it is invalid in its own window. And a
      -- malformed gross row is irrelevant once a VALID gross row for the same
      -- redemption exists, because the valid one already answered the
      -- question. Both of those blanked historical periods permanently, since
      -- a link to a candidate never ages out.
      (COUNT(*) FILTER (WHERE x.malformed
                          AND (x.in_window
                               -- No window owns an unplaceable row, so every
                               -- window must surface it. Excluding it here is
                               -- how it would return to being silently dropped.
                               OR x.unplaceable
                               OR (x.bucket = 'gross'
                                   AND EXISTS (SELECT 1 FROM unbilled u
                                                WHERE u.id = x.redemption_id)))))::integer AS invalid
      FROM marked x
  ),
  missing AS (SELECT (COUNT(*))::integer AS n FROM unbilled),
  -- Fee movements with NO redemption parent at all.
  --
  -- Every other rule here is about a row that JOINS and then contradicts
  -- something. This is the row that never joins: `p_reference_id` on
  -- `deduct_success_fee_or_record_arrears` is `DEFAULT NULL`, and
  -- `merchant_transactions.reference_id` has no foreign key, so an authorized
  -- caller can move a merchant's wallet and leave the fee row pointing at
  -- nothing. The inner join above discards it silently, and the report says
  -- zero and calls itself available -- money moved, and the figure denies it.
  --
  -- Deliberately narrow: a row pointing at a DEMO redemption is demo activity
  -- and correctly ignored, and one pointing at a non-success redemption is
  -- already ruled on and has its own case. Only "there is no redemption row
  -- there at all" counts here.
  unparented AS (
    SELECT (COUNT(*))::integer AS n
      FROM public.merchant_transactions t
      JOIN public.merchants m ON m.id = t.merchant_id
     WHERE t.transaction_type IN ('success_fee', 'success_fee_arrears', 'fee_reversal')
       AND NOT t.is_demo
       AND NOT m.is_demo
       AND (NOT p_scoped OR t.merchant_id = ANY (p_merchant_ids))
       -- Placement follows the same three-valued rule as `touched`: a row
       -- whose timestamp cannot be placed belongs to NO window, so every
       -- window has to surface it. Requiring isfinite() here was how an
       -- unparented row at `infinity` escaped BOTH validation paths at once --
       -- it cannot reach `classified` either, having no parent to join
       -- through -- and the report answered an available zero over money that
       -- had moved.
       AND (NOT isfinite(t.created_at)
            OR (t.created_at >= p_since
                AND (p_until IS NULL OR t.created_at < p_until)))
       AND NOT EXISTS (
         SELECT 1 FROM public.redemptions r WHERE r.id = t.reference_id
       )
  )
  SELECT t.gross, t.reversals, t.invalid + u.n, m.n
    INTO v_gross, v_reversals, v_invalid, v_missing
    FROM totals t CROSS JOIN missing m CROSS JOIN unparented u;

  IF v_missing > 0 OR v_invalid > 0 THEN
    -- All three together. A partial money figure on an executive surface is
    -- read as fact, and "gross 30, net unavailable" invites exactly that.
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric,
                        FALSE, v_missing, v_invalid;
  ELSE
    RETURN QUERY SELECT v_gross, v_reversals, v_gross - v_reversals,
                        TRUE, 0, 0;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public._fee_totals(timestamptz, timestamptz, boolean, uuid[]) IS
  'Private fee contract for D211. Gross/reversals/net over genuine-tagged (D188) ledger movements, windowed on merchant_transactions.created_at; completeness candidates windowed on redemptions.redeemed_at with their fee rows searched across all dates. All-or-nothing availability. Call the admin_fee_totals_* wrappers, never this.';

-- ---------------------------------------------------------------------------
-- 2) The two wrappers. Global and scoped are separate NAMES, not separate
--    arguments to one name, so a scoped surface cannot silently go global by
--    dropping a parameter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fee_totals_global(
  p_since timestamptz,
  p_until timestamptz
)
RETURNS TABLE (
  gross_kes        numeric,
  reversals_kes    numeric,
  net_kes          numeric,
  available        boolean,
  missing_fee_rows integer,
  invalid_rows     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT * FROM public._fee_totals(p_since, p_until, FALSE, NULL::uuid[]);
$function$;

CREATE OR REPLACE FUNCTION public.admin_fee_totals_for_merchants(
  p_since        timestamptz,
  p_until        timestamptz,
  p_merchant_ids uuid[]
)
RETURNS TABLE (
  gross_kes        numeric,
  reversals_kes    numeric,
  net_kes          numeric,
  available        boolean,
  missing_fee_rows integer,
  invalid_rows     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT * FROM public._fee_totals(p_since, p_until, TRUE, p_merchant_ids);
$function$;

COMMENT ON FUNCTION public.admin_fee_totals_for_merchants(timestamptz, timestamptz, uuid[]) IS
  'Scoped fee totals. An EMPTY array is a real state -- a live node with no merchants -- and returns available zeros. A NULL array raises: NULL never means global.';

-- ---------------------------------------------------------------------------
-- 3) Compatibility. `admin_success_fee_revenue` keeps its exact signature and
--    its ACL (CREATE OR REPLACE preserves both), so the three existing callers
--    and any build mid-rollout keep working -- against the CORRECTED contract.
--
--    It raises rather than returning NULL when the figure is unavailable, and
--    that choice is forced: `formatKes` in src/lib/ui.ts is `amount ?? 0`, so a
--    NULL would render "KES 0" -- a manufactured zero on an executive money
--    card, which is the D164/D185 failure this whole change is about. Both
--    calling pages already funnel any error into a whole-page read-error state,
--    so an exception produces an honest "unavailable" with no application
--    change. B2b replaces that with a per-card unavailable state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_success_fee_revenue(p_since timestamptz)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v RECORD;
BEGIN
  SELECT * INTO v FROM public._fee_totals(p_since, NULL, FALSE, NULL::uuid[]);
  IF NOT v.available THEN
    RAISE EXCEPTION
      'fee_totals_unavailable: % genuine success(es) with no fee row, % row(s) with invalid polarity',
      v.missing_fee_rows, v.invalid_rows;
  END IF;
  -- GROSS, deliberately. This name has always meant fees billed, and quietly
  -- turning it into net would change a number nobody asked to change. B2b moves
  -- the callers to the structured wrapper and names all three figures.
  RETURN v.gross_kes;
END;
$function$;

COMMENT ON FUNCTION public.admin_success_fee_revenue(timestamptz) IS
  'DEPRECATED compatibility shim for D211/B2a. Returns GROSS genuine-tagged fees from _fee_totals, and RAISES when the figure is unavailable because NULL would render as "KES 0". Callers move to admin_fee_totals_global in B2b; removal is a later cleanup.';

-- ---------------------------------------------------------------------------
-- 4) The index the new join needs.
--
-- `merchant_transactions` had none on `reference_id` -- only (merchant_id,
-- created_at DESC), the PK and provider_reference -- so every fee figure would
-- have seq-scanned the ledger. Partial because a movement with no reference_id
-- can never be matched to a redemption and so can never contribute.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mtx_reference_id
  ON public.merchant_transactions (reference_id)
  WHERE reference_id IS NOT NULL;

-- The GLOBAL window's own index.
--
-- `idx_mtx_reference_id` accelerates each sibling lookup once a row is in
-- hand; it cannot bound the initial scan. The only other candidate is
-- `(merchant_id, created_at DESC)`, whose leading column a global call does
-- not constrain -- so before this, a one-day marketplace-wide report read
-- every row in the ledger's history to evaluate its timestamp predicate. That
-- is the D149 shape: correct today at 8 rows, silently degrading later, on the
-- executive money figure.
--
-- Column order follows the predicate: `created_at` leads because it is the
-- range scan, and the type set is the partial WHERE rather than a second key
-- column because every query using this index constrains all three types and
-- none of them ranges over type. Scoped calls keep using
-- `(merchant_id, created_at DESC)`, whose leading column they do constrain.
CREATE INDEX IF NOT EXISTS idx_mtx_fee_window
  ON public.merchant_transactions (created_at)
  WHERE transaction_type IN ('success_fee', 'success_fee_arrears', 'fee_reversal');

-- ---------------------------------------------------------------------------
-- 5) Grants. Money aggregates are service-role only, matching the function this
--    replaces exactly. The private contract is reachable only through the
--    SECURITY DEFINER wrappers.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._fee_totals(timestamptz, timestamptz, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._fee_totals(timestamptz, timestamptz, boolean, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public._fee_totals(timestamptz, timestamptz, boolean, uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public._fee_totals(timestamptz, timestamptz, boolean, uuid[]) FROM service_role;
GRANT EXECUTE ON FUNCTION public._fee_totals(timestamptz, timestamptz, boolean, uuid[]) TO postgres;

REVOKE ALL ON FUNCTION public.admin_fee_totals_global(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fee_totals_global(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_fee_totals_global(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fee_totals_global(timestamptz, timestamptz) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.admin_fee_totals_for_merchants(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fee_totals_for_merchants(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.admin_fee_totals_for_merchants(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fee_totals_for_merchants(timestamptz, timestamptz, uuid[]) TO service_role, postgres;

-- admin_success_fee_revenue keeps the ACL CREATE OR REPLACE preserved. Restated
-- rather than assumed, so this migration is the whole statement of who may read
-- a money aggregate.
REVOKE ALL ON FUNCTION public.admin_success_fee_revenue(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_success_fee_revenue(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_success_fee_revenue(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_success_fee_revenue(timestamptz) TO service_role, postgres;
