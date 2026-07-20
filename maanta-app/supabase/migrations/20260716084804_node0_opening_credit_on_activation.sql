-- ============================================================
-- Node 0 opening credit — wired inline into activate_merchant
-- Decision: frozen launch promo (Node 0 / BBS Mall). The first N launch
-- merchants activated during the Node 0 launch window receive a one-time
-- KES 300 promotional opening balance, granted by admin at activation.
--
-- This is a launch-period PROMOTIONAL CREDIT (same class as the free Elite
-- trial), NOT a collection — it does not breach the manual-billing ban.
--
-- Mechanism (as decided):
--   * written INLINE inside activate_merchant (admin-authorized, SECURITY
--     DEFINER), in the SAME transaction as the status flip, so the system
--     never observes "activated, 0 balance, no credit" for a launch merchant.
--   * UPDATE merchants SET account_balance = account_balance + amount
--   * INSERT INTO merchant_transactions with transaction_type='topup',
--     payment_provider='manual', currency='KES', tagged node0_opening_credit.
--   * NOT routed through record_merchant_ledger_entry (that RPC is
--     service_role-only and raises 'unauthorized' from an admin context),
--     mirroring how purchase_boost writes its own ledger row inline.
--
-- No new CHECK constraints are needed: transaction_type='topup',
-- payment_provider='manual', currency='KES' are all already allowed.
--
-- Gating (config-driven, no hardcoded dates/amounts in app code):
--   * merchant's node = launch node          (app_config.node0_launch_node)
--   * activation is within the launch window  (app_config.node0_launch_period_ends_at)
--   * merchants-credited-so-far < cap         (app_config.node0_opening_credit_merchant_cap)
--   * amount                                  (app_config.node0_opening_credit_kes)
-- Later merchants (Nodes 1-3) or activations after the window / above the cap
-- receive no automatic credit. Setting node0_opening_credit_kes to 0 disables it.
-- ============================================================

-- 1. Config: opening-credit amount, merchant cap, and launch-node identifier.
--    Frozen values seeded here; admin can adjust cap / node via the app_config
--    admin surface. The KES 300 amount and 100-merchant cap are frozen — see
--    docs/maanta-decisions-log.md.
INSERT INTO public.app_config (key, value, notes) VALUES
  ('node0_opening_credit_kes', '300',
   'Node 0 launch opening credit (KES) granted inline by activate_merchant to qualifying launch merchants. 0 disables the promo. Frozen at 300 — see decisions log.'),
  ('node0_opening_credit_merchant_cap', '100',
   'Max number of merchants that may receive the Node 0 opening credit (first-N promo). Frozen at 100 — see decisions log.'),
  ('node0_launch_node', 'BBS Mall',
   'The launch node (Node 0) whose merchants qualify for the opening credit. merchants.node must equal this to be credited.')
ON CONFLICT (key) DO NOTHING;

-- 2. Recreate activate_merchant with the opening-credit block appended.
--    Everything above the credit block is byte-for-byte the prior definition
--    (20260702003329) — status flip, agent attribution, Elite trial — plus a
--    node lookup added to the initial SELECT.
CREATE OR REPLACE FUNCTION public.activate_merchant(p_merchant_id uuid, p_admin_user_id uuid, p_grant_elite_trial boolean DEFAULT false)
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
  -- Node 0 opening-credit locals
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

  -- ---- Node 0 opening credit (frozen launch promo) ----
  -- One-time KES opening balance for the first N merchants at the launch node,
  -- activated within the launch window. Written in THIS transaction so a
  -- launch merchant is never seen as "active with 0 balance". Idempotent per
  -- merchant via provider_reference 'node0_opening_credit:<merchant_id>'
  -- (UNIQUE), so a re-run can never double-credit.
  SELECT value::NUMERIC     INTO v_credit_amount FROM public.app_config WHERE key = 'node0_opening_credit_kes';
  SELECT value::INT         INTO v_credit_cap    FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap';
  SELECT value::TIMESTAMPTZ INTO v_launch_end    FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
  SELECT value              INTO v_launch_node   FROM public.app_config WHERE key = 'node0_launch_node';
  v_launch_node := COALESCE(v_launch_node, 'BBS Mall');

  IF COALESCE(v_credit_amount, 0) > 0
     AND v_merchant_node = v_launch_node                    -- Node 0 only
     AND (v_launch_end IS NULL OR NOW() < v_launch_end)     -- within launch window
  THEN
    SELECT COUNT(*) INTO v_credited_count
      FROM public.merchant_transactions
      WHERE transaction_type = 'topup'
        AND payment_provider = 'manual'
        AND provider_reference LIKE 'node0_opening_credit:%';

    IF v_credit_cap IS NULL OR v_credited_count < v_credit_cap THEN
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
