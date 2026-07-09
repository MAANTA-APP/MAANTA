-- ============================================================================
-- MAANTA — Build session: Core Loop (claim_deal + verify_redemption)
-- Authority: DECISIONS_LOG.md (arrears model, 3-state feeChargeStatus, redemption
--            expiry = deal.expires_at + 15min), PROJECT_RULES.md, WALKTHROUGH.md
--            Steps 5-6, SESSION_FRAMEWORK.md (Build session type).
-- Scope: implements the two missing mechanisms blocking the core commerce loop.
-- Does NOT touch guardian_check wiring (separately scoped, per frozen decision),
-- does NOT touch onboard_merchant/activate_merchant/existing hardened RPCs.
-- ============================================================================

-- Supporting index: guarantees DB-level uniqueness of active pending OTP codes
-- per merchant, so the merchant keypad can never match two live tickets to the
-- same 6-digit code. Judgment call (not a frozen rule) — minimal, strictly
-- necessary for the claim/verify mechanism to be correct under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS uq_redemptions_pending_otp_per_merchant
  ON public.redemptions (merchant_id, otp_code)
  WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- claim_deal — shopper claims a deal, creates a pending redemption + OTP.
-- WALKTHROUGH.md Step 5. Redemption expiry is frozen: deal.expires_at + 15min.
-- ----------------------------------------------------------------------------
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

  -- Lock the deal row: prevents a max_claims race between concurrent claims.
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

  -- Judgment call (not a frozen rule): block a second simultaneous pending
  -- ticket for the same shopper on the same deal. Revert path: delete this
  -- block if Mo wants multi-claim allowed.
  SELECT id INTO v_existing_pending
    FROM public.redemptions
    WHERE deal_id = p_deal_id
      AND user_id = p_user_id
      AND status = 'pending'
      AND expires_at > NOW()
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
  'Shopper claim path. WALKTHROUGH.md Step 5. redemption.expires_at = deal.expires_at + 15min (frozen, DECISIONS_LOG 2026-06-30 supersession). SECURITY DEFINER: caller must equal p_user_id unless service_role.';

REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, geography) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_deal(uuid, uuid, text, geography) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_deal(uuid, uuid, text, geography) TO authenticated, service_role, postgres;

-- ----------------------------------------------------------------------------
-- verify_redemption — merchant verifies a code. WALKTHROUGH.md Step 6.
-- feeChargeStatus is a strict 3-state model (DECISIONS_LOG 2026-06-30):
--   'charged' | 'owed' | 'unknown'. 'unknown' must never collapse into 'owed'.
-- Redemption success is committed BEFORE the fee step and is never rolled
-- back by a fee-step failure — shoppers are never blocked by merchant wallet
-- state (frozen rule). The fee step runs in its own exception block, which
-- plpgsql implements as a savepoint: a fee-step error rolls back only the
-- fee step's own partial writes, leaving the verified redemption intact.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_redemption(
  p_merchant_id uuid,
  p_otp_code text,
  p_merchant_device_id text DEFAULT NULL
)
RETURNS TABLE (
  redemption_id uuid,
  redemption_status text,
  fee_charge_status text,
  fee_amount numeric,
  new_balance numeric,
  new_arrears numeric,
  deal_id uuid,
  deal_claims_count integer
)
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
BEGIN
  SELECT user_id INTO v_owner_user_id FROM public.merchants WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant_not_found';
  END IF;

  -- Same ownership pattern as deduct_success_fee_or_record_arrears (which this
  -- function calls). Known limitation inherited from existing schema: there is
  -- no merchant_staff-to-merchant mapping table yet, so only the merchant's
  -- own user_id (or admin, or service_role) passes. Not introduced by this
  -- migration — flagged for a future Security session if multi-staff-device
  -- verification is needed.
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

  UPDATE public.redemptions
    SET status = 'success',
        merchant_device_id = p_merchant_device_id,
        redeemed_at = NOW()
    WHERE id = v_redemption.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_already_verified';
  END IF;

  -- Metrics: best-effort, tied to a now-verified redemption row (closes the
  -- residual risk flagged in the last Security session — claims_count was
  -- previously not tied to a verified redemption at all). Non-fatal.
  BEGIN
    v_new_claims_count := public.increment_deal_claims(v_redemption.deal_id);
  EXCEPTION WHEN OTHERS THEN
    v_new_claims_count := NULL;
  END;

  -- Fee step: isolated sub-transaction. A failure here yields 'unknown', never
  -- 'owed' — per DECISIONS_LOG 2026-06-30 these are distinct states.
  BEGIN
    SELECT charged, new_balance, new_arrears
      INTO v_fee_result
      FROM public.deduct_success_fee_or_record_arrears(p_merchant_id, v_redemption.success_fee_charged);

    v_fee_status  := CASE WHEN v_fee_result.charged THEN 'charged' ELSE 'owed' END;
    v_fee_amount  := v_redemption.success_fee_charged;
    v_new_balance := v_fee_result.new_balance;
    v_new_arrears := v_fee_result.new_arrears;
  EXCEPTION WHEN OTHERS THEN
    v_fee_status  := 'unknown';
    v_fee_amount  := v_redemption.success_fee_charged;
    v_new_balance := NULL;
    v_new_arrears := NULL;
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
    v_new_claims_count;
END;
$function$;

COMMENT ON FUNCTION public.verify_redemption IS
  'Merchant verify path. WALKTHROUGH.md Step 6. feeChargeStatus in {charged, owed, unknown} (frozen, DECISIONS_LOG 2026-06-30) — unknown means the fee step itself errored and must never collapse into owed. Redemption success is never rolled back by a fee-step failure. Does not call guardian_check (separately scoped, frozen decision).';

REVOKE ALL ON FUNCTION public.verify_redemption(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_redemption(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_redemption(uuid, text, text) TO authenticated, service_role, postgres;
