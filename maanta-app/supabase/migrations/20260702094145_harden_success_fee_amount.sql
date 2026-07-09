-- ============================================================================
-- MAANTA — Security session: pin the success fee amount server-side.
-- Authority: DECISIONS_LOG.md ("KES 30 success fee per verified redemption on
-- ALL plans" — no price-review caveat, unlike Elite subscription). Closes the
-- residual risk flagged in the prior Security session ("p_amount not bounded
-- server-side in the fee function"), which was dormant until this Build
-- session wired verify_redemption -> deduct_success_fee_or_record_arrears
-- into the live commerce loop.
--
-- Two layers, both scoped tightly to the success fee only (not boost_fee,
-- not subscription — those are separate flows, out of scope here):
--   1. deals.success_fee is forced to the canonical app_config value on every
--      INSERT/UPDATE, regardless of what a merchant's client sends — closes
--      the exploit path (deals RLS policy is unrestricted ALL, no WITH CHECK,
--      no prior CHECK constraint pinning the value).
--   2. deduct_success_fee_or_record_arrears now rejects any p_amount that
--      does not match the canonical value — defense in depth for any future
--      caller, not just verify_redemption.
-- ============================================================================

-- Canonical value, governance-managed (same pattern as node0_launch_period_ends_at)
-- so a future price change is a data update, not a code migration.
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'success_fee_kes',
  '30.00',
  'Frozen per-verified-redemption success fee, KES. Charged on ALL plans (Standard and Elite) at point of merchant verification. PROJECT_RULES.md / DECISIONS_LOG.md. No price-review caveat (unlike the Elite subscription, which is under Oct 2026 review) — change only on an explicit new DECISIONS_LOG.md entry.'
)
ON CONFLICT (key) DO NOTHING;

-- Layer 1: pin deals.success_fee at the row level, unconditionally.
CREATE OR REPLACE FUNCTION public.enforce_deal_success_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fee NUMERIC;
BEGIN
  SELECT value::NUMERIC INTO v_fee FROM public.app_config WHERE key = 'success_fee_kes';

  IF v_fee IS NULL THEN
    v_fee := 30.00; -- hard fallback matching PROJECT_RULES.md if config row is ever missing
  END IF;

  NEW.success_fee := v_fee;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_deal_success_fee_trigger ON public.deals;
CREATE TRIGGER enforce_deal_success_fee_trigger
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_deal_success_fee();

COMMENT ON FUNCTION public.enforce_deal_success_fee IS
  'Security hardening 2026-07-02: forces deals.success_fee to the canonical app_config.success_fee_kes value on every write, regardless of client input. Closes a merchant-side fee-tampering path (deals RLS policy is unrestricted ALL with no WITH CHECK). SECURITY DEFINER because app_config is admin-only under RLS.';

-- Backfill: no-op today (0 deals rows at time of writing) but safe to run
-- unconditionally so this migration is correct regardless of when it runs.
UPDATE public.deals
  SET success_fee = (SELECT value::NUMERIC FROM public.app_config WHERE key = 'success_fee_kes')
  WHERE success_fee IS DISTINCT FROM (SELECT value::NUMERIC FROM public.app_config WHERE key = 'success_fee_kes');

-- Layer 2: bound the fee function itself — defense in depth for any future
-- caller, not just verify_redemption. This function is success-fee-specific
-- (its own INSERT statements hardcode transaction_type = 'success_fee' /
-- 'success_fee_arrears'), so pinning p_amount to the canonical value is
-- correct, not a scope narrowing of a general-purpose function.
CREATE OR REPLACE FUNCTION public.deduct_success_fee_or_record_arrears(p_merchant_id uuid, p_amount numeric)
 RETURNS TABLE(charged boolean, new_balance numeric, new_arrears numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_charged BOOLEAN;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
  v_canonical_fee NUMERIC;
BEGIN
  SELECT user_id INTO v_owner_user_id FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' AND v_caller_id IS DISTINCT FROM v_owner_user_id THEN
      RAISE EXCEPTION 'unauthorized: not merchant owner or admin';
    END IF;
  END IF;

  -- NEW: reject any amount that doesn't match the canonical platform fee.
  -- This is the "p_amount not bounded server-side" fix.
  SELECT value::NUMERIC INTO v_canonical_fee FROM public.app_config WHERE key = 'success_fee_kes';
  IF v_canonical_fee IS NULL THEN
    v_canonical_fee := 30.00; -- hard fallback matching PROJECT_RULES.md
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: p_amount must be positive';
  END IF;

  IF p_amount IS DISTINCT FROM v_canonical_fee THEN
    RAISE EXCEPTION 'invalid_amount: p_amount (%) does not match the platform success fee (%)', p_amount, v_canonical_fee;
  END IF;

  UPDATE public.merchants
    SET account_balance = account_balance - p_amount, updated_at = NOW()
    WHERE id = p_merchant_id AND account_balance >= p_amount
    RETURNING account_balance, outstanding_arrears INTO v_new_balance, v_new_arrears;
  IF FOUND THEN
    v_charged := TRUE;
    INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description)
    VALUES (p_merchant_id, -p_amount, 'success_fee', 'manual', 'Success fee deducted on verified redemption');
    RETURN QUERY SELECT v_charged, v_new_balance, v_new_arrears;
    RETURN;
  END IF;
  UPDATE public.merchants
    SET outstanding_arrears = outstanding_arrears + p_amount, updated_at = NOW()
    WHERE id = p_merchant_id
    RETURNING account_balance, outstanding_arrears INTO v_new_balance, v_new_arrears;
  v_charged := FALSE;
  INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description)
  VALUES (p_merchant_id, p_amount, 'success_fee_arrears', 'manual', 'Success fee recorded as arrears — insufficient wallet balance');
  RETURN QUERY SELECT v_charged, v_new_balance, v_new_arrears;
END;
$function$;

COMMENT ON FUNCTION public.deduct_success_fee_or_record_arrears IS
  'Security hardening 2026-07-02: p_amount must now exactly match app_config.success_fee_kes (defense in depth — this function is success-fee-specific, not general-purpose billing). Ownership check unchanged from prior hardening pass.';

REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric) TO authenticated, service_role, postgres;
