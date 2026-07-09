-- Fix: claim_deal's RETURNS TABLE output column "deal_id" shadowed the bare
-- "deal_id" column reference inside the duplicate-pending-claim guard's WHERE
-- clause, causing a 42702 ambiguous-column error on every call. Caught by
-- smoke test during the Build session, before deployment to app code.
CREATE OR REPLACE FUNCTION public.claim_deal(
  p_user_id uuid,
  p_deal_id uuid,
  p_consumer_device_id text DEFAULT NULL,
  p_consumer_gps geography DEFAULT NULL
)
RETURNS TABLE (
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
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: no authenticated caller identity';
    END IF;
    IF v_caller_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT d.id, d.merchant_id, d.title, d.image_url, d.is_active, d.expires_at,
         d.max_claims, d.claims_count, d.success_fee,
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

  -- FIX: qualified public.redemptions.deal_id explicitly (was bare "deal_id",
  -- ambiguous against this function's own OUT parameter of the same name).
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

  LOOP
    v_attempts := v_attempts + 1;
    v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

    BEGIN
      INSERT INTO public.redemptions (
        deal_id, merchant_id, user_id, otp_code,
        success_fee_charged, consumer_device_id, consumer_gps,
        status, expires_at
      )
      VALUES (
        p_deal_id, v_deal.merchant_id, p_user_id, v_otp,
        v_deal.success_fee, p_consumer_device_id, p_consumer_gps,
        'pending', v_deal.expires_at + INTERVAL '15 minutes'
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

COMMENT ON FUNCTION public.claim_deal IS
  'Shopper claim path. WALKTHROUGH.md Step 5. redemption.expires_at = deal.expires_at + 15min (frozen, DECISIONS_LOG 2026-06-30 supersession). SECURITY DEFINER: caller must equal p_user_id unless service_role. Patched 2026-07-02: qualified redemptions.deal_id to resolve ambiguity against this function''s own OUT parameter.';

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, geography) TO authenticated, service_role, postgres;
