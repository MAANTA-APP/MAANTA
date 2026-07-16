-- ============================================================
-- Frozen-rule fix (2026-07-15): Boost is Elite-only — server-side.
--
-- Breach: purchase_boost and move_boost enforced owner/admin, deal
-- state, no-duplication and balance, but NOT the merchant tier. A
-- Standard merchant with balance could buy and move boosts by calling
-- the RPCs directly (CLAUDE.md frozen rule: "Boost is Elite-only — gate
-- must be server-side, not just UI").
--
-- Fix: add a strict `merchants.tier = 'elite'` gate to both RPCs,
-- raising a specific, stable BOOST_ELITE_ONLY error for non-Elite
-- merchants. All existing checks and error codes are preserved exactly.
--
-- The gate is a check on the *merchant's tier*, not on the caller, so it
-- lives OUTSIDE the caller-auth block: a Standard merchant is rejected
-- even when an admin or service_role acts on their behalf. Boost price,
-- duration, trial length and Node-0 promotional credits are untouched.
-- ============================================================

-- purchase_boost — add Elite-only gate (all other logic identical to
-- 20260709175532_deal_pause_boosts_staff.sql).
CREATE OR REPLACE FUNCTION public.purchase_boost(
  p_merchant_id uuid,
  p_deal_id uuid
)
RETURNS TABLE (
  boost_id uuid,
  new_balance numeric,
  boost_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
  v_tier TEXT;
  v_fee NUMERIC;
  v_balance NUMERIC;
  v_deal RECORD;
  v_boost_id UUID;
  v_ends_at TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
BEGIN
  SELECT user_id, tier INTO v_owner_user_id, v_tier
    FROM public.merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' AND v_caller_id IS DISTINCT FROM v_owner_user_id THEN
      RAISE EXCEPTION 'unauthorized: not merchant owner or admin';
    END IF;
  END IF;

  -- Frozen rule (CLAUDE.md): Boost is Elite-only. Gate on the merchant's
  -- tier, not the caller — a Standard merchant is rejected even when an
  -- admin or service_role acts on their behalf, and even if the RPC is
  -- called directly with the UI button hidden.
  IF v_tier IS DISTINCT FROM 'elite' THEN
    RAISE EXCEPTION 'BOOST_ELITE_ONLY: Boost is available to Elite merchants only';
  END IF;

  SELECT value::NUMERIC INTO v_fee FROM public.app_config WHERE key = 'boost_fee_kes';
  IF v_fee IS NULL OR v_fee <= 0 THEN
    v_fee := 500;
  END IF;

  SELECT d.id, d.is_active, d.expires_at, d.boost_active INTO v_deal
    FROM public.deals d
    WHERE d.id = p_deal_id AND d.merchant_id = p_merchant_id
    FOR UPDATE OF d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found';
  END IF;
  IF v_deal.is_active IS NOT TRUE OR (v_deal.expires_at IS NOT NULL AND v_deal.expires_at <= NOW()) THEN
    RAISE EXCEPTION 'deal_not_active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.boost_flags bf
    WHERE bf.deal_id = p_deal_id AND bf.is_active = TRUE AND bf.ends_at > NOW()
  ) THEN
    RAISE EXCEPTION 'boost_already_active';
  END IF;

  -- Atomic debit: single guarded UPDATE (same pattern as
  -- deduct_success_fee_or_record_arrears, but boosts hard-fail on
  -- insufficient balance instead of recording arrears).
  UPDATE public.merchants
    SET account_balance = account_balance - v_fee, updated_at = NOW()
    WHERE id = p_merchant_id AND account_balance >= v_fee
    RETURNING account_balance INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO public.boost_flags (deal_id, merchant_id, boost_fee, is_active, starts_at, ends_at)
  VALUES (p_deal_id, p_merchant_id, v_fee, TRUE, NOW(), v_ends_at)
  RETURNING id INTO v_boost_id;

  INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description, reference_id)
  VALUES (p_merchant_id, -v_fee, 'boost_fee', 'manual', 'Boost · 24h Priority Placement', p_deal_id);

  UPDATE public.deals SET boost_active = TRUE, updated_at = NOW() WHERE id = p_deal_id;

  RETURN QUERY SELECT v_boost_id, v_balance, v_ends_at;
END;
$function$;

-- move_boost — add the same Elite-only gate (all other logic identical to
-- 20260709175532_deal_pause_boosts_staff.sql).
CREATE OR REPLACE FUNCTION public.move_boost(
  p_merchant_id uuid,
  p_from_deal_id uuid,
  p_to_deal_id uuid
)
RETURNS TABLE (
  boost_id uuid,
  boost_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
  v_tier TEXT;
  v_flag RECORD;
BEGIN
  SELECT user_id, tier INTO v_owner_user_id, v_tier
    FROM public.merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' AND v_caller_id IS DISTINCT FROM v_owner_user_id THEN
      RAISE EXCEPTION 'unauthorized: not merchant owner or admin';
    END IF;
  END IF;

  -- Frozen rule (CLAUDE.md): Boost is Elite-only. Only Elite merchants may
  -- move/reassign a boost window. Gate on tier, not caller (see purchase_boost).
  IF v_tier IS DISTINCT FROM 'elite' THEN
    RAISE EXCEPTION 'BOOST_ELITE_ONLY: Boost is available to Elite merchants only';
  END IF;

  SELECT bf.id, bf.ends_at INTO v_flag
    FROM public.boost_flags bf
    WHERE bf.deal_id = p_from_deal_id
      AND bf.merchant_id = p_merchant_id
      AND bf.is_active = TRUE
      AND bf.ends_at > NOW()
    ORDER BY bf.ends_at DESC
    LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_active_boost';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = p_to_deal_id AND d.merchant_id = p_merchant_id
      AND d.is_active = TRUE AND (d.expires_at IS NULL OR d.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'target_deal_not_active';
  END IF;

  UPDATE public.boost_flags SET deal_id = p_to_deal_id WHERE id = v_flag.id;
  UPDATE public.deals SET boost_active = FALSE, updated_at = NOW() WHERE id = p_from_deal_id;
  UPDATE public.deals SET boost_active = TRUE, updated_at = NOW() WHERE id = p_to_deal_id;

  RETURN QUERY SELECT v_flag.id, v_flag.ends_at;
END;
$function$;

-- Grants are preserved across CREATE OR REPLACE (authenticated + service_role,
-- locked 2026-07-10). Refresh the function comments to record the Elite gate.
COMMENT ON FUNCTION public.purchase_boost(uuid, uuid) IS
  'Atomic 24h boost purchase: Elite-only gate + wallet debit + boost_flags + ledger entry + deals.boost_active. SECURITY DEFINER, self-authorizing (merchant owner or admin; service_role bypass on caller auth only). Elite gate (2026-07-15) checks merchants.tier and is NOT bypassed by admin/service_role — non-Elite raises BOOST_ELITE_ONLY. Grants: authenticated + service_role only.';
COMMENT ON FUNCTION public.move_boost(uuid, uuid, uuid) IS
  'Reassign remaining boost window to another deal of the same merchant. Elite-only (2026-07-15): non-Elite raises BOOST_ELITE_ONLY. SECURITY DEFINER, self-authorizing (merchant owner or admin; service_role bypass on caller auth only). Grants: authenticated + service_role only.';
