-- ============================================================================
-- MAANTA — Guardian v1: redemption-time fraud checks
-- Design note: docs/maanta-guardian-v1.md
--
-- Implements the first REAL Guardian checks (velocity / geofence / collusion)
-- at verify time, wired into verify_redemption WITHOUT touching the frozen
-- money path. Block/held outcomes move NO money; clear/flag run the existing
-- 3-state fee model byte-for-byte. Node 0 (BBS Mall) scope only.
--
-- Frozen rules preserved (CLAUDE.md, DECISIONS_LOG 2026-06-30 / 2026-07-03):
--   * KES 30 success fee, applied only on the SUCCESS path (unchanged).
--   * feeChargeStatus in {charged, owed, unknown}; unknown never collapses to
--     owed. Returned as NULL on held/blocked (no fee decision made).
--   * Redemption success is committed before the fee step and never rolled
--     back by a fee-step failure.
--   * Verify-anyway holds for clear/flag; block-severity Guardian hits are the
--     sole, conservative, auditable exception (they decline/hold, move no fee).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) guardian_events — granular per-redemption audit, keyed by redemption id.
--    Minimal and reversible. The existing fraud_events table (merchant/user
--    routing + trust) is reused for warn+ hits by verify_redemption.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardian_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  redemption_id  UUID NOT NULL REFERENCES public.redemptions(id) ON DELETE CASCADE,
  merchant_id    UUID REFERENCES public.merchants(id),
  user_id        UUID REFERENCES public.users(id),
  deal_id        UUID REFERENCES public.deals(id),
  check_type     TEXT NOT NULL
                 CHECK (check_type IN ('velocity_shopper','velocity_merchant','velocity_deal','geofence','collusion','overall')),
  severity       TEXT NOT NULL
                 CHECK (severity IN ('info','warn','block')),
  recommendation TEXT
                 CHECK (recommendation IN ('clear','flag','soft_block','hard_block')),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardian_events_redemption ON public.guardian_events(redemption_id);
CREATE INDEX IF NOT EXISTS idx_guardian_events_type_sev   ON public.guardian_events(check_type, severity);
CREATE INDEX IF NOT EXISTS idx_guardian_events_created    ON public.guardian_events(created_at DESC);

ALTER TABLE public.guardian_events ENABLE ROW LEVEL SECURITY;

-- Admin read; writes happen through SECURITY DEFINER functions (service role).
DROP POLICY IF EXISTS guardian_events_admin ON public.guardian_events;
CREATE POLICY guardian_events_admin ON public.guardian_events
  FOR SELECT USING (public.current_user_role() = 'admin');

REVOKE ALL ON public.guardian_events FROM PUBLIC;
REVOKE ALL ON public.guardian_events FROM anon;
GRANT SELECT ON public.guardian_events TO authenticated;   -- gated by RLS (admin only)
GRANT ALL    ON public.guardian_events TO service_role;

COMMENT ON TABLE public.guardian_events IS
  'Guardian v1 per-redemption audit (docs/maanta-guardian-v1.md). One row per triggered check plus one overall row carrying the recommendation. Keyed by redemption_id. Written by guardian_evaluate; read by admin_redemption_detail.';

-- ---------------------------------------------------------------------------
-- 2) Collusion becomes a first-class fraud_events severity input. The event
--    type already allows 'collusion' (baseline); nothing to alter there.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3) guardian_evaluate — the separable Guardian module. Reads the redemption
--    history, computes the three check families against p_now, writes the
--    guardian_events audit rows, and returns a structured JSON result:
--      { recommendation, severity, checks: [ {type, severity, band, ...} ] }
--    p_now is injectable (defaults NOW()) for deterministic tests.
--    SECURITY DEFINER / service_role only — called from verify_redemption.
-- ---------------------------------------------------------------------------
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
  -- Thresholds (mirror docs/maanta-guardian-v1.md §2). Conservative on purpose:
  -- block bands are deliberately high so plausible legitimate repeat activity
  -- never trips a hold/decline (task steer: favour allow+flag, reserve blocks
  -- for the egregious tail). velocity_deal soft (6) stays below velocity_shopper
  -- hard (8) so same-deal cycling holds rather than declines.
  c_vs_window   CONSTANT interval := INTERVAL '10 minutes';
  c_vs_warn     CONSTANT int := 5;
  c_vs_hard     CONSTANT int := 8;
  c_vm_window   CONSTANT interval := INTERVAL '5 minutes';
  c_vm_warn     CONSTANT int := 20;
  c_vd_window   CONSTANT interval := INTERVAL '60 minutes';
  c_vd_warn     CONSTANT int := 5;
  c_vd_soft     CONSTANT int := 6;
  c_geo_warn_m  CONSTANT numeric := 250;
  c_geo_hard_m  CONSTANT numeric := 2000;
  c_col_window  CONSTANT interval := INTERVAL '30 minutes';
  c_col_warn_t  CONSTANT int := 5;
  c_col_soft_t  CONSTANT int := 8;
  c_col_max_d   CONSTANT int := 2;

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
                  'count', v_vs_count, 'window_minutes', 10, 'threshold', c_vs_hard);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_shopper', 'block',
            jsonb_build_object('band','hard','count',v_vs_count,'window_minutes',10,'threshold',c_vs_hard));
  ELSIF v_vs_count >= c_vs_warn THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_shopper','severity','warn','band','warn',
                  'count', v_vs_count, 'window_minutes', 10, 'threshold', c_vs_warn);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_shopper', 'warn',
            jsonb_build_object('band','warn','count',v_vs_count,'window_minutes',10,'threshold',c_vs_warn));
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
                  'count', v_vm_count, 'window_minutes', 5, 'threshold', c_vm_warn);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_merchant', 'warn',
            jsonb_build_object('band','warn','count',v_vm_count,'window_minutes',5,'threshold',c_vm_warn));
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
                  'count', v_vd_count, 'window_minutes', 60, 'threshold', c_vd_soft);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_deal', 'block',
            jsonb_build_object('band','soft','count',v_vd_count,'window_minutes',60,'threshold',c_vd_soft));
  ELSIF v_vd_count >= c_vd_warn THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','velocity_deal','severity','warn','band','warn',
                  'count', v_vd_count, 'window_minutes', 60, 'threshold', c_vd_warn);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'velocity_deal', 'warn',
            jsonb_build_object('band','warn','count',v_vd_count,'window_minutes',60,'threshold',c_vd_warn));
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
  SELECT count(*), count(DISTINCT user_id)
    INTO v_col_t, v_col_d
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
                  'total', v_col_t, 'distinct_users', v_col_d, 'window_minutes', 30);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'collusion', 'block',
            jsonb_build_object('band','soft','total',v_col_t,'distinct_users',v_col_d,'window_minutes',30));
  ELSIF v_col_t >= c_col_warn_t AND v_col_d <= c_col_max_d THEN
    v_has_warn := true;
    v_checks := v_checks || jsonb_build_object('type','collusion','severity','warn','band','warn',
                  'total', v_col_t, 'distinct_users', v_col_d, 'window_minutes', 30);
    INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, metadata)
    VALUES (v_r.id, v_r.merchant_id, v_r.user_id, v_r.deal_id, 'collusion', 'warn',
            jsonb_build_object('band','warn','total',v_col_t,'distinct_users',v_col_d,'window_minutes',30));
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
  'Guardian v1 verify-time evaluator (docs/maanta-guardian-v1.md). Reads redemption history, computes velocity/geofence/collusion against p_now (injectable, defaults NOW()), writes guardian_events audit rows, returns {recommendation, severity, checks}. App-level; no payment-provider knowledge. service_role only.';

REVOKE ALL ON FUNCTION public.guardian_evaluate(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardian_evaluate(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.guardian_evaluate(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_evaluate(uuid, timestamptz) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4) verify_redemption gains the Guardian step. DROP+CREATE because the
--    RETURNS TABLE gains two columns (guardian_recommendation,
--    guardian_severity) — additive; existing `SELECT a, b FROM verify_...`
--    callers are unaffected. Body is reproduced from the authoritative
--    20260720120000_security_hardening.sql version (staff-aware ownership via
--    merchant_verify_authorized + reference-linked fee call); the ONLY
--    additions are the guardian evaluation and the block/held branches. The
--    SUCCESS branch (status='success' + fee step) is unchanged, so the frozen
--    money path is byte-for-byte identical.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.verify_redemption(uuid, text, text, boolean, text);

CREATE FUNCTION public.verify_redemption(
  p_merchant_id uuid,
  p_otp_code text,
  p_merchant_device_id text DEFAULT NULL,
  p_override boolean DEFAULT false,
  p_override_reason text DEFAULT NULL
)
RETURNS TABLE(
  redemption_id uuid,
  redemption_status text,
  fee_charge_status text,
  fee_amount numeric,
  new_balance numeric,
  new_arrears numeric,
  deal_id uuid,
  deal_claims_count integer,
  disputed boolean,
  guardian_recommendation text,
  guardian_severity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
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
  v_guardian JSONB;
  v_recommendation TEXT;
  v_g_severity TEXT;
BEGIN
  -- Ownership/authorization unchanged from 20260720120000_security_hardening:
  -- staff with can_verify, the merchant owner, admin, or service_role.
  PERFORM 1 FROM public.merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin'
       AND NOT public.merchant_verify_authorized(p_merchant_id, v_caller_id) THEN
      RAISE EXCEPTION 'unauthorized: not merchant verifier or admin';
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

  -- ---- Guardian v1 step: runs AFTER OTP match, BEFORE status/money finalise.
  -- Best-effort: a Guardian internal error must never block a legitimate
  -- verify, so we default to 'clear' if evaluation itself fails.
  BEGIN
    v_guardian := public.guardian_evaluate(v_redemption.id, NOW());
    v_recommendation := v_guardian->>'recommendation';
    v_g_severity := v_guardian->>'severity';
  EXCEPTION WHEN OTHERS THEN
    v_recommendation := 'clear';
    v_g_severity := 'info';
  END;

  -- Admin may release a SOFT block inline (the documented override path). A
  -- HARD block is egregious and never overridable here.
  IF v_recommendation = 'soft_block' AND p_override AND v_caller_role = 'admin' THEN
    v_recommendation := 'flag';
    v_g_severity := 'warn';
  END IF;

  -- ---- HARD BLOCK: decline. No money moves. Non-accusatory error at the API.
  IF v_recommendation = 'hard_block' THEN
    UPDATE public.redemptions
      SET status = 'failed',
          merchant_device_id = p_merchant_device_id,
          review_required = true,
          fraud_flags = array_append(COALESCE(fraud_flags, '{}'), 'guardian_hard_block')
      WHERE id = v_redemption.id AND status = 'pending';

    v_disputed := true;
    BEGIN
      INSERT INTO public.fraud_events (merchant_id, user_id, event_type, severity, details)
      VALUES (p_merchant_id, v_redemption.user_id, 'velocity', 'high',
        jsonb_build_object('redemption_id', v_redemption.id, 'deal_id', v_redemption.deal_id,
          'guardian', v_guardian, 'outcome', 'hard_block'));
      INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
      VALUES (p_merchant_id, 'dispute_review', 'high',
        format('Guardian HARD-BLOCK on redemption %s (deal %s). Declined at the counter; no fee charged. Checks: %s.',
          v_redemption.id, v_redemption.deal_id, v_guardian->'checks'));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN QUERY SELECT
      v_redemption.id, 'blocked'::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      v_redemption.deal_id, NULL::INTEGER, v_disputed, v_recommendation, v_g_severity;
    RETURN;
  END IF;

  -- ---- SOFT BLOCK: hold for admin review. No money moves. Status 'flagged'.
  IF v_recommendation = 'soft_block' THEN
    UPDATE public.redemptions
      SET status = 'flagged',
          merchant_device_id = p_merchant_device_id,
          review_required = true,
          fraud_flags = array_append(COALESCE(fraud_flags, '{}'), 'guardian_soft_block')
      WHERE id = v_redemption.id AND status = 'pending';

    v_disputed := true;
    BEGIN
      INSERT INTO public.fraud_events (merchant_id, user_id, event_type, severity, details)
      VALUES (p_merchant_id, v_redemption.user_id, 'collusion', 'medium',
        jsonb_build_object('redemption_id', v_redemption.id, 'deal_id', v_redemption.deal_id,
          'guardian', v_guardian, 'outcome', 'soft_block'));
      INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
      VALUES (p_merchant_id, 'dispute_review', 'high',
        format('Guardian SOFT-BLOCK on redemption %s (deal %s). Held pending admin review; no fee charged. Release via admin_release_redemption. Checks: %s.',
          v_redemption.id, v_redemption.deal_id, v_guardian->'checks'));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN QUERY SELECT
      v_redemption.id, 'held'::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      v_redemption.deal_id, NULL::INTEGER, v_disputed, v_recommendation, v_g_severity;
    RETURN;
  END IF;

  -- =========================================================================
  -- SUCCESS PATH (recommendation = clear | flag). Below is UNCHANGED from
  -- 20260720014135; verify-anyway + the frozen 3-state money model are intact.
  -- Guardian 'flag' folds into the existing claim-time flag / dispute path.
  -- =========================================================================
  v_has_flags := v_redemption.review_required
                 OR COALESCE(array_length(v_redemption.fraud_flags, 1), 0) > 0
                 OR v_recommendation = 'flag';

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
          'verified_by_user', v_caller_id,
          'guardian', v_guardian
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
      NULL;
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
      FROM public.deduct_success_fee_or_record_arrears(p_merchant_id, v_redemption.success_fee_charged, v_redemption.id) AS f;

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
    v_disputed,
    v_recommendation,
    v_g_severity;
END;
$function$;

COMMENT ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) IS
  'Merchant verify path with Guardian v1 (docs/maanta-guardian-v1.md). After OTP match, guardian_evaluate runs before status/money finalise: clear/flag → success (frozen 3-state fee model unchanged, verify-anyway preserved); soft_block → status flagged/held, NO fee, released by admin_release_redemption; hard_block → status failed/declined, NO fee. Admin+override releases a soft block inline. feeChargeStatus is NULL on held/blocked.';

REVOKE EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) admin_release_redemption — the admin override path for SOFT blocks.
--    approve → flagged → success + apply the KES 30 fee through the SAME
--    money path (charged/owed/unknown). reject → flagged → failed, no fee.
--    Admin-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_release_redemption(
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

  SELECT * INTO v_redemption
    FROM public.redemptions
    WHERE id = p_redemption_id AND status = 'flagged'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_not_held';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.redemptions
      SET status = 'failed', review_required = false,
          fraud_flags = array_append(COALESCE(fraud_flags, '{}'), 'guardian_release_rejected')
      WHERE id = v_redemption.id AND status = 'flagged';
    RETURN QUERY SELECT v_redemption.id, 'failed'::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- Approve: complete the redemption. Success is committed before the fee step
  -- and never rolled back by a fee failure (same guarantee as verify_redemption).
  UPDATE public.redemptions
    SET status = 'success', review_required = false, redeemed_at = NOW(),
        fraud_flags = array_append(COALESCE(fraud_flags, '{}'), 'guardian_release_approved')
    WHERE id = v_redemption.id AND status = 'flagged';

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
        format('feeChargeStatus=unknown on admin-released redemption %s: fee step failed (%s).', v_redemption.id, coalesce(v_fee_err,'no error message')));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN QUERY SELECT v_redemption.id, 'success'::TEXT, v_fee_status, v_fee_amount, v_new_balance, v_new_arrears;
END;
$function$;

COMMENT ON FUNCTION public.admin_release_redemption IS
  'Admin override path for Guardian SOFT blocks (docs/maanta-guardian-v1.md). approve → flagged→success + KES 30 fee via the frozen 3-state money path; reject → flagged→failed, no fee. Admin only. Hard blocks are terminal in v1.';

REVOKE ALL ON FUNCTION public.admin_release_redemption(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_release_redemption(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_release_redemption(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_redemption(uuid, boolean) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 6) admin_redemption_detail — future-UI hook. Returns the redemption plus its
--    guardian_events (jsonb array, newest first) and the overall Guardian
--    recommendation. Admin-only. Read-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_redemption_detail(
  p_redemption_id uuid
)
RETURNS TABLE(
  redemption_id uuid,
  status text,
  merchant_id uuid,
  user_id uuid,
  deal_id uuid,
  success_fee_charged numeric,
  distance_from_shop numeric,
  fraud_flags text[],
  review_required boolean,
  redeemed_at timestamptz,
  guardian_recommendation text,
  guardian_events jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role TEXT := public.current_user_role();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.status, r.merchant_id, r.user_id, r.deal_id,
    r.success_fee_charged, r.distance_from_shop, r.fraud_flags,
    r.review_required, r.redeemed_at,
    (SELECT ge.recommendation FROM public.guardian_events ge
       WHERE ge.redemption_id = r.id AND ge.check_type = 'overall'
       ORDER BY ge.created_at DESC LIMIT 1) AS guardian_recommendation,
    COALESCE((
      SELECT jsonb_agg(e ORDER BY (e->>'created_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', ge.id, 'check_type', ge.check_type, 'severity', ge.severity,
          'recommendation', ge.recommendation, 'metadata', ge.metadata,
          'created_at', ge.created_at
        ) AS e
        FROM public.guardian_events ge
        WHERE ge.redemption_id = r.id
      ) s
    ), '[]'::jsonb) AS guardian_events
  FROM public.redemptions r
  WHERE r.id = p_redemption_id;
END;
$function$;

COMMENT ON FUNCTION public.admin_redemption_detail IS
  'Admin/support redemption detail incl. Guardian v1 events + overall recommendation (docs/maanta-guardian-v1.md §5). Single entry point for future Guardian admin UI. Admin only, read-only.';

REVOKE ALL ON FUNCTION public.admin_redemption_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_redemption_detail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_redemption_detail(uuid) TO authenticated, service_role, postgres;
