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
       AND (NOT p_scoped OR r.merchant_id = ANY (p_merchant_ids))
       AND r.redeemed_at >= p_since
       AND (p_until IS NULL OR r.redeemed_at < p_until)
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
      (t.merchant_id IS DISTINCT FROM r.merchant_id) AS merchant_mismatch
      FROM public.merchant_transactions t
      JOIN public.redemptions r ON r.id = t.reference_id
      JOIN public.merchants   m ON m.id = r.merchant_id
      JOIN public.deals       d ON d.id = r.deal_id
     WHERE r.status = 'success'
       AND NOT r.is_demo AND NOT m.is_demo AND NOT d.is_demo
       AND (NOT p_scoped
            OR r.merchant_id = ANY (p_merchant_ids)
            OR t.merchant_id = ANY (p_merchant_ids))
  ),
  relevant AS (
    SELECT
      c.redemption_id,
      c.bucket,
      c.oriented_amount,
      isfinite(c.created_at)
        AND c.created_at >= p_since
        AND (p_until IS NULL OR c.created_at < p_until) AS in_window,
      (c.oriented_amount IS NULL
        OR c.oriented_amount = 'NaN'::numeric
        OR c.oriented_amount <= 0
        OR NOT isfinite(c.created_at)
        OR c.merchant_mismatch) AS malformed,
      EXISTS (SELECT 1 FROM candidate k WHERE k.id = c.redemption_id) AS candidate_linked
      FROM classified c
     WHERE c.bucket <> 'excluded'
  ),
  totals AS (
    SELECT
      COALESCE(SUM(x.oriented_amount)
               FILTER (WHERE x.bucket = 'gross'    AND x.in_window AND NOT x.malformed), 0) AS gross,
      COALESCE(SUM(x.oriented_amount)
               FILTER (WHERE x.bucket = 'reversal' AND x.in_window AND NOT x.malformed), 0) AS reversals,
      (COUNT(*) FILTER (WHERE x.malformed
                          AND (x.in_window OR x.candidate_linked)))::integer AS invalid
      FROM relevant x
  ),
  -- Completeness. Question 3: the search spans ALL DATES, so a fee posted
  -- seconds after midnight still proves its redemption billed. It must be a
  -- WELL-FORMED gross row: a zero, wrong-signed or cross-merchant row is not a
  -- fee, and treating it as proof of billing would let a malformed row buy an
  -- `available = true` with nothing behind it.
  missing AS (
    SELECT (COUNT(*))::integer AS n
      FROM candidate k
     WHERE NOT EXISTS (
       SELECT 1 FROM relevant x
        WHERE x.redemption_id = k.id
          AND x.bucket = 'gross'
          AND NOT x.malformed
     )
  )
  SELECT t.gross, t.reversals, t.invalid, m.n
    INTO v_gross, v_reversals, v_invalid, v_missing
    FROM totals t CROSS JOIN missing m;

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
