-- Follow-up to 20260723001651_lock_down_merchant_financial_columns.
--
-- That migration created the trigger function
-- public.protect_merchant_financial_columns() but left Supabase's default
-- privileges in place, so EXECUTE was auto-granted to PUBLIC (and to the
-- `authenticated` role explicitly). The security advisor flags this as
-- 0028 (anon can execute) / 0029 (authenticated can execute) because the
-- function is reachable at /rest/v1/rpc/protect_merchant_financial_columns.
--
-- It is a BEFORE UPDATE *trigger* function: calling it directly over PostgREST
-- has no useful effect (NEW/OLD are unset, so it errors), and direct writes to
-- public.merchants by `authenticated` are already blocked
-- (20260723120000_revoke_authenticated_writes_core_tables). So this is a
-- posture/advisor cleanup, not a live vulnerability — but we keep the repo and
-- prod converged and the linter quiet.
--
-- A trigger fires as part of the table operation regardless of the invoking
-- user's EXECUTE privilege on the function, so revoking EXECUTE from
-- anon/authenticated does NOT stop the trigger from protecting merchants rows.
-- We still re-assert EXECUTE for service_role/postgres (the roles the vetted
-- SECURITY DEFINER RPCs run as) to match the repo's lock-down idiom and cover
-- the legitimate write path belt-and-suspenders.

REVOKE ALL ON FUNCTION public.protect_merchant_financial_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_merchant_financial_columns() FROM anon;
REVOKE ALL ON FUNCTION public.protect_merchant_financial_columns() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.protect_merchant_financial_columns() TO service_role, postgres;
