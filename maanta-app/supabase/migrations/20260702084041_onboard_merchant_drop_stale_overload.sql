-- CREATE OR REPLACE FUNCTION does not replace a function when the argument list
-- changes -- Postgres treats a different signature as a new overload. Adding
-- p_onboarding_agent_id therefore left the OLD 10-arg onboard_merchant sitting in
-- the catalog as dead code, AND caused the NEW 11-arg version to be created as a
-- fresh function object that received Postgres's default PUBLIC execute grant
-- instead of inheriting the earlier revoke_anon_execute_all_functions lockdown.
-- Drop the stale overload and explicitly re-lock the current one down to anon.

DROP FUNCTION IF EXISTS public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text
);

REVOKE EXECUTE ON FUNCTION public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.onboard_merchant(
  uuid, text, text, text, text, text, text, text, text, text, uuid
) TO authenticated, service_role;
