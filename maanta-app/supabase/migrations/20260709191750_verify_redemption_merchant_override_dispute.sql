-- ============================================================
-- Back-port (2026-07-10): this migration was applied to the live
-- database on 2026-07-09 as version 20260709191750 but was never
-- committed to the repo. This file mirrors the live definition
-- verbatim so the version-controlled migration history matches
-- the live migration table. Do not edit the function body here —
-- if behavior must change, write a NEW migration.
--
-- What it does (verify-anyway / disputes wiring, decisions log):
--   * verify_redemption gains p_override / p_override_reason
--     (defaulted, so existing 3-arg callers keep working) and a
--     `disputed` return column.
--   * Flagged redemptions (review_required or fraud_flags) still
--     verify — the shopper is never blocked at the counter — but
--     the row is atomically marked review_required, an override
--     appends 'merchant_override' to fraud_flags, and a
--     fraud_events row + high-priority 'dispute_review' agent_task
--     are written best-effort for the admin /admin/support queue.
-- ============================================================

-- Signature changes from (uuid, text, text): drop the old overload.
DROP FUNCTION IF EXISTS public.verify_redemption(uuid, text, text);

CREATE OR REPLACE FUNCTION public.verify_redemption(p_merchant_id uuid, p_otp_code text, p_merchant_device_id text DEFAULT NULL::text, p_override boolean DEFAULT false, p_override_reason text DEFAULT NULL::text)
 RETURNS TABLE(redemption_id uuid, redemption_status text, fee_charge_status text, fee_amount numeric, new_balance numeric, new_arrears numeric, deal_id uuid, deal_claims_count integer, disputed boolean)
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
  v_has_flags BOOLEAN;
  v_disputed BOOLEAN := false;
  v_event_type TEXT;
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

  v_has_flags := v_redemption.review_required
                 OR COALESCE(array_length(v_redemption.fraud_flags, 1), 0) > 0;

  -- Verification itself is unchanged: flagged redemptions still verify
  -- (never block the shopper). The dispute marking below is atomic with it.
  UPDATE public.redemptions
    SET status = 'success',
        merchant_device_id = p_merchant_device_id,
        redeemed_at = NOW(),
        review_required = CASE WHEN v_has_flags THEN true ELSE review_required END,
        fraud_flags = CASE
          WHEN v_has_flags AND p_override
            THEN array_append(COALESCE(fraud_flags, '{}'), 'merchant_override')
          ELSE fraud_flags
        END
    WHERE id = v_redemption.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_already_verified';
  END IF;

  -- Dispute escalation: primary audit marker (review_required + fraud_flags)
  -- is already committed atomically above. fraud_events + agent_tasks are the
  -- routing layer; best-effort so escalation-write failure never blocks the
  -- shopper (same pattern as the D-003 fee-unknown task).
  IF v_has_flags THEN
    v_disputed := true;
    v_event_type := CASE
      WHEN p_override THEN 'merchant_override'
      WHEN v_redemption.fraud_flags @> ARRAY['geofence'] THEN 'geofence'
      WHEN v_redemption.fraud_flags @> ARRAY['velocity'] THEN 'velocity'
      ELSE 'merchant_override'
    END;
    BEGIN
      INSERT INTO public.fraud_events (merchant_id, user_id, event_type, severity, details)
      VALUES (
        p_merchant_id,
        v_redemption.user_id,
        v_event_type,
        'medium',
        jsonb_build_object(
          'redemption_id', v_redemption.id,
          'deal_id', v_redemption.deal_id,
          'fraud_flags', to_jsonb(COALESCE(v_redemption.fraud_flags, '{}')),
          'distance_from_shop', v_redemption.distance_from_shop,
          'merchant_override', p_override,
          'override_reason', p_override_reason,
          'verified_by_user', v_caller_id
        )
      );

      INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
      VALUES (
        p_merchant_id,
        'dispute_review',
        'high',
        format(
          'Disputed verification on redemption %s (deal %s). Flags: %s. Distance: %s m. Merchant override: %s%s. Redemption completed and fee applied per frozen rules - review outcome; handle directly or delegate via assigned_to.',
          v_redemption.id,
          v_redemption.deal_id,
          array_to_string(COALESCE(v_redemption.fraud_flags, '{}'), ', '),
          COALESCE(v_redemption.distance_from_shop::text, 'n/a'),
          p_override,
          COALESCE('. Reason: ' || p_override_reason, '')
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- redemption row already carries review_required=true as durable audit marker
    END;
  END IF;

  BEGIN
    v_new_claims_count := public.increment_deal_claims(v_redemption.deal_id);
  EXCEPTION WHEN OTHERS THEN
    v_new_claims_count := NULL;
  END;

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
    v_new_claims_count,
    v_disputed;
END;
$function$;

-- Grants match live: authenticated + service_role only (no PUBLIC/anon).
REVOKE ALL ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) TO service_role;
