-- Follow-up to 20260720120000_security_hardening.
--
-- check_rate_limit must be service_role-only: it is the OTP / redemption
-- anti-brute-force control and is never meant to be callable by browser
-- clients (see docs/skills/security-hardening.md — "service_role only").
--
-- The prior migration revoked EXECUTE from PUBLIC and anon, but Supabase's
-- default privileges auto-grant EXECUTE on newly created public functions to
-- the `authenticated` role as well. That grant survived the earlier revokes,
-- leaving the rate-limit bucket table tamperable by any signed-in user via
-- /rest/v1/rpc/check_rate_limit. Revoke it explicitly so only service_role
-- (the server) and postgres can execute the function.

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM authenticated;

-- Re-assert the intended grants (idempotent; safe if already present).
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role, postgres;
