-- ============================================================
-- Test: merchant financial-column protection + locked-down grants + the
--       sanctioned-write bypass used by the money-path RPCs.
--   migrations 20260723001651_lock_down_merchant_financial_columns.sql
--            + 20260724120000_harden_protect_merchant_financial_columns_grants.sql
--            + 20260724130000_allow_sanctioned_merchant_financial_writes.sql
--
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/protect_merchant_financial_columns_test.sql
-- ============================================================

-- Scenario A: a non-service caller (JWT role 'authenticated') without the
-- sanctioned-write flag cannot move ANY protected column on merchants — the
-- BEFORE UPDATE trigger raises 'protected_column'. Covers the full protected
-- set so a regression that drops one column from the guard fails CI. (The psql
-- superuser connection bypasses table-level ACL, so this exercises the trigger
-- itself, not the separate authenticated-write revoke.)
DO $$
DECLARE
  v_uid UUID;
  v_auth UUID := gen_random_uuid();
  v_mid UUID;
  v_err TEXT;
  i INT;
  -- Each protected column paired with a SQL expression that yields a value
  -- distinct from the seeded row (so the trigger's IS DISTINCT FROM check fires).
  v_names TEXT[] := ARRAY[
    'account_balance','outstanding_arrears','status','tier','trust_metric',
    'is_shadow_banned','is_featured','elite_trial_active',
    'trial_ends_at','grace_period_ends_at','user_id','organization_id'
  ];
  v_exprs TEXT[] := ARRAY[
    'account_balance + 100000',
    'outstanding_arrears + 50',
    quote_literal('active'),                             -- seeded 'pending'
    quote_literal('elite'),                              -- seeded 'standard'
    '0.4242',                                            -- distinct from default
    'NOT COALESCE(is_shadow_banned, false)',
    'NOT COALESCE(is_featured, false)',
    'NOT COALESCE(elite_trial_active, false)',
    quote_literal((NOW() + INTERVAL '365 days')::text),  -- cast text→timestamptz on assign
    quote_literal((NOW() + INTERVAL '366 days')::text),
    'gen_random_uuid()',                                 -- trigger raises before FK check
    'gen_random_uuid()'
  ];
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, tier, user_id)
    VALUES ('__test_protect_matrix', 'test.protect.matrix', '+254700000702', 'BBS Mall', 'pending', 'standard', v_uid)
    RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  FOR i IN 1 .. array_length(v_names, 1) LOOP
    BEGIN
      EXECUTE format('UPDATE public.merchants SET %I = %s WHERE id = %L',
                     v_names[i], v_exprs[i], v_mid);
      RAISE EXCEPTION 'A: % update should have been blocked', v_names[i];
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      ASSERT v_err LIKE '%protected_column%',
        format('A[%s]: unexpected error: %s', v_names[i], v_err);
    END;
  END LOOP;

  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: every protected column blocked for non-service caller';
END $$;

-- Scenario B: EXECUTE on the trigger function is service-role only — anon and
-- authenticated are revoked (clears advisor 0028/0029); service_role and
-- postgres (the roles the sanctioned SECURITY DEFINER RPCs run as) retain it.
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
  ASSERT has_function_privilege('postgres',
    'public.protect_merchant_financial_columns()', 'EXECUTE'),
    'B: postgres SHOULD have EXECUTE on protect_merchant_financial_columns';
  RAISE NOTICE 'Scenario B passed: trigger-function grants locked to service_role/postgres';
END $$;

-- Scenario C: with the sanctioned-write flag set (as verify_redemption /
-- purchase_boost / move_boost carry via ALTER FUNCTION … SET), a protected
-- column CAN be updated even under an authenticated JWT. This is the internal
-- money-path write that migration 20260724130000 restores; without it,
-- merchant-driven redemption verification and boosts fail with 'protected_column'.
DO $$
DECLARE
  v_uid UUID;
  v_auth UUID := gen_random_uuid();
  v_mid UUID;
  v_bal NUMERIC;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, user_id, account_balance)
    VALUES ('__test_protect_bypass', 'test.protect.bypass', '+254700000703', 'BBS Mall', 'active', v_uid, 100)
    RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  -- Simulate being inside a sanctioned RPC.
  PERFORM set_config('app.allow_protected_merchant_write', 'on', true);

  UPDATE public.merchants SET account_balance = account_balance + 70 WHERE id = v_mid;
  SELECT account_balance INTO v_bal FROM public.merchants WHERE id = v_mid;
  ASSERT v_bal = 170, format('C: expected balance 170 after sanctioned write, got %s', v_bal);

  PERFORM set_config('app.allow_protected_merchant_write', 'off', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario C passed: sanctioned-write flag permits protected update';
END $$;
