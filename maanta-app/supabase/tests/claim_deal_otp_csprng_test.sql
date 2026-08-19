-- ============================================================
-- Test: claim_deal mints the OTP with a CSPRNG, and still returns 6 digits
-- (20260818120000_claim_deal_csprng_otp.sql)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/claim_deal_otp_csprng_test.sql
-- ============================================================

-- Scenario A: source ratchet. The function body must draw from pgcrypto and must
-- not fall back to the backend PRNG. This is the guard that fails if a later
-- edit reverts the OTP to floor(random()).
DO $$
DECLARE
  v_def TEXT := pg_get_functiondef('public.claim_deal(uuid,uuid,text,extensions.geography)'::regprocedure);
BEGIN
  ASSERT v_def ILIKE '%gen_random_bytes%',
    'A: claim_deal must mint the OTP via pgcrypto gen_random_bytes';
  ASSERT v_def NOT ILIKE '%floor(random%',
    'A: claim_deal must not use the non-crypto floor(random()) PRNG for OTPs';
  RAISE NOTICE 'Scenario A passed: OTP is minted from a CSPRNG, not the backend PRNG';
END $$;

-- Scenario B: behaviour unchanged end to end — a real claim still returns a
-- well-formed 6-digit code and creates a matching pending redemption.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_otp TEXT;
  v_row_status TEXT;
  v_row_otp TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_otp_csprng', 'test.otp.csprng', '+254700000501', 'BBS Mall', 'active', TRUE, 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test otp deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  -- Authenticate as the claiming user (sub = auth_uid); claim_deal's internal
  -- gate requires current_user_id() = p_user_id.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);

  SELECT redemption_id, otp_code INTO v_rid, v_otp FROM public.claim_deal(v_uid, v_did);

  ASSERT v_rid IS NOT NULL, 'B: claim_deal must create a redemption';
  ASSERT v_otp ~ '^[0-9]{6}$', format('B: OTP must be exactly 6 digits, got %s', v_otp);

  SELECT status, otp_code INTO v_row_status, v_row_otp FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'pending', format('B: redemption must be pending, got %s', v_row_status);
  ASSERT v_row_otp = v_otp, 'B: stored otp_code must equal the returned code';

  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario B passed: claim_deal returns a well-formed 6-digit code and a pending redemption';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL claim_deal_otp_csprng scenarios passed.'; END $$;
