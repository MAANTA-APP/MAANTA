-- ============================================================================
-- MAANTA — Guardian v1: make thresholds tunable via app_config
-- Design note: docs/maanta-guardian-v1.md §2
--
-- Promotes the velocity/geofence/collusion thresholds out of hardcoded
-- constants in guardian_evaluate and into a single app_config JSON row
-- (`guardian_thresholds`), so ops can tune Guardian live without a redeploy —
-- the same pattern as success_fee_kes / node0_* config.
--
-- Safety:
--   * Every threshold reads from the config with a HARDCODED FALLBACK equal to
--     the current value, so a missing key falls back to the shipped default.
--   * A missing or MALFORMED config row falls back to defaults (never to
--     "clear everything") — the read is wrapped so bad JSON can't fail Guardian
--     open. guardian_evaluate is otherwise byte-for-byte unchanged (same
--     signature → CREATE OR REPLACE; same checks, bands, events, and return).
-- No money-path or schema changes.
-- ============================================================================

-- 1) Seed the tunable defaults (matches docs/maanta-guardian-v1.md §2 exactly).
--    ON CONFLICT DO NOTHING so a later ops edit is never clobbered by re-runs.
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'guardian_thresholds',
  '{
    "velocity_shopper": {"window_minutes": 10, "warn": 5, "hard": 8},
    "velocity_merchant": {"window_minutes": 5, "warn": 20},
    "velocity_deal": {"window_minutes": 60, "warn": 5, "soft": 6},
    "geofence": {"warn_m": 250, "hard_m": 2000},
    "collusion": {"window_minutes": 30, "warn_total": 5, "soft_total": 8, "max_distinct": 2}
  }',
  'Guardian v1 redemption-time thresholds (docs/maanta-guardian-v1.md §2). Tunable live; guardian_evaluate falls back to these same values in code if a key or the whole row is missing/malformed. velocity_deal.soft must stay < velocity_shopper.hard so same-deal cycling holds rather than declines.'
)
ON CONFLICT (key) DO NOTHING;

-- 2) guardian_evaluate reads the config (with per-key fallbacks) at entry.
CREATE OR REPLACE FUNCTION public.guardian_evaluate(
  p_redemption_id uuid,
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Thresholds are read from app_config('guardian_thresholds') at entry, each
  -- with a hardcoded fallback equal to the shipped default (docs/maanta-
  -- guardian-v1.md §2). Conservative by design: block bands sit above plausible
  -- legitimate repeat activity, and velocity_deal soft (6) stays below
  -- velocity_shopper hard (8) so same-deal cycling holds rather than declines.
  v_cfg         jsonb;
  v_vs_win      int;
  v_vm_win      int;
  v_vd_win      int;
  v_col_win     int;
  c_vs_window   interval;
  c_vs_warn     int;
  c_vs_hard     int;
  c_vm_window   interval;
  c_vm_warn     int;
  c_vd_window   interval;
  c_vd_warn     int;
  c_vd_soft     int;
  c_geo_warn_m  numeric;
  c_geo_hard_m  numeric;
  c_col_window  interval;
  c_col_warn_t  int;
  c_col_soft_t  int;
  c_col_max_d   int;

  v_now         timestamptz := COALESCE(p_now, NOW());
  v_r           RECORD;
  v_checks      jsonb := '[]'::jsonb;
  v_has_hard    boolean := false;
  v_has_soft    boolean := false;
  v_has_warn    boolean := false;
  v_recommendation text;
  v_severity    text;

  v_vs_count    int;
  v_vm_count    int;
  v_vd_count    int;
  v_col_t       int;
  v_col_d       int;
BEGIN
  -- Config read is fail-safe: a missing/unreadable/malformed row → defaults
  -- (NEVER "clear everything", which would fail Guardian open).
  BEGIN
    SELECT value::jsonb INTO v_cfg FROM public.app_config WHERE key = 'guardian_thresholds';
  EXCEPTION WHEN OTHERS THEN
    v_cfg := NULL;
  END;
  v_cfg := COALESCE(v_cfg, '{}'::jsonb);

  v_vs_win     := COALESCE((v_cfg #>> '{velocity_shopper,window_minutes}')::int, 10);
  c_vs_window  := make_interval(mins => v_vs_win);
  c_vs_warn    := COALESCE((v_cfg #>> '{velocity_shopper,warn}')::int, 5);
  c_vs_hard    := COALESCE((v_cfg #>> '{velocity_shopper,hard}')::int, 8);

  v_vm_win     := COALESCE((v_cfg #>> '{velocity_merchant,window_minutes}')::int, 5);
  c_vm_window  := make_interval(mins => v_vm_win);
  c_vm_warn    := COALESCE((v_cfg #>> '{velocity_merchant,warn}')::int, 20);

  v_vd_win     := COALESCE((v_cfg #>> '{velocity_deal,window_minutes}')::int, 60);
  c_vd_window  := make_interval(mins => v_vd_win);
  c_vd_warn    := COALESCE((v_cfg #>> '{velocity_deal,warn}')::int, 5);
  c_vd_soft    := COALESCE((v_cfg #>> '{velocity_deal,soft}')::int, 6);

  c_geo_warn_m := COALESCE((v_cfg #>> '{geofence,warn_m}')::numeric, 250);
  c_geo_hard_m := COALESCE((v_cfg #>> '{geofence,hard_m}')::numeric, 2000);

  v_col_win    := COALESCE((v_cfg #>> '{collusion,window_minutes}')::int, 30);
  c_col_window := make_interval(mins => v_col_win);
  c_col_warn_t := COALESCE((v_cfg #>> '{collusion,warn_total}')::int, 5);
  c_col_soft_t := COALESCE((v_cfg #>> '{collusion,soft_total}')::int, 8);
  c_col_max_d  := COALESCE((v_cfg #>> '{collusion,max_distinct}')::int, 2);

  SELECT id, user_id, merchant_id, deal_id, distance_from_shop
    INTO v_r
    FROM public.redemptions
    WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guardian_evaluate: redemption % not found', p_redemption_id;
  END IF;

  -- ---- velocity_shopper: same shopper, successful redemptions, incl. current
  SELECT count(*) INTO v_vs_count
    FROM public.redemptions
    WHERE user_id = v_r.user_id
      AND status = 'success'
      AND redeemed_at >= v_now - c_vs_window;
  v_vs_count := v_vs_count + 1;
  IF v_vs_count >= c_vs_hard THEN
    v_has_hard := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_shopper','severity','block','band','hard',
                  'count', v_vs_count, 'window_minutes', v_vs_win, 'threshold', c_vs_hard);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_shopper', 'block',
            jsonb_build_object('band','hard','count',v_vs_count,'window_minutes',v_vs_win,'threshold',c_vs_hard));
  ELSIF v_vs_count >= c_vs_warn THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_shopper','severity','warn','band','warn',
                  'count', v_vs_count, 'window_minutes', v_vs_win, 'threshold', c_vs_warn);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_shopper', 'warn',
            jsonb_build_object('band','warn','count',v_vs_count,'window_minutes',v_vs_win,'threshold',c_vs_warn));
  END IF;

  -- ---- velocity_merchant: warn only (a busy counter is legitimate)
  SELECT count(*) INTO v_vm_count
    FROM public.redemptions
    WHERE merchant_id = v_r.merchant_id
      AND status = 'success'
      AND redeemed_at >= v_now - c_vm_window;
  v_vm_count := v_vm_count + 1;
  IF v_vm_count >= c_vm_warn THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_merchant','severity','warn','band','warn',
                  'count', v_vm_count, 'window_minutes', v_vm_win, 'threshold', c_vm_warn);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_merchant', 'warn',
            jsonb_build_object('band','warn','count',v_vm_count,'window_minutes',v_vm_win,'threshold',c_vm_warn));
  END IF;

  -- ---- velocity_deal: same shopper cycling the same deal → soft block band
  SELECT count(*) INTO v_vd_count
    FROM public.redemptions
    WHERE user_id = v_r.user_id
      AND deal_id = v_r.deal_id
      AND status = 'success'
      AND redeemed_at >= v_now - c_vd_window;
  v_vd_count := v_vd_count + 1;
  IF v_vd_count >= c_vd_soft THEN
    v_has_soft := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_deal','severity','block','band','soft',
                  'count', v_vd_count, 'window_minutes', v_vd_win, 'threshold', c_vd_soft);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_deal', 'block',
            jsonb_build_object('band','soft','count',v_vd_count,'window_minutes',v_vd_win,'threshold',c_vd_soft));
  ELSIF v_vd_count >= c_vd_warn THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_deal','severity','warn','band','warn',
                  'count', v_vd_count, 'window_minutes', v_vd_win, 'threshold', c_vd_warn);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_deal', 'warn',
            jsonb_build_object('band','warn','count',v_vd_count,'window_minutes',v_vd_win,'threshold',c_vd_warn));
  END IF;

  -- ---- geofence: distance recorded at claim time; NULL GPS never penalised
  IF v_r.distance_from_shop IS NOT NULL THEN
    IF v_r.distance_from_shop > c_geo_hard_m THEN
      v_has_hard := true;
      v_checks := v_checks || jsonb_build_object('type','geofence','severity','block','band','hard',
                    'distance_m', v_r.distance_from_shop, 'threshold_m', c_geo_hard_m);
      INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
      VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'geofence', 'block',
              jsonb_build_object('band','hard','distance_m',v_r.distance_from_shop,'threshold_m',c_geo_hard_m));
    ELSIF v_r.distance_from_shop > c_geo_warn_m THEN
      v_has_warn := true;
      v_checks := v_checks || jsonb_build_object('type','geofence','severity','warn','band','warn',
                    'distance_m', v_r.distance_from_shop, 'threshold_m', c_geo_warn_m);
      INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
      VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'geofence', 'warn',
              jsonb_build_object('band','warn','distance_m',v_r.distance_from_shop,'threshold_m',c_geo_warn_m));
    END IF;
  END IF;

  -- ---- collusion: tiny distinct-user set cycling one deal at one merchant
  SELECT count(*) INTO v_col_t
    FROM public.redemptions
    WHERE deal_id = v_r.deal_id
      AND merchant_id = v_r.merchant_id
      AND status = 'success'
      AND redeemed_at >= v_now - c_col_window;
  v_col_t := v_col_t + 1;                                   -- include current redemption
  -- distinct users including the current shopper
  SELECT count(*) INTO v_col_d FROM (
    SELECT DISTINCT user_id FROM public.redemptions
      WHERE deal_id = v_r.deal_id
        AND merchant_id = v_r.merchant_id
        AND status = 'success'
        AND redeemed_at >= v_now - c_col_window
    UNION
    SELECT v_r.user_id
  ) AS du;
  IF v_col_t >= c_col_soft_t AND v_col_d <= c_col_max_d THEN
    v_has_soft := true;
    v_checks := v_checks || jsonb_build_object('type','collusion','severity','block','band','soft',
                  'total', v_col_t, 'distinct_users', v_col_d, 'window_minutes', v_col_win);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'collusion', 'block',
            jsonb_build_object('band','soft','total',v_col_t,'distinct_users',v_col_d,'window_minutes',v_col_win));
  ELSIF v_col_t >= c_col_warn_t AND v_col_d <= c_col_max_d THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','collusion','severity','warn','band','warn',
                  'total', v_col_t, 'distinct_users', v_col_d, 'window_minutes', v_col_win);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'collusion', 'warn',
            jsonb_build_object('band','warn','total',v_col_t,'distinct_users',v_col_d,'window_minutes',v_col_win));
  END IF;

  -- ---- overall recommendation: strongest wins
  IF v_has_hard THEN
    v_recommendation := 'hard_block'; v_severity := 'block';
  ELSIF v_has_soft THEN
    v_recommendation := 'soft_block'; v_severity := 'block';
  ELSIF v_has_warn THEN
    v_recommendation := 'flag'; v_severity := 'warn';
  ELSE
    v_recommendation := 'clear'; v_severity := 'info';
  END IF;

  INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, recommendation, metadata)
  VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'overall', v_severity, v_recommendation,
          jsonb_build_object('checks', v_checks, 'evaluated_at', v_now));

  RETURN jsonb_build_object(
    'recommendation', v_recommendation,
    'severity', v_severity,
    'checks', v_checks
  );
END;
$function$;

COMMENT ON FUNCTION public.guardian_evaluate IS
  'Guardian v1 verify-time evaluator (docs/maanta-guardian-v1.md). Reads redemption history, computes velocity/geofence/collusion against p_now (injectable, defaults NOW()), writes guardian_events audit rows, returns {recommendation, severity, checks}. 2026-07-22: thresholds now read from app_config(guardian_thresholds) with hardcoded per-key fallbacks; a missing/malformed config falls back to defaults, never fails Guardian open. App-level; no payment-provider knowledge. service_role only.';
