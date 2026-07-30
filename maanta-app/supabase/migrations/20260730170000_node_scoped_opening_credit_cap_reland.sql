-- ============================================================
-- Re-land the per-node opening-credit cap ON TOP of the Elite cap migration
--
-- WHY THIS EXISTS AS A SEPARATE MIGRATION
--
-- `20260730120000_node_scoped_opening_credit_cap.sql` (PR #131) scoped the
-- Node 0 opening-credit cap count to the launch node. It is recorded as applied
-- on production. Its effect is not there.
--
-- `20260730130000_enforce_elite_trial_first_100_cap.sql` recreates
-- `activate_merchant` IN FULL, and its copy of the credit-cap count is the older
-- global one. `130000` sorts after `120000`, so it silently overwrote the fix —
-- on production and on any fresh database alike. Verified against the live
-- function definition on 2026-07-30: production counts opening credits globally
-- while `app_config.node0_opening_credit_merchant_cap`'s own notes claimed
-- per-node behaviour. The database's documentation and its behaviour disagreed.
--
-- Re-editing `120000` cannot fix this. Its version is already in
-- `supabase_migrations.schema_migrations`, so it never runs again; and even on a
-- fresh database `130000` would clobber it a second time. The only correct fix is
-- a NEW migration with a version ABOVE `130000`. Hence this file.
--
-- WHY NOT JUST MOVE #131's MIGRATION ABOVE 130000
--
-- Because #131's body predates the Elite cap. It was written against
-- `20260720120000_security_hardening.sql` §10, where `p_grant_elite_trial`
-- granted the trial unconditionally:
--
--     IF p_grant_elite_trial THEN
--       UPDATE public.merchants SET tier = 'elite', ...   -- no cap check
--
-- Renumbering that file above `130000` would revert the first-100 launch-offer
-- cap — the exact same class of bug in the opposite direction. Neither branch's
-- version of `activate_merchant` is correct on its own. This migration is the
-- merge of the two:
--
--   * from `130000`: the advisory-locked `elite_trial_slot_available()` check,
--     the skip-not-fail behaviour when the offer is exhausted, and the
--     `trg_enforce_elite_trial_cap` interplay;
--   * from `120000` (#131): the per-node advisory lock key and the
--     `merchants`-joined cap count.
--
-- NOT CHANGED: the frozen KES 300 amount and 100-merchant cap, the four gate
-- conditions, the pending-only guard, the ledger row's shape, and the idempotency
-- anchor `provider_reference = 'node0_opening_credit:<merchant_id>'` (which stays
-- merchant-keyed and therefore stays UNIQUE — changing its format would let an
-- already-credited merchant be credited again under a new reference).
--
-- KNOWN LIMIT, carried over from #131 and deliberately not solved here: the count
-- attributes each credit to the merchant's CURRENT node, because the ledger row
-- has nowhere to snapshot the node at grant time. Nothing in the app mutates
-- `merchants.node` — it is set once by onboarding, and `authenticated` writes to
-- core tables are revoked — so the two are identical today. If node changes ever
-- become a real operation, the count must move to a snapshot taken at grant time.
--
-- Still a single-node-at-a-time promo: `node0_launch_node` is one value, so only
-- one node qualifies at any moment. This makes SEQUENTIAL nodes work (Node 0,
-- then Node 1); running two nodes' promos at once needs a per-node config shape,
-- which is a product decision, not a bug fix.
--
-- Credit: the node-scoping logic and the E/F test scenarios are from PR #131.
-- ============================================================

-- Byte-for-byte the definition installed by
-- 20260730130000_enforce_elite_trial_first_100_cap.sql, except for the
-- opening-credit advisory-lock key and the cap-count query.
CREATE OR REPLACE FUNCTION public.activate_merchant(
  p_merchant_id uuid,
  p_admin_user_id uuid,
  p_grant_elite_trial boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_status TEXT;
  v_merchant_node   TEXT;
  v_agent_id        UUID;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_credit_amount NUMERIC;
  v_credit_cap    INT;
  v_launch_end    TIMESTAMPTZ;
  v_launch_node   TEXT;
  v_credited_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: admin only';
    END IF;

    IF v_caller_id IS DISTINCT FROM p_admin_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_admin_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT status, node INTO v_merchant_status, v_merchant_node
    FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF v_merchant_status = 'active' THEN
    RAISE EXCEPTION 'already_active';
  END IF;

  SELECT id INTO v_agent_id FROM public.agents WHERE user_id = p_admin_user_id LIMIT 1;

  UPDATE public.merchants
  SET
    status       = 'active',
    onboarded_by = v_agent_id,
    onboarded_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_merchant_id;

  -- Launch offer: capped at app_config.elite_trial_merchant_cap merchants at the
  -- launch node. Take the cap lock BEFORE checking so this check-then-grant is
  -- atomic against a concurrent activation; trg_enforce_elite_trial_cap takes the
  -- same (re-entrant) lock and stamps elite_trial_granted_at.
  --
  -- When the offer is exhausted the merchant is activated on Standard and NO
  -- trial is granted. Deliberately not an error: a promo running out must not
  -- stop a merchant going live. The admin UI reads elite_trial_cap_status() to
  -- know this will happen before ticking the box.
  --
  -- PRESERVED FROM 20260730130000. This block is the reason this migration
  -- exists rather than a renumber of #131's file, which has no cap check.
  IF p_grant_elite_trial THEN
    PERFORM pg_advisory_xact_lock(hashtext('elite_trial_cap'));

    IF public.elite_trial_slot_available(p_merchant_id) THEN
      UPDATE public.merchants
      SET
        tier               = 'elite',
        elite_trial_active = TRUE,
        trial_ends_at      = NOW() + INTERVAL '30 days',
        updated_at         = NOW()
      WHERE id = p_merchant_id;
    ELSE
      RAISE NOTICE 'activate_merchant: Elite trial not granted to % — launch offer cap reached', p_merchant_id;
    END IF;
  END IF;

  SELECT value::NUMERIC     INTO v_credit_amount FROM public.app_config WHERE key = 'node0_opening_credit_kes';
  SELECT value::INT         INTO v_credit_cap    FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap';
  SELECT value::TIMESTAMPTZ INTO v_launch_end    FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
  SELECT value              INTO v_launch_node   FROM public.app_config WHERE key = 'node0_launch_node';
  v_launch_node := COALESCE(v_launch_node, 'BBS Mall');
  v_credit_cap := COALESCE(v_credit_cap, 100);

  IF COALESCE(v_credit_amount, 0) > 0
     AND v_merchant_status = 'pending'
     AND v_merchant_node = v_launch_node
     AND (v_launch_end IS NULL OR NOW() < v_launch_end)
     AND v_credit_cap > 0
  THEN
    -- THE FIX, part 1 — per-node lock. The cap is per-node, so serialise
    -- per-node. Two nodes counting concurrently is correct: they count disjoint
    -- sets. Still serialises within a node, which is what makes the cap atomic.
    PERFORM pg_advisory_xact_lock(hashtext('node0_opening_credit:' || v_launch_node));

    -- THE FIX, part 2 — per-node count. Joining merchants is what scopes it.
    -- Without the join a filled node permanently exhausts every later node's
    -- allowance: once Node 0's 100 are credited and ops points node0_launch_node
    -- at the next mall, the global count is already at the cap, so every
    -- activation there silently grants nothing while /for-merchants still
    -- advertises the credit.
    SELECT COUNT(*) INTO v_credited_count
      FROM public.merchant_transactions mt
      JOIN public.merchants m ON m.id = mt.merchant_id
      WHERE mt.transaction_type = 'topup'
        AND mt.payment_provider = 'manual'
        AND mt.provider_reference LIKE 'node0_opening_credit:%'
        AND m.node = v_launch_node;

    IF v_credited_count < v_credit_cap THEN
      UPDATE public.merchants
        SET account_balance = account_balance + v_credit_amount,
            updated_at      = NOW()
        WHERE id = p_merchant_id;

      INSERT INTO public.merchant_transactions (
        merchant_id, amount, transaction_type, payment_provider,
        provider_reference, description, currency, charged_amount
      )
      VALUES (
        p_merchant_id, v_credit_amount, 'topup', 'manual',
        'node0_opening_credit:' || p_merchant_id,
        'Node 0 launch opening credit · node0_opening_credit',
        'KES', 0
      );
    END IF;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.activate_merchant IS
  'Admin merchant activation. Grants the 30-day Elite trial only when p_grant_elite_trial AND elite_trial_slot_available() — the frozen launch offer is capped at the first 100 launch-node merchants (2026-07-30, decision D2). When the offer is exhausted the merchant is still activated, on Standard, with no trial: activation must not fail because a promo ran out. Also writes the Node 0 opening credit inline (2026-07-16), counted PER NODE so a filled node does not exhaust the next node''s allowance (re-landed 2026-07-30 by 20260730170000 after 20260730130000 overwrote the original fix in 20260730120000).';

-- Point the cap key's notes at the migration that actually installs the
-- behaviour. Production's notes cited 20260730120000, whose effect had been
-- overwritten — an operator reading the row was told per-node while the function
-- counted globally. METADATA ONLY: the ON CONFLICT touches `notes`, never
-- `value`, so the frozen cap of 100 is left alone.
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'node0_opening_credit_merchant_cap',
  '100',
  'Max number of merchants PER NODE that may receive the launch opening credit (first-N promo, counted against merchants at node0_launch_node only — see migration 20260730170000, which re-landed the per-node count after 20260730130000 overwrote it). Frozen at 100 — see decisions log.'
)
ON CONFLICT (key) DO UPDATE
  SET notes = EXCLUDED.notes;
