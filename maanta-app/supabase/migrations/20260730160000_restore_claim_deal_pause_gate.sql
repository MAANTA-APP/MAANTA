-- E2E readiness: restore the paused-deal claim gate.
--
-- Migration 20260709175532 added `is_paused` and raised `deal_paused` in
-- claim_deal. Security hardening 20260720120000 rewrote claim_deal and dropped
-- that check, so a paused deal could still accept new claims even though the
-- merchant UI says "No new claims while paused."
--
-- Surgical restore: keep the current claim_deal body, re-select is_paused, and
-- raise deal_paused after the active check.

CREATE OR REPLACE FUNCTION public.claim_deal(
  p_user_id uuid,
  p_deal_id uuid,
  p_consumer_device_id text DEFAULT NULL::text,
  p_consumer_gps extensions.geography DEFAULT NULL::extensions.geography
)
 RETURNS TABLE(
  redemption_id uuid,
  otp_code text,
  redemption_expires_at timestamptz,
  deal_id uuid,
  deal_title text,
  deal_image_url text,
  merchant_id uuid,
  merchant_name text,
  what3words_address text,
  floor text,
  unit_number text
)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_deal RECORD;
  v_otp TEXT;
  v_redemption_id UUID;
  v_attempts INT := 0;
  v_existing_pending UUID;
  v_amount_kes NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;
    IF v_caller_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT d.id, d.merchant_id, d.title, d.image_url, d.is_active, d.is_paused, d.expires_at,
         d.max_claims, d.claims_count, d.success_fee,
         d.price_kes, d.charges,
         m.status AS merchant_status, m.is_visible, m.is_shadow_banned,
         m.merchant_name, m.what3words_address, m.floor, m.unit_number
    INTO v_deal
    FROM public.deals d
    JOIN public.merchants m ON m.id = d.merchant_id
    WHERE d.id = p_deal_id
    FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found';
  END IF;

  IF v_deal.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'deal_not_active';
  END IF;

  -- Wireframe 10ab / merchant UI: paused deals accept no new claims.
  -- Already-claimed codes stay valid until expiry.
  IF v_deal.is_paused IS TRUE THEN
    RAISE EXCEPTION 'deal_paused';
  END IF;

  IF v_deal.expires_at IS NOT NULL AND v_deal.expires_at <= NOW() THEN
    RAISE EXCEPTION 'deal_expired';
  END IF;

  IF v_deal.merchant_status IS DISTINCT FROM 'active'
     OR v_deal.is_visible IS NOT TRUE
     OR v_deal.is_shadow_banned IS TRUE THEN
    RAISE EXCEPTION 'merchant_not_available';
  END IF;

  IF v_deal.max_claims IS NOT NULL AND v_deal.claims_count >= v_deal.max_claims THEN
    RAISE EXCEPTION 'deal_claim_limit_reached';
  END IF;

  SELECT r.id INTO v_existing_pending
    FROM public.redemptions r
    WHERE r.deal_id = p_deal_id
      AND r.user_id = p_user_id
      AND r.status = 'pending'
      AND r.expires_at > NOW()
    LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'active_claim_already_exists: %', v_existing_pending;
  END IF;

  v_amount_kes := public.you_pay_kes(v_deal.price_kes, v_deal.charges);

  LOOP
    v_attempts := v_attempts + 1;
    v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

    BEGIN
      INSERT INTO public.redemptions (
        deal_id, merchant_id, user_id, otp_code,
        success_fee_charged, consumer_device_id, consumer_gps,
        status, expires_at, amount_kes
      )
      VALUES (
        p_deal_id, v_deal.merchant_id, p_user_id, v_otp,
        v_deal.success_fee, p_consumer_device_id, p_consumer_gps,
        'pending', v_deal.expires_at + INTERVAL '15 minutes', v_amount_kes
      )
      RETURNING id INTO v_redemption_id;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'otp_generation_failed: too many collisions';
      END IF;
    END;
  END LOOP;

  RETURN QUERY
  SELECT
    v_redemption_id,
    v_otp,
    v_deal.expires_at + INTERVAL '15 minutes',
    v_deal.id,
    v_deal.title,
    v_deal.image_url,
    v_deal.merchant_id,
    v_deal.merchant_name,
    v_deal.what3words_address,
    v_deal.floor,
    v_deal.unit_number;
END;
$function$;

COMMENT ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) IS
  'Claim a live deal: OTP + 15-minute grace after deal expiry. Rejects paused deals (deal_paused). service_role or matching authenticated caller only.';

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO authenticated, service_role, postgres;
