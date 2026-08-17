-- ============================================================
-- Test: demo-data mutation RPCs are service_role-only, not internet-callable
-- (20260817140000_revoke_demo_mutation_rpc_public_execute.sql)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/demo_mutation_rpc_grants_test.sql
-- ============================================================

DO $$
DECLARE
  v_role TEXT;
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.wipe_demo_data(boolean)',
    'public.reseed_demo_flash_deals()',
    'public.refresh_demo_seed_deals()'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      ASSERT NOT has_function_privilege(v_role, v_fn, 'EXECUTE'),
        format('%s must NOT be able to execute %s', v_role, v_fn);
    END LOOP;
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'),
      format('service_role must retain EXECUTE on %s (cron + Makefile call it)', v_fn);
  END LOOP;
  RAISE NOTICE 'demo mutation RPCs are service_role-only — anon/authenticated execute revoked';
END $$;
