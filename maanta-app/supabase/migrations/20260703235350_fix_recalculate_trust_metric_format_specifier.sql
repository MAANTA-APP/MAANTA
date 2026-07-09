-- Corrective migration (pre-existing defect, surfaced by the D-003 test harness
-- same session). PostgreSQL format() does not support C-style '%.3f' — the
-- retraining-task INSERT in recalculate_trust_metric() raised
-- 'unrecognized format() type specifier' whenever a merchant's trust fell below
-- 0.50, crashing the entire verify_redemption trigger chain (AFTER UPDATE on
-- redemptions -> update_kpi_counters -> recalculate_trust_metric).
-- Fix: '%s' + round(v_new_trust, 3). No other logic changed.

CREATE OR REPLACE FUNCTION public.recalculate_trust_metric(p_merchant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    VALUES (p_merchant_id,'retraining','high',format('Trust fell to %s. Merchant hidden.',round(v_new_trust,3)));
  END IF;
END;
$function$;
