-- ============================================================
-- Security fix (audit 2026-07-10): purchase_boost, move_boost and
-- prevent_self_role_escalation were executable by anon / PUBLIC.
--
-- Root cause: CREATE FUNCTION grants EXECUTE to PUBLIC by default.
-- The creating migration (20260709210000_deal_pause_boosts_staff)
-- only ran `REVOKE ... FROM anon`, which is a no-op protection —
-- anon never held an explicit grant; it inherited EXECUTE through
-- the PUBLIC entry, which was left intact. prevent_self_role_escalation
-- (20260705200856) had no grant lockdown at all.
--
-- Fix follows the repo's established pattern
-- (20260702094233_lock_down_enforce_deal_success_fee_grants):
--   * RPCs called from user sessions: PUBLIC/anon revoked,
--     authenticated granted. service_role kept because both RPCs
--     carry an explicit auth.role() = 'service_role' bypass branch
--     (admin/ops tooling path).
--   * Trigger functions: EXECUTE revoked from everyone — trigger
--     invocation does not require an EXECUTE grant on the function.
-- ============================================================

-- purchase_boost: authenticated (merchant owner/admin via /api/boosts)
-- + service_role only.
REVOKE ALL ON FUNCTION public.purchase_boost(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_boost(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_boost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_boost(uuid, uuid) TO service_role;

-- move_boost: authenticated (merchant owner/admin via /api/boosts/move)
-- + service_role only.
REVOKE ALL ON FUNCTION public.move_boost(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_boost(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_boost(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_boost(uuid, uuid, uuid) TO service_role;

-- prevent_self_role_escalation: trigger-only (BEFORE UPDATE ON public.users),
-- no legitimate direct caller. Revoke from all roles.
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
