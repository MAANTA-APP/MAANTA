-- Fix: enforce_deal_success_fee() is a trigger function only — it has no
-- legitimate direct caller and should never have been left with default
-- PUBLIC EXECUTE. Caught by get_advisors (security) immediately after the
-- harden_success_fee_amount migration: it was reachable by both anon and
-- authenticated via /rest/v1/rpc/enforce_deal_success_fee. Revoking from
-- everyone, including authenticated/service_role/postgres — trigger
-- invocation does not require an EXECUTE grant on the function itself.
REVOKE ALL ON FUNCTION public.enforce_deal_success_fee() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_deal_success_fee() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_deal_success_fee() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_deal_success_fee() FROM service_role;

COMMENT ON FUNCTION public.enforce_deal_success_fee IS
  'Security hardening 2026-07-02: forces deals.success_fee to the canonical app_config.success_fee_kes value on every write, regardless of client input. Closes a merchant-side fee-tampering path (deals RLS policy is unrestricted ALL with no WITH CHECK). SECURITY DEFINER because app_config is admin-only under RLS. EXECUTE revoked from all roles including authenticated/service_role/postgres — trigger-only, no legitimate direct caller (fixed same session after get_advisors flagged it as anon/authenticated-reachable via PostgREST RPC).';
