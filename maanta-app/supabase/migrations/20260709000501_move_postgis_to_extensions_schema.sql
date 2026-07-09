-- Clears two Supabase security lints in one move:
--   * extension_in_public (postgis installed in public)
--   * rls_disabled_in_public on public.spatial_ref_sys (owned by
--     supabase_admin, so RLS cannot be enabled by the postgres role; moving
--     the whole extension to the "extensions" schema takes spatial_ref_sys
--     out of the PostgREST-exposed public schema entirely).
--
-- postgis is not relocatable (ALTER EXTENSION ... SET SCHEMA is refused),
-- so this is a drop/recreate. Safe ONLY because the database is pre-launch
-- and empty: the sole dependents are the empty redemptions.consumer_gps
-- column and the claim_deal / guardian_check functions, which are recreated
-- below byte-for-byte except geography is now schema-qualified.

ALTER TABLE public.redemptions DROP COLUMN consumer_gps;
DROP FUNCTION public.claim_deal(uuid, uuid, text, public.geography);
DROP FUNCTION public.guardian_check(uuid, uuid, text, public.geography, text, numeric);
DROP EXTENSION postgis;
CREATE EXTENSION postgis SCHEMA extensions;

ALTER TABLE public.redemptions ADD COLUMN consumer_gps extensions.geography;

CREATE FUNCTION public.claim_deal(p_user_id uuid, p_deal_id uuid, p_consumer_device_id text DEFAULT NULL::text, p_consumer_gps extensions.geography DEFAULT NULL::extensions.geography)
 RETURNS TABLE(redemption_id uuid, otp_code text, redemption_expires_at timestamp with time zone, deal_id uuid, deal_title text, deal_image_url text, merchant_id uuid, merchant_name text, what3words_address text, floor text, unit_number text)
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

CREATE FUNCTION public.guardian_check(p_merchant_id uuid, p_user_id uuid, p_consumer_device text, p_consumer_gps extensions.geography, p_merchant_device text, p_distance_m numeric)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_flags TEXT[] := '{}'; v_velocity INTEGER; v_agent_device TEXT;
BEGIN
  SELECT COUNT(*) INTO v_velocity FROM public.redemptions
    WHERE consumer_device_id=p_consumer_device AND redeemed_at >= NOW() - INTERVAL '10 minutes';
  IF v_velocity >= 10 THEN
    v_flags := array_append(v_flags,'velocity');
    INSERT INTO public.fraud_events (merchant_id,user_id,event_type,severity,details)
    VALUES (p_merchant_id,p_user_id,'velocity','high',jsonb_build_object('count_in_10min',v_velocity,'device_id',p_consumer_device));
  END IF;
  IF p_distance_m IS NOT NULL AND p_distance_m > 500 THEN
    v_flags := array_append(v_flags,'geofence');
    INSERT INTO public.fraud_events (merchant_id,user_id,event_type,severity,details)
    VALUES (p_merchant_id,p_user_id,'geofence','medium',jsonb_build_object('distance_m',p_distance_m));
  END IF;
  SELECT u.device_id INTO v_agent_device FROM public.agents a JOIN public.users u ON u.id=a.user_id
    WHERE u.device_id=p_consumer_device LIMIT 1;
  IF v_agent_device IS NOT NULL THEN
    v_flags := array_append(v_flags,'collusion');
    INSERT INTO public.fraud_events (merchant_id,user_id,event_type,severity,details)
    VALUES (p_merchant_id,p_user_id,'collusion','high',jsonb_build_object('shared_device_id',p_consumer_device));
  END IF;
  IF 'velocity' = ANY(v_flags) OR 'collusion' = ANY(v_flags) THEN
    UPDATE public.merchants SET trust_metric=GREATEST(trust_metric-0.2,0.0),updated_at=NOW() WHERE id=p_merchant_id;
    PERFORM public.recalculate_trust_metric(p_merchant_id);
  END IF;
  RETURN v_flags;
END;
$function$;

-- Restore the pre-move ACLs exactly:
--   claim_deal: postgres, authenticated, service_role
--   guardian_check: postgres, service_role
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO service_role;

REVOKE ALL ON FUNCTION public.guardian_check(uuid, uuid, text, extensions.geography, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_check(uuid, uuid, text, extensions.geography, text, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.guardian_check(uuid, uuid, text, extensions.geography, text, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_check(uuid, uuid, text, extensions.geography, text, numeric) TO service_role;
