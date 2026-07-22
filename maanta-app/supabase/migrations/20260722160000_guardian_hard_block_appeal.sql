-- ============================================================================
-- MAANTA — Guardian v1: hard-block appeals (hard-blocks are no longer terminal)
-- Design note: docs/maanta-guardian-v1.md §3
--
-- Guardian v1 hard-blocks DECLINE a redemption at the counter (status='failed',
-- fraud_flags @> {guardian_hard_block}, NO fee moved). Until now that was
-- terminal. This adds the admin appeal path: after the fact an admin can
-- overturn a false-positive decline (complete it + apply the KES 30 fee through
-- the frozen money path) or uphold the block (leave it failed, no fee).
--
-- Mirrors admin_release_redemption (the soft-block release) exactly, except the
-- starting state is a hard-blocked 'failed' redemption instead of a 'flagged'
-- (held) one. Money discipline is identical: success is committed before the
-- fee step and never rolled back by a fee failure; feeChargeStatus stays the
-- frozen {charged, owed, unknown}. No money-path or schema change; guards make
-- it impossible to "complete" a redemption that failed for any OTHER reason
-- (expired, merchant-rejected, …) or to appeal the same one twice.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_appeal_hard_block(
  p_redemption_id uuid,
  p_approve boolean
)
RETURNS TABLE(
  redemption_id uuid,
  redemption_status text,
  fee_charge_status text,
  fee_amount numeric,
  new_balance numeric,
  new_arrears numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role TEXT := public.current_user_role();
  v_redemption RECORD;
  v_fee_result RECORD;
  v_fee_status TEXT;
  v_fee_amount NUMERIC;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_fee_err TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  -- Appealable == a Guardian HARD-BLOCK decline that has not already been
  -- appeal-rejected. A NULL/other-cause failure never matches (@> is NULL-safe
  -- false), so a plain expired/rejected redemption can't be completed here.
  SELECT * INTO v_redemption
    FROM public.redemptions
    WHERE id = p_redemption_id
      AND status = 'failed'
      AND fraud_flags @> ARRAY['guardian_hard_block']
      AND NOT (COALESCE(fraud_flags, '{}') @> ARRAY['guardian_appeal_rejected'])
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_not_appealable';
  END IF;

  -- Uphold the block: leave it failed, no fee. Durable marker + close review.
  IF NOT p_approve THEN
    UPDATE public.redemptions
      SET review_required = false,
          fraud_flags = array_append(COALESCE(fraud_flags, '{}'), 'guardian_appeal_rejected')
      WHERE id = v_redemption.id AND status = 'failed';
    RETURN QUERY SELECT v_redemption.id, 'failed'::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- Overturn: complete the redemption. Success is committed BEFORE the fee step
  -- and never rolled back by a fee failure (same guarantee as verify_redemption
  -- / admin_release_redemption).
  UPDATE public.redemptions
    SET status = 'success', review_required = false, redeemed_at = NOW(),
        fraud_flags = array_append(COALESCE(fraud_flags, '{}'), 'guardian_appeal_approved')
    WHERE id = v_redemption.id AND status = 'failed';

  BEGIN
    PERFORM public.increment_deal_claims(v_redemption.deal_id);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    SELECT f.charged, f.new_balance, f.new_arrears
      INTO v_fee_result
      FROM public.deduct_success_fee_or_record_arrears(v_redemption.merchant_id, v_redemption.success_fee_charged, v_redemption.id) AS f;
    v_fee_status  := CASE WHEN v_fee_result.charged THEN 'charged' ELSE 'owed' END;
    v_fee_amount  := v_redemption.success_fee_charged;
    v_new_balance := v_fee_result.new_balance;
    v_new_arrears := v_fee_result.new_arrears;
  EXCEPTION WHEN OTHERS THEN
    v_fee_err := SQLERRM;
    v_fee_status := 'unknown';
    v_fee_amount := v_redemption.success_fee_charged;
    v_new_balance := NULL;
    v_new_arrears := NULL;
    BEGIN
      INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
      VALUES (v_redemption.merchant_id, 'fraud_review', 'high',
        format('feeChargeStatus=unknown on appeal-approved redemption %s: fee step failed (%s).', v_redemption.id, coalesce(v_fee_err, 'no error message')));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN QUERY SELECT v_redemption.id, 'success'::TEXT, v_fee_status, v_fee_amount, v_new_balance, v_new_arrears;
END;
$function$;

COMMENT ON FUNCTION public.admin_appeal_hard_block IS
  'Admin appeal for a Guardian HARD-BLOCK decline (docs/maanta-guardian-v1.md §3). approve → failed→success + KES 30 fee via the frozen 3-state money path; reject → stays failed, no fee, marked guardian_appeal_rejected. Only a status=failed redemption flagged guardian_hard_block and not already appeal-rejected is appealable. Admin only.';

REVOKE ALL ON FUNCTION public.admin_appeal_hard_block(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_appeal_hard_block(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_appeal_hard_block(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_appeal_hard_block(uuid, boolean) TO service_role, postgres;
