-- ============================================================
-- Wireframe UI build (2026-07-09): merchant manage & grow backend
--
-- 1. deals.is_paused — wireframe 10ab "Deal paused — hidden from the feed.
--    No new claims while paused. Codes already claimed stay valid."
--    claim_deal re-created (same signature) with a pause check.
-- 2. app_config.boost_fee_kes — boost price lives in config (KES 500 / 24h
--    default per wireframe 10e), never hardcoded in app code.
-- 3. purchase_boost RPC — atomic wallet debit + boost_flags insert +
--    deals.boost_active, self-authorizing (owner or admin; service_role
--    bypasses), idempotency-safe by rejecting an already-active boost.
-- 4. move_boost RPC — wireframe 10f: reassign the remaining boost window
--    to another deal of the same merchant.
-- 5. merchant_staff — wireframe 10w/10y/10ac staff with per-permission
--    toggles (verify / create deals / top up / purchase), invited by phone.
-- ============================================================

-- 1a. Pause flag
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;

-- 1b. claim_deal with pause check (body otherwise identical to
--     20260702093134_fix_claim_deal_column_ambiguity.sql)
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

  SELECT d.id, d.merchant_id, d.title, d.image_url, d.is_active, d.is_paused, d.expires_at,
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

  -- Wireframe 10ab: paused deals accept no new claims.
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

-- 2. Boost fee config (KES 500 / 24h — wireframe 10e)
INSERT INTO public.app_config (key, value, notes)
VALUES ('boost_fee_kes', '500', 'Boost price per 24h window (wireframe 10e). Read by purchase_boost.')
ON CONFLICT (key) DO NOTHING;

-- 3. purchase_boost — atomic wallet debit + boost activation
CREATE OR REPLACE FUNCTION public.purchase_boost(
  p_merchant_id uuid,
  p_deal_id uuid
)
RETURNS TABLE (
  boost_id uuid,
  new_balance numeric,
  boost_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
  v_fee NUMERIC;
  v_balance NUMERIC;
  v_deal RECORD;
  v_boost_id UUID;
  v_ends_at TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
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

  SELECT value::NUMERIC INTO v_fee FROM public.app_config WHERE key = 'boost_fee_kes';
  IF v_fee IS NULL OR v_fee <= 0 THEN
    v_fee := 500;
  END IF;

  SELECT d.id, d.is_active, d.expires_at, d.boost_active INTO v_deal
    FROM public.deals d
    WHERE d.id = p_deal_id AND d.merchant_id = p_merchant_id
    FOR UPDATE OF d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found';
  END IF;
  IF v_deal.is_active IS NOT TRUE OR (v_deal.expires_at IS NOT NULL AND v_deal.expires_at <= NOW()) THEN
    RAISE EXCEPTION 'deal_not_active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.boost_flags bf
    WHERE bf.deal_id = p_deal_id AND bf.is_active = TRUE AND bf.ends_at > NOW()
  ) THEN
    RAISE EXCEPTION 'boost_already_active';
  END IF;

  -- Atomic debit: single guarded UPDATE (same pattern as
  -- deduct_success_fee_or_record_arrears, but boosts hard-fail on
  -- insufficient balance instead of recording arrears).
  UPDATE public.merchants
    SET account_balance = account_balance - v_fee, updated_at = NOW()
    WHERE id = p_merchant_id AND account_balance >= v_fee
    RETURNING account_balance INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO public.boost_flags (deal_id, merchant_id, boost_fee, is_active, starts_at, ends_at)
  VALUES (p_deal_id, p_merchant_id, v_fee, TRUE, NOW(), v_ends_at)
  RETURNING id INTO v_boost_id;

  INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, payment_provider, description, reference_id)
  VALUES (p_merchant_id, -v_fee, 'boost_fee', 'manual', 'Boost · 24h Priority Placement', p_deal_id);

  UPDATE public.deals SET boost_active = TRUE, updated_at = NOW() WHERE id = p_deal_id;

  RETURN QUERY SELECT v_boost_id, v_balance, v_ends_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purchase_boost(uuid, uuid) FROM anon;

-- 4. move_boost — reassign remaining boost window (wireframe 10f)
CREATE OR REPLACE FUNCTION public.move_boost(
  p_merchant_id uuid,
  p_from_deal_id uuid,
  p_to_deal_id uuid
)
RETURNS TABLE (
  boost_id uuid,
  boost_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := public.current_user_id();
  v_caller_role TEXT := public.current_user_role();
  v_owner_user_id UUID;
  v_flag RECORD;
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

  SELECT bf.id, bf.ends_at INTO v_flag
    FROM public.boost_flags bf
    WHERE bf.deal_id = p_from_deal_id
      AND bf.merchant_id = p_merchant_id
      AND bf.is_active = TRUE
      AND bf.ends_at > NOW()
    ORDER BY bf.ends_at DESC
    LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_active_boost';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = p_to_deal_id AND d.merchant_id = p_merchant_id
      AND d.is_active = TRUE AND (d.expires_at IS NULL OR d.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'target_deal_not_active';
  END IF;

  UPDATE public.boost_flags SET deal_id = p_to_deal_id WHERE id = v_flag.id;
  UPDATE public.deals SET boost_active = FALSE, updated_at = NOW() WHERE id = p_from_deal_id;
  UPDATE public.deals SET boost_active = TRUE, updated_at = NOW() WHERE id = p_to_deal_id;

  RETURN QUERY SELECT v_flag.id, v_flag.ends_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.move_boost(uuid, uuid, uuid) FROM anon;

-- 5. merchant_staff — invited staff with per-permission toggles
CREATE TABLE IF NOT EXISTS public.merchant_staff (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id  UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES public.users(id),
  staff_name   TEXT NOT NULL,
  phone        TEXT NOT NULL,
  can_verify   BOOLEAN NOT NULL DEFAULT TRUE,
  can_deals    BOOLEAN NOT NULL DEFAULT FALSE,
  can_topup    BOOLEAN NOT NULL DEFAULT FALSE,
  can_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_staff_merchant ON public.merchant_staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_staff_phone ON public.merchant_staff(phone);

ALTER TABLE public.merchant_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_owner_manage ON public.merchant_staff;
CREATE POLICY staff_owner_manage ON public.merchant_staff FOR ALL
  USING (
    merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id())
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS staff_self_read ON public.merchant_staff;
CREATE POLICY staff_self_read ON public.merchant_staff FOR SELECT
  USING (user_id = public.current_user_id());
