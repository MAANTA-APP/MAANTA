-- D-003: feeChargeStatus = "unknown" must create an admin-visible agent_tasks row
-- (task_type = 'fraud_review', priority = 'high'), per DECISIONS_LOG.md 2026-07-03
-- (confirmed by Mohamed Elmi). Only the fee-block EXCEPTION handler changes; the
-- rest of the body is byte-identical to the deployed version. Signature unchanged,
-- so CREATE OR REPLACE replaces in place (no overload) and existing ACLs carry over.
-- The task INSERT is wrapped in its own nested exception block: a failed flag write
-- must NEVER block the redemption (frozen 2026-06-30: redemption always succeeds).

CREATE OR REPLACE FUNCTION public.verify_redemption(p_merchant_id uuid, p_otp_code text, p_merchant_device_id text DEFAULT NULL::text)
 RETURNS TABLE(redemption_id uuid, redemption_status text, fee_charge_status text, fee_amount numeric, new_balance numeric, new_arrears numeric, deal_id uuid, deal_claims_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
  v_redemption RECORD;
  v_fee_result RECORD;
  v_fee_status TEXT;
  v_fee_amount NUMERIC;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_new_claims_count INTEGER;
  v_fee_err TEXT;
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

  SELECT * INTO v_redemption
    FROM public.redemptions
    WHERE merchant_id = p_merchant_id
      AND otp_code = p_otp_code
      AND status = 'pending'
    ORDER BY redeemed_at DESC
    LIMIT 1
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_not_found_or_already_used';
  END IF;

  IF v_redemption.expires_at < NOW() THEN
    UPDATE public.redemptions
      SET status = 'failed'
      WHERE id = v_redemption.id AND status = 'pending';
    RAISE EXCEPTION 'redemption_expired';
  END IF;

  UPDATE public.redemptions
    SET status = 'success',
        merchant_device_id = p_merchant_device_id,
        redeemed_at = NOW()
    WHERE id = v_redemption.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_already_verified';
  END IF;

  BEGIN
    v_new_claims_count := public.increment_deal_claims(v_redemption.deal_id);
  EXCEPTION WHEN OTHERS THEN
    v_new_claims_count := NULL;
  END;

  -- FIX: aliased the function call as f(...) and qualified every column with
  -- f. — was previously bare "new_balance"/"new_arrears", ambiguous against
  -- this function's own OUT parameters of the same name.
  BEGIN
    SELECT f.charged, f.new_balance, f.new_arrears
      INTO v_fee_result
      FROM public.deduct_success_fee_or_record_arrears(p_merchant_id, v_redemption.success_fee_charged) AS f;

    v_fee_status  := CASE WHEN v_fee_result.charged THEN 'charged' ELSE 'owed' END;
    v_fee_amount  := v_redemption.success_fee_charged;
    v_new_balance := v_fee_result.new_balance;
    v_new_arrears := v_fee_result.new_arrears;
  EXCEPTION WHEN OTHERS THEN
    v_fee_err     := SQLERRM;
    v_fee_status  := 'unknown';
    v_fee_amount  := v_redemption.success_fee_charged;
    v_new_balance := NULL;
    v_new_arrears := NULL;

    -- D-003 (DECISIONS_LOG.md 2026-07-03): "unknown" is a fee-mechanism failure,
    -- not an ordinary insufficient-balance arrears case — it needs eyes on it.
    -- Route to agent_tasks as fraud_review / high (revenue-integrity bucket).
    BEGIN
      INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
      VALUES (
        p_merchant_id,
        'fraud_review',
        'high',
        format(
          'feeChargeStatus=unknown on redemption %s: fee step failed (%s). Success fee KES %s was neither charged nor recorded as arrears - investigate and reconcile against the merchant_transactions ledger.',
          v_redemption.id, coalesce(v_fee_err, 'no error message'), v_redemption.success_fee_charged
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Flagging must never block the shopper. If even the task write fails,
      -- the redemption still returns success with fee_charge_status = 'unknown'.
      NULL;
    END;
  END;

  RETURN QUERY
  SELECT
    v_redemption.id,
    'success'::TEXT,
    v_fee_status,
    v_fee_amount,
    v_new_balance,
    v_new_arrears,
    v_redemption.deal_id,
    v_new_claims_count;
END;
$function$;
