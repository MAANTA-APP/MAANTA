-- Security fix (audit 2026-07-10): purchase_boost, move_boost and
-- prevent_self_role_escalation were executable by anon / PUBLIC.
-- Mirrors repo migration 20260710090000_lock_down_boost_and_role_escalation_grants.sql

REVOKE ALL ON FUNCTION public.purchase_boost(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_boost(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_boost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_boost(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.move_boost(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_boost(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_boost(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_boost(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.prevent_self_role_escalation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_self_role_escalation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_self_role_escalation() FROM authenticated;
REVOKE ALL ON FUNCTION public.prevent_self_role_escalation() FROM service_role;

COMMENT ON FUNCTION public.purchase_boost(uuid, uuid) IS
  'Atomic 24h boost purchase: wallet debit + boost_flags + ledger entry + deals.boost_active. SECURITY DEFINER, self-authorizing (merchant owner or admin; service_role bypass). Grants locked 2026-07-10: authenticated + service_role only.';
COMMENT ON FUNCTION public.move_boost(uuid, uuid, uuid) IS
  'Reassign remaining boost window to another deal of the same merchant. SECURITY DEFINER, self-authorizing (merchant owner or admin; service_role bypass). Grants locked 2026-07-10: authenticated + service_role only.';
COMMENT ON FUNCTION public.prevent_self_role_escalation() IS
  'Trigger guard on public.users: blocks role changes unless caller is service_role or admin. EXECUTE revoked from all roles 2026-07-10 — trigger-only, no direct caller.';
