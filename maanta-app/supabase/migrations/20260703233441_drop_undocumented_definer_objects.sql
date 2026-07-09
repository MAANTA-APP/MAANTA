-- D-002 remediation (audit 2026-07-04, founder-approved).
-- 1. Drop the two undocumented SECURITY DEFINER views (advisor ERROR level,
--    created outside the migration pipeline, zero dependents per pg_depend,
--    no caller in any deployed code). Feed/health read paths will be rebuilt
--    deliberately in their own Build sessions (feed slice / queue item #5).
DROP VIEW IF EXISTS public.vw_active_feed;
DROP VIEW IF EXISTS public.vw_merchant_health;

-- 2. rls_auto_enable() is KEPT — it is wired to event trigger ensure_rls
--    (ddl_command_end) and auto-enables RLS on newly created tables, a
--    protection, not a risk. Lock down its EXECUTE grants only: event
--    triggers fire as the superuser performing the DDL, so no client role
--    needs (or should have) direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM service_role;
