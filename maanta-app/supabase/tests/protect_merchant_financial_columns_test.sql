-- ============================================================
-- Test: merchant financial-column protection + locked-down grants
--   migrations 20260723001651_lock_down_merchant_financial_columns.sql
--            + 20260724120000_harden_protect_merchant_financial_columns_grants.sql
--
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/protect_merchant_financial_columns_test.sql
-- ============================================================

-- Scenario A: a non-service caller (JWT role 'authenticated') cannot move a
-- protected financial column on merchants — the BEFORE UPDATE trigger raises
-- 'protected_column'. (The psql superuser connection bypasses table-level ACL,
-- so this exercises the trigger itself, not the separate authenticated-write
-- revoke.) This proves that revoking EXECUTE on the trigger function did NOT
-- stop it from firing.
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
    VALUES ('__test_protect_fin', 'test.protect.fin', '+254700000701', 'BBS Mall', 'pending', v_uid)
    RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  BEGIN
    UPDATE public.merchants SET account_balance = account_balance + 100000 WHERE id = v_mid;
    RAISE EXCEPTION 'A: account_balance update should have been blocked';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE '%protected_column%', format('A: unexpected error: %s', v_err);
  END;

  -- Reset the claim so cleanup runs unrestricted.
  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: financial column update blocked by trigger';
END $$;

-- Scenario B: EXECUTE on the trigger function is service-role only — anon and
-- authenticated are revoked (clears advisor 0028/0029), service_role retained.
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon',
    'public.protect_merchant_financial_columns()', 'EXECUTE'),
    'B: anon should NOT have EXECUTE on protect_merchant_financial_columns';
  ASSERT NOT has_function_privilege('authenticated',
    'public.protect_merchant_financial_columns()', 'EXECUTE'),
    'B: authenticated should NOT have EXECUTE on protect_merchant_financial_columns';
  ASSERT has_function_privilege('service_role',
    'public.protect_merchant_financial_columns()', 'EXECUTE'),
    'B: service_role SHOULD have EXECUTE on protect_merchant_financial_columns';
  RAISE NOTICE 'Scenario B passed: trigger-function grants locked to service_role';
END $$;
