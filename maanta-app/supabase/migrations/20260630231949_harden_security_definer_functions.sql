-- Harden all SECURITY DEFINER functions: pin search_path, restrict EXECUTE

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT id FROM public.users WHERE auth_uid = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT role FROM public.users WHERE auth_uid = auth.uid() LIMIT 1; $$;

REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (auth_uid, phone, role)
  VALUES (NEW.id, NEW.phone, 'customer')
  ON CONFLICT (auth_uid) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.recalculate_trust_metric(p_merchant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_30d INTEGER; v_success_30d INTEGER; v_flagged_30d INTEGER;
  v_r NUMERIC; v_a NUMERIC; v_f NUMERIC; v_new_trust NUMERIC; v_old_trust NUMERIC;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status='success'), COUNT(*) FILTER (WHERE status='flagged')
  INTO v_total_30d, v_success_30d, v_flagged_30d
  FROM public.redemptions WHERE merchant_id=p_merchant_id AND redeemed_at >= NOW() - INTERVAL '30 days';
  v_r := CASE WHEN v_total_30d=0 THEN 1.0 ELSE LEAST(v_success_30d::NUMERIC/v_total_30d,1.0) END;
  SELECT COALESCE(AVG(composite_score),1.0) INTO v_a FROM public.audit_logs
    WHERE merchant_id=p_merchant_id AND audited_at >= NOW() - INTERVAL '90 days';
  v_f := CASE WHEN v_total_30d=0 THEN 0.0 ELSE LEAST(v_flagged_30d::NUMERIC/v_total_30d,1.0) END;
  v_new_trust := LEAST(GREATEST((0.5*v_r)+(0.3*v_a)-(0.2*v_f),0.0),1.0);
  SELECT trust_metric INTO v_old_trust FROM public.merchants WHERE id=p_merchant_id;
  UPDATE public.merchants SET
    trust_metric = v_new_trust,
    is_visible   = CASE WHEN v_new_trust < 0.50 THEN FALSE ELSE TRUE END,
    is_featured  = CASE WHEN v_new_trust > 0.90 THEN TRUE ELSE FALSE END,
    updated_at   = NOW()
  WHERE id=p_merchant_id;
  IF v_new_trust < 0.50 AND (v_old_trust IS NULL OR v_old_trust >= 0.50) THEN
    INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
    VALUES (p_merchant_id,'retraining','high',FORMAT('Trust fell to %.3f. Merchant hidden.',v_new_trust));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recalculate_trust_metric(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.guardian_check(
  p_merchant_id UUID, p_user_id UUID, p_consumer_device TEXT,
  p_consumer_gps GEOGRAPHY, p_merchant_device TEXT, p_distance_m NUMERIC
)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.guardian_check(UUID,UUID,TEXT,GEOGRAPHY,TEXT,NUMERIC) FROM PUBLIC;
