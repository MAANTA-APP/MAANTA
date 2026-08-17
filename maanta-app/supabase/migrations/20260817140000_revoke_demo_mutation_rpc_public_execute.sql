-- SEC (least privilege): the demo-data MUTATION RPCs are internet-callable.
--
-- `wipe_demo_data`, `reseed_demo_flash_deals` and `refresh_demo_seed_deals` are
-- SECURITY DEFINER and were never `REVOKE`d from PUBLIC, so — like the default
-- table grants behind D115 — `anon` and `authenticated` inherit the implicit
-- execute grant Postgres gives every function. Confirmed on production 2026-08-17
-- (`has_function_privilege('anon', …, 'EXECUTE') = true` for all three).
--
-- These are operational functions. Their only real callers are pg_cron (the
-- reseed/refresh jobs, 20260729142000 / 20260730010000) and the Makefile's
-- `DEMO_PSQL` connection — both privileged, neither anon/authenticated. Nothing
-- in src/ calls them through the browser client.
--
-- Impact today is bounded, not nil:
--   * `wipe_demo_data(TRUE)` refuses while demo mode is ON (it self-checks and
--     raises), so it cannot empty the live rehearsal dataset right now. But that
--     guard is a mode flag, not an authorization check — at the demo-off launch
--     moment it becomes a live DELETE of every `is_demo` row that any anonymous
--     caller can trigger, racing whoever is doing the cutover.
--   * `reseed`/`refresh` self-gate to demo mode and cap to an app_config ceiling,
--     so they are not a DoS — but an anonymous caller can still churn the demo
--     surfaces on demand.
-- A destructive/operational function should not depend on a mode flag to be
-- safe from the open internet. Lock execute to service_role + postgres, matching
-- how check_rate_limit and the other internal RPCs are already scoped.
--
-- Guard: supabase/tests/demo_mutation_rpc_grants_test.sql.

REVOKE ALL ON FUNCTION public.wipe_demo_data(boolean)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reseed_demo_flash_deals()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_demo_seed_deals()        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.wipe_demo_data(boolean)       TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.reseed_demo_flash_deals()     TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.refresh_demo_seed_deals()     TO service_role, postgres;
