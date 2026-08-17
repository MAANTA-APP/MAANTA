-- SEC: make the identity columns on public.users immutable to the row's holder.
--
-- ## The hole
--
-- RLS `users_own_row` is `FOR ALL USING (id = public.current_user_id())` with no
-- WITH CHECK, and `authenticated` holds the default UPDATE grant on the table.
-- Together they let any signed-in user PATCH their OWN row through PostgREST with
-- the publishable anon key and their session JWT. Exactly one column was
-- protected against that — `role`, by the `prevent_self_role_escalation` trigger
-- (20260705200856). `phone`, `clerk_user_id` and `auth_uid` were not, and all
-- three are identity, not profile:
--
--   * `public.current_user_id()` / `current_user_role()` resolve the caller from
--     `clerk_user_id = auth.jwt()->>'sub' OR auth_uid::text = auth.jwt()->>'sub'`.
--   * `getMerchantContext` (src/lib/merchant.ts:53-70) links a signed-in user
--     into a PRE-INVITED `merchant_staff` seat when `users.phone` equals a
--     `merchant_staff.phone` whose `user_id` is still null, and on match promotes
--     their role to `merchant_staff` and grants that seat's can_verify /
--     can_deals / can_topup / can_purchase.
--
-- So a shopper who knows a merchant's pre-registered, not-yet-signed-in staff
-- phone could PATCH their own `users.phone` to it and, on the next merchant
-- request, be linked as that staff member — able to verify redemptions (charging
-- the merchant KES 30 each) and to spend the merchant's wallet on boosts, at a
-- shop they have no relationship with. `users.phone` is assumed to be the
-- Clerk-verified number written once at provisioning (src/lib/auth.ts); letting
-- its holder overwrite it with an arbitrary UNVERIFIED value breaks that
-- assumption at the one place staff identity keys on it. `clerk_user_id` and
-- `auth_uid` are the JWT-resolution keys themselves and have even less business
-- being self-writable.
--
-- Proven read-only on production 2026-08-17: under `SET LOCAL ROLE authenticated`
-- with a crafted JWT, `UPDATE public.users SET phone=… WHERE id=<self>` updated 1
-- row; the same against another id updated 0 (RLS); a direct `role` change still
-- raised (the existing trigger). This trigger closes the gap the role trigger
-- left.
--
-- ## The fix
--
-- One more BEFORE UPDATE trigger, mirroring `prevent_self_role_escalation`
-- exactly: if `phone`, `clerk_user_id` or `auth_uid` actually change, require
-- service_role or an admin caller. It is column-scoped — it fires only when a
-- protected column changes — so every legitimate write is untouched:
--
--   * `push_subscription`, the ONLY column the anon/authenticated client writes
--     directly (src/app/api/push/subscribe/route.ts), still updates.
--   * Provisioning, the profile route (full_name / preferred_language) and the
--     staff role-bump all run through the service client (service_role) and
--     bypass the gate — same as the role trigger.
--   * An admin editing a user via the admin console is allowed by the
--     `current_user_role() = 'admin'` arm.
--
-- Guard: supabase/tests/users_identity_immutable_test.sql.

CREATE OR REPLACE FUNCTION public.prevent_identity_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.phone         IS DISTINCT FROM OLD.phone
     OR NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id
     OR NEW.auth_uid      IS DISTINCT FROM OLD.auth_uid THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: cannot change identity columns (phone, clerk_user_id, auth_uid)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger-only, no direct caller — mirrors prevent_self_role_escalation's grants.
REVOKE ALL ON FUNCTION public.prevent_identity_self_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_identity_self_change() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_identity_self_change() FROM authenticated;
REVOKE ALL ON FUNCTION public.prevent_identity_self_change() FROM service_role;

DROP TRIGGER IF EXISTS prevent_identity_self_change_trigger ON public.users;
CREATE TRIGGER prevent_identity_self_change_trigger
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.prevent_identity_self_change();

COMMENT ON FUNCTION public.prevent_identity_self_change() IS
  'Trigger guard on public.users: blocks changes to phone/clerk_user_id/auth_uid '
  'unless the caller is service_role or admin. Closes the merchant_staff-seat '
  'hijack via a self-written phone (see the migration header). EXECUTE revoked '
  'from every role — trigger-only, no direct caller.';
