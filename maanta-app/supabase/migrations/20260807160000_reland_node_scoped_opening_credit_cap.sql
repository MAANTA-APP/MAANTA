-- ============================================================
-- Reland: opening-credit cap is counted PER NODE, not globally (drift D73).
--
-- History, so the next reader does not have to reconstruct it:
--   * 20260730120000_node_scoped_opening_credit_cap.sql introduced the
--     per-node advisory lock and the merchants-joined count. It was applied
--     to production by hand on 2026-07-30 and never committed (D24's mystery
--     row, exported to the repo 2026-08-05).
--   * 20260730130000_enforce_elite_trial_first_100_cap.sql also does
--     CREATE OR REPLACE on activate_merchant, was authored against a main
--     that never carried the per-node change, and executed after it — so the
--     live function regressed to the GLOBAL lock and count while the
--     app_config notes (written by 120000's surviving UPDATE) still said
--     "PER NODE". That behavior/metadata mismatch is drift D73.
--
-- This migration is the reland D73 prescribes: the 20260730130000 §6
-- definition of activate_merchant — the trial-cap logic byte-identical —
-- with ONLY the opening-credit block changed back to the per-node forms:
--   1. the advisory lock keys on 'node0_opening_credit:' || v_launch_node,
--      so two nodes counting concurrently is correct (disjoint sets);
--   2. the cap count joins merchants and filters m.node = v_launch_node,
--      so a filled node does not pre-exhaust every later node's allowance.
--
-- Zero behavioral change while BBS Mall is the only node: the global count
-- and the per-node count are the same number there. The difference is real
-- from the second node onward, which is why D73 is gated on "before any
-- second node launches".
--
-- Verified by supabase/tests/node0_opening_credit_test.sql (existing
-- scenarios still pass — single-node behavior unchanged) plus the new
-- per-node scenarios in that file added with this migration.
-- ============================================================

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

COMMENT ON FUNCTION public.activate_merchant IS
  'Admin merchant activation. Grants the 30-day Elite trial only when p_grant_elite_trial AND elite_trial_slot_available() — the frozen launch offer is capped at the first 100 launch-node merchants (2026-07-30, decision D2). When the offer is exhausted the merchant is still activated, on Standard, with no trial: activation must not fail because a promo ran out. Also writes the Node 0 opening credit inline (2026-07-16); the opening-credit cap is counted PER NODE (relanded 2026-08-07, drift D73 — the app_config notes said per-node since 2026-07-30 while the live function counted globally).';
