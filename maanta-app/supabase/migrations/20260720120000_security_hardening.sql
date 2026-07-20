-- Security hardening (2026-07-20): closes findings from merged-PR security review.
--   * Node 0 opening credit: immutable merchant node, atomic cap, first-activation only
--   * Anon browse: column-safe public views (no wallet/PII via PostgREST)
--   * claim_deal: atomic amount_kes snapshot
--   * verify_redemption + fee debit: staff with can_verify
--   * OTP rate limiting bucket + code_rejected audit event
--   * rls_auto_enable: surface RLS-enable failures as WARNING (not silent)

-- ---------------------------------------------------------------------------
-- 1) Merchants.node is immutable after onboarding (admin/service_role may change).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_merchant_node_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.node IS DISTINCT FROM NEW.node THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND COALESCE(public.current_user_role(), '') IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'merchant_node_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS merchants_node_immutable ON public.merchants;
CREATE TRIGGER merchants_node_immutable
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_merchant_node_change();

-- ---------------------------------------------------------------------------
-- 2) YOU PAY helper for atomic claim-time snapshot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.you_pay_kes(p_price_kes numeric, p_charges jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_charge jsonb;
  v_total numeric;
  v_value numeric;
  v_type text;
BEGIN
  IF p_price_kes IS NULL THEN
    RETURN NULL;
  END IF;

  v_total := round(p_price_kes);

  IF p_charges IS NULL OR jsonb_typeof(p_charges) IS DISTINCT FROM 'array' THEN
    RETURN v_total;
  END IF;

  FOR v_charge IN SELECT value FROM jsonb_array_elements(p_charges)
  LOOP
    v_value := NULLIF(v_charge->>'value', '')::numeric;
    IF v_value IS NULL OR v_value <= 0 THEN
      CONTINUE;
    END IF;
    v_type := COALESCE(v_charge->>'type', 'fixed');
    IF v_type = 'percent' THEN
      v_total := v_total + round(p_price_kes * v_value / 100.0);
    ELSE
      v_total := v_total + round(v_value);
    END IF;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Shared merchant verify authorization (owner or staff with can_verify).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merchant_verify_authorized(p_merchant_id uuid, p_caller_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = p_merchant_id AND m.user_id = p_caller_id
    )
    OR EXISTS (
      SELECT 1 FROM public.merchant_staff ms
      WHERE ms.merchant_id = p_merchant_id
        AND ms.user_id = p_caller_id
        AND ms.can_verify = TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.merchant_verify_authorized(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merchant_verify_authorized(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.merchant_verify_authorized(uuid, uuid) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4) OTP / redemption API rate limiting (service_role-only table).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limit_buckets (
  bucket_key    text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := NOW();
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0
     OR p_limit IS NULL OR p_limit <= 0
     OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN TRUE;
  END IF;

  SELECT window_start, attempt_count
    INTO v_window_start, v_count
    FROM public.api_rate_limit_buckets
    WHERE bucket_key = p_bucket_key
    FOR UPDATE;

  IF NOT FOUND
     OR v_window_start < v_now - make_interval(secs => p_window_seconds) THEN
    INSERT INTO public.api_rate_limit_buckets (bucket_key, window_start, attempt_count)
    VALUES (p_bucket_key, v_now, 1)
    ON CONFLICT (bucket_key) DO UPDATE
      SET window_start = EXCLUDED.window_start,
          attempt_count = 1;
    RETURN TRUE;
  END IF;

  IF v_count >= p_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE public.api_rate_limit_buckets
    SET attempt_count = attempt_count + 1
    WHERE bucket_key = p_bucket_key;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 5) fraud_events: allow merchant code-reject audit trail.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fraud_events DROP CONSTRAINT IF EXISTS fraud_events_event_type_check;
ALTER TABLE public.fraud_events ADD CONSTRAINT fraud_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'velocity', 'geofence', 'collusion', 'otp_abuse', 'device_blacklist',
    'merchant_override', 'code_rejected'
  ]));

-- ---------------------------------------------------------------------------
-- 6) Anon browse views — column-safe surfaces for pre-sign-in PostgREST.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.merchants_public_browse
WITH (security_invoker = true) AS
  SELECT
    id,
    merchant_name,
    tier,
    status,
    node,
    what3words_address,
    mall_name,
    floor,
    unit_number,
    is_visible,
    is_featured,
    trust_metric
  FROM public.merchants;

CREATE OR REPLACE VIEW public.deals_public_browse
WITH (security_invoker = true) AS
  SELECT
    id,
    merchant_id,
    node,
    title,
    description,
    image_url,
    deal_type,
    flash_duration_hours,
    is_active,
    max_claims,
    claims_count,
    boost_active,
    price_kes,
    compare_at_kes,
    charges,
    starts_at,
    expires_at,
    created_at
  FROM public.deals;

REVOKE SELECT ON public.merchants FROM anon;
REVOKE SELECT ON public.deals FROM anon;
GRANT SELECT ON public.merchants_public_browse TO anon;
GRANT SELECT ON public.deals_public_browse TO anon;

-- ---------------------------------------------------------------------------
-- 7) claim_deal — snapshot amount_kes atomically at insert.
-- ---------------------------------------------------------------------------
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

  SELECT d.id, d.merchant_id, d.title, d.image_url, d.is_active, d.expires_at,
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

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, extensions.geography) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 8) deduct_success_fee_or_record_arrears — staff with can_verify may trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_success_fee_or_record_arrears(
  p_merchant_id uuid,
  p_amount numeric,
  p_reference_id uuid DEFAULT NULL
)
 RETURNS TABLE(charged boolean, new_balance numeric, new_arrears numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_charged BOOLEAN;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_canonical_fee NUMERIC;
BEGIN
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

  SELECT value::NUMERIC INTO v_canonical_fee FROM public.app_config WHERE key = 'success_fee_kes';
  IF v_canonical_fee IS NULL THEN
    v_canonical_fee := 30.00;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: p_amount must be positive';
  END IF;

  IF p_amount IS DISTINCT FROM v_canonical_fee THEN
    RAISE EXCEPTION 'invalid_amount: p_amount (%) does not match the platform success fee (%)', p_amount, v_canonical_fee;
  END IF;

  UPDATE public.merchants
    SET account_balance = account_balance - p_amount, updated_at = NOW()
    WHERE id = p_merchant_id AND account_balance >= p_amount
    RETURNING account_balance, outstanding_arrears INTO v_new_balance, v_new_arrears;
  IF FOUND THEN
    v_charged := TRUE;
    INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description, reference_id)
    VALUES (p_merchant_id, -p_amount, 'success_fee', 'manual', 'Success fee deducted on verified redemption', p_reference_id);
    RETURN QUERY SELECT v_charged, v_new_balance, v_new_arrears;
    RETURN;
  END IF;
  UPDATE public.merchants
    SET outstanding_arrears = outstanding_arrears + p_amount, updated_at = NOW()
    WHERE id = p_merchant_id
    RETURNING account_balance, outstanding_arrears INTO v_new_balance, v_new_arrears;
  v_charged := FALSE;
  INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description, reference_id)
  VALUES (p_merchant_id, p_amount, 'success_fee_arrears', 'manual', 'Success fee recorded as arrears — insufficient wallet balance', p_reference_id);
  RETURN QUERY SELECT v_charged, v_new_balance, v_new_arrears;
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 9) verify_redemption — staff with can_verify; owner/admin unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_redemption(
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
  disputed boolean
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
BEGIN
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

  v_has_flags := v_redemption.review_required
                 OR COALESCE(array_length(v_redemption.fraud_flags, 1), 0) > 0;

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
    v_disputed;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10) activate_merchant — hardened opening credit (atomic cap, pending-only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_merchant(
  p_merchant_id uuid,
  p_admin_user_id uuid,
  p_grant_elite_trial boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_status TEXT;
  v_merchant_node   TEXT;
  v_agent_id        UUID;
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_credit_amount NUMERIC;
  v_credit_cap    INT;
  v_launch_end    TIMESTAMPTZ;
  v_launch_node   TEXT;
  v_credited_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: admin only';
    END IF;

    IF v_caller_id IS DISTINCT FROM p_admin_user_id THEN
      RAISE EXCEPTION 'unauthorized: p_admin_user_id does not match caller identity';
    END IF;
  END IF;

  SELECT status, node INTO v_merchant_status, v_merchant_node
    FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  IF v_merchant_status = 'active' THEN
    RAISE EXCEPTION 'already_active';
  END IF;

  SELECT id INTO v_agent_id FROM public.agents WHERE user_id = p_admin_user_id LIMIT 1;

  UPDATE public.merchants
  SET
    status       = 'active',
    onboarded_by = v_agent_id,
    onboarded_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_merchant_id;

  IF p_grant_elite_trial THEN
    UPDATE public.merchants
    SET
      tier               = 'elite',
      elite_trial_active = TRUE,
      trial_ends_at      = NOW() + INTERVAL '30 days',
      updated_at         = NOW()
    WHERE id = p_merchant_id;
  END IF;

  SELECT value::NUMERIC     INTO v_credit_amount FROM public.app_config WHERE key = 'node0_opening_credit_kes';
  SELECT value::INT         INTO v_credit_cap    FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap';
  SELECT value::TIMESTAMPTZ INTO v_launch_end    FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
  SELECT value              INTO v_launch_node   FROM public.app_config WHERE key = 'node0_launch_node';
  v_launch_node := COALESCE(v_launch_node, 'BBS Mall');
  v_credit_cap := COALESCE(v_credit_cap, 100);

  IF COALESCE(v_credit_amount, 0) > 0
     AND v_merchant_status = 'pending'
     AND v_merchant_node = v_launch_node
     AND (v_launch_end IS NULL OR NOW() < v_launch_end)
     AND v_credit_cap > 0
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('node0_opening_credit'));

    SELECT COUNT(*) INTO v_credited_count
      FROM public.merchant_transactions
      WHERE transaction_type = 'topup'
        AND payment_provider = 'manual'
        AND provider_reference LIKE 'node0_opening_credit:%';

    IF v_credited_count < v_credit_cap THEN
      UPDATE public.merchants
        SET account_balance = account_balance + v_credit_amount,
            updated_at      = NOW()
        WHERE id = p_merchant_id;

      INSERT INTO public.merchant_transactions (
        merchant_id, amount, transaction_type, payment_provider,
        provider_reference, description, currency, charged_amount
      )
      VALUES (
        p_merchant_id, v_credit_amount, 'topup', 'manual',
        'node0_opening_credit:' || p_merchant_id,
        'Node 0 launch opening credit · node0_opening_credit',
        'KES', 0
      );
    END IF;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 11) rls_auto_enable — log failures at WARNING (visible in Postgres logs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  v_err text;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
          RAISE WARNING 'rls_auto_enable: failed to enable RLS on % — %', cmd.object_identity, v_err;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
