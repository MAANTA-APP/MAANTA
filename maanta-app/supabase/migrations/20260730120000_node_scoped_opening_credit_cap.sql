-- EXPORTED FROM PRODUCTION 2026-08-05 (drift D24). This migration was applied
-- to production by hand on 2026-07-30 under version 20260730120000 and never
-- committed; everything below this header block is the ledger's stored
-- statement, verbatim. Exported so the repo's migration history matches what
-- production actually ran — not because its change is in effect.
--
-- IT IS NOT IN EFFECT. 20260730130000_enforce_elite_trial_first_100_cap.sql
-- also does CREATE OR REPLACE on activate_merchant, was authored against a
-- main that never carried this change, and executed after it on production —
-- verified 2026-08-05 by pg_get_functiondef read-back: the live function has
-- the GLOBAL opening-credit lock and count, not the per-node ones below. This
-- chain reproduces that end state exactly (this file, then 130000 overwrites
-- it). Harmless while Node 0 is the only node — the global count and the
-- per-node count are equal — and wrong the day a second node launches. The
-- reland is tracked as drift D73; it must be a NEW migration at a current
-- timestamp that re-applies the per-node cap ON TOP of the trial-cap
-- definition, not a resurrection of this number. Note the app_config notes
-- UPDATE at the bottom survives (nothing later touches it), so the live
-- metadata says "PER NODE" while the live function counts globally — that
-- mismatch is part of D73.

-- Opening-credit cap is counted PER NODE, not globally.
-- Repo file: supabase/migrations/20260730120000_node_scoped_opening_credit_cap.sql
-- Byte-for-byte the 20260720120000 §10 definition except the advisory-lock key
-- and the cap-count query, which now joins merchants to scope the count to the
-- launch node. See the repo file header for the full rationale and known limits.
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

  IF p_grant_elite_trial THEN
    UPDATE public.merchants
    SET
      tier               = 'elite',
      elite_trial_active = TRUE,
      trial_ends_at      = NOW() + INTERVAL '30 days',
      updated_at         = NOW()
    WHERE id = p_merchant_id;
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
    -- Per-node lock: the cap is per-node, so serialise per-node. Two nodes
    -- counting concurrently is correct — they count disjoint sets.
    PERFORM pg_advisory_xact_lock(hashtext('node0_opening_credit:' || v_launch_node));

    -- Per-node count. Joining merchants is what scopes it; without the join a
    -- filled node permanently exhausts every later node's allowance.
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

UPDATE public.app_config
SET notes = 'Max number of merchants PER NODE that may receive the launch opening credit (first-N promo, counted against merchants at node0_launch_node only — see migration 20260730120000). Frozen at 100 — see decisions log.'
WHERE key = 'node0_opening_credit_merchant_cap';
