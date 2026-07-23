-- ============================================================
-- Test: admin_ops_log (20260723140000_admin_ops_log.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_ops_log_test.sql
-- ============================================================

-- Scenario A: grant posture — service_role writes, authenticated cannot reach table.
DO $$
BEGIN
  ASSERT has_table_privilege('service_role', 'public.admin_ops_log', 'INSERT'),
    'A: service_role must INSERT admin_ops_log';
  ASSERT has_table_privilege('authenticated', 'public.admin_ops_log', 'SELECT'),
    'A: authenticated must retain SELECT on admin_ops_log (RLS-gated)';
  ASSERT NOT has_table_privilege('authenticated', 'public.admin_ops_log', 'INSERT'),
    'A: authenticated must not INSERT admin_ops_log';
  RAISE NOTICE 'Scenario A passed: admin_ops_log grants are service_role-only';
END $$;

-- Scenario B: service_role can append and admin can read via RLS.
DO $$
DECLARE
  v_admin UUID;
  v_admin_auth UUID := gen_random_uuid();
  v_mid UUID;
  v_log_id UUID;
  v_count INT;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('admin', v_admin_auth) RETURNING id INTO v_admin;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible
  )
    VALUES ('__test_admin_ops', 'test.admin.ops', '+254700000501', 'BBS Mall', 'active', TRUE)
    RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.admin_ops_log (admin_user_id, action, target_type, target_id, details)
    VALUES (v_admin, 'merchant.suspend', 'merchant', v_mid, '{"source":"test"}'::jsonb)
    RETURNING id INTO v_log_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_auth, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_count
    FROM public.admin_ops_log
    WHERE id = v_log_id AND action = 'merchant.suspend';
  ASSERT v_count = 1, format('B: admin should read audit row, got %s', v_count);

  DELETE FROM public.admin_ops_log WHERE id = v_log_id;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_admin;
  RAISE NOTICE 'Scenario B passed: admin_ops_log write + admin read';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL admin_ops_log scenarios passed.'; END $$;
