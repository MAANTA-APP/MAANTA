-- ============================================================
-- Test: security hardening migration (20260720120000_security_hardening.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening_test.sql
-- ============================================================

-- Scenario A: merchants.node is immutable for non-admin callers.
DO $$
DECLARE
  v_uid UUID;
  v_auth UUID := gen_random_uuid();
  v_mid UUID;
  v_err TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, user_id)
    VALUES ('__test_sec_node', 'test.sec.node', '+254700000201', 'BBS Mall', 'pending', v_uid)
    RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  BEGIN
    UPDATE public.merchants SET node = 'Two Rivers Mall' WHERE id = v_mid;
    RAISE EXCEPTION 'A: node update should have been blocked';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE '%merchant_node_immutable%', format('A: unexpected error: %', v_err);
  END;

  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: merchant cannot change node';
END $$;

-- Scenario B: you_pay_kes matches disclosed price + extras (canonical wireframe: 450 + 72 + 30 + 20 = 572).
DO $$
DECLARE
  v_pay NUMERIC;
  v_charges jsonb := '[
    {"label":"VAT (16%)","type":"percent","value":16},
    {"label":"Service charge","type":"fixed","value":30},
    {"label":"Packaging","type":"fixed","value":20}
  ]'::jsonb;
BEGIN
  v_pay := public.you_pay_kes(450, v_charges);
  ASSERT v_pay = 572, format('B: expected YOU PAY 572, got %s', v_pay);
  RAISE NOTICE 'Scenario B passed: you_pay_kes computes correctly';
END $$;

-- Scenario C: claim_deal snapshots amount_kes on the redemption row.
DO $$
DECLARE
  v_uid UUID;
  v_auth UUID := gen_random_uuid();
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_amount NUMERIC;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_sec_claim', 'test.sec.claim', '+254700000202', 'BBS Mall', 'active', TRUE, 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, charges)
    VALUES (
      v_mid, '__test deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 450,
      '[
        {"label":"VAT (16%)","type":"percent","value":16},
        {"label":"Service charge","type":"fixed","value":30},
        {"label":"Packaging","type":"fixed","value":20}
      ]'::jsonb
    )
    RETURNING id INTO v_did;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  SELECT redemption_id INTO v_rid
    FROM public.claim_deal(v_uid, v_did);

  SELECT amount_kes INTO v_amount FROM public.redemptions WHERE id = v_rid;
  ASSERT v_amount = 572, format('C: expected amount_kes 572, got %s', v_amount);

  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario C passed: claim_deal writes amount_kes atomically';
END $$;

-- Scenario D: staff with can_verify may verify redemptions (not owner-only).
DO $$
DECLARE
  v_owner UUID;
  v_staff UUID;
  v_staff_auth UUID := gen_random_uuid();
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_fee_status TEXT;
BEGIN
  INSERT INTO public.users (role) VALUES ('merchant_admin') RETURNING id INTO v_owner;
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_staff', v_staff_auth) RETURNING id INTO v_staff;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, user_id, account_balance, is_visible)
    VALUES ('__test_sec_staff', 'test.sec.staff', '+254700000203', 'BBS Mall', 'active', v_owner, 100, TRUE)
    RETURNING id INTO v_mid;
  INSERT INTO public.merchant_staff (merchant_id, user_id, staff_name, phone, can_verify)
    VALUES (v_mid, v_staff, 'Till Staff', '+254700000204', TRUE);
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test staff deal', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_owner, '593014', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_auth, 'role', 'authenticated')::text, true);

  ASSERT public.merchant_verify_authorized(v_mid, v_staff),
    'D: staff with can_verify should be authorized';

  SELECT fee_charge_status INTO v_fee_status
    FROM public.verify_redemption(v_mid, '593014');
  ASSERT v_fee_status = 'charged', format('D: staff verify fee_charge_status = %s', v_fee_status);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_staff WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_owner, v_staff);
  RAISE NOTICE 'Scenario D passed: staff with can_verify can verify redemptions';
END $$;

-- Scenario E: check_rate_limit enforces per-bucket ceilings (service_role context).
DO $$
DECLARE
  v_ok BOOLEAN;
  v_key TEXT := 'test-rate-' || gen_random_uuid()::text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_ok := public.check_rate_limit(v_key, 2, 60);
  ASSERT v_ok, 'E: first attempt should pass';
  v_ok := public.check_rate_limit(v_key, 2, 60);
  ASSERT v_ok, 'E: second attempt should pass';
  v_ok := public.check_rate_limit(v_key, 2, 60);
  ASSERT NOT v_ok, 'E: third attempt should be rate-limited';

  DELETE FROM public.api_rate_limit_buckets WHERE bucket_key = v_key;
  RAISE NOTICE 'Scenario E passed: check_rate_limit blocks over-limit calls';
END $$;

-- Scenario F: anon cannot read wallet columns from merchants (table grant revoked).
DO $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SET ROLE anon;
  BEGIN
    SELECT account_balance INTO v_balance FROM public.merchants LIMIT 1;
    RAISE EXCEPTION 'F: anon should not SELECT from merchants';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'Scenario F passed: anon cannot SELECT merchants base table';
END $$;

-- Scenario G: check_rate_limit is service_role-only. Supabase default
-- privileges auto-grant EXECUTE on new public functions to anon/authenticated,
-- so revoking only from PUBLIC/anon is not enough — authenticated must also be
-- revoked (see migration 20260720123000_lock_down_check_rate_limit_execute.sql).
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE'),
    'G: anon must not be able to execute check_rate_limit';
  ASSERT NOT has_function_privilege('authenticated', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE'),
    'G: authenticated must not be able to execute check_rate_limit';
  ASSERT has_function_privilege('service_role', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE'),
    'G: service_role must be able to execute check_rate_limit';
  RAISE NOTICE 'Scenario G passed: check_rate_limit is service_role-only';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL security_hardening scenarios passed.'; END $$;
