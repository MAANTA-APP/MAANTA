-- SEC: add `email` to the identity columns frozen against the row's holder.
--
-- ## Why now — email became an access-control input on 2026-08-19
--
-- Founder ruling of 2026-08-19 (D108's prevention half, decision-queue Q1
-- option A): when a Clerk JWT `sub` matches no `public.users` row, provisioning
-- falls back to matching the caller's Clerk-VERIFIED email against real rows,
-- and relinks on an exactly-one match (`ensureAppUserFromClerk`,
-- src/lib/auth.ts). That makes `users.email` the relink KEY — the same kind of
-- column `users.phone` became when staff-seat linking started matching on it,
-- and 20260817130000 (D124) froze phone for exactly this reason.
--
-- Email was left out of that trigger because at the time it was contact detail.
-- It no longer is, and the unfrozen column re-opens D124's shape one column
-- over: `authenticated` holds UPDATE on `public.users` (production grants —
-- D128) bounded to the caller's own row by RLS, so any signed-in shopper can
-- PATCH their OWN `email` through PostgREST. Two consequences once the fallback
-- ships:
--
--   * **Targeted lockout.** `users.email` has no UNIQUE constraint, so a shopper
--     who sets their own email to a target's address creates a second row
--     carrying it. The fallback's single-match rule then finds TWO rows for the
--     target after an instance change and hard-fails by design — the target
--     gets no account until an admin untangles it. The hard failure is correct
--     (never guess identity); letting an attacker manufacture the ambiguity is
--     not.
--   * **Poisoned relink target.** A row carrying an address its holder never
--     verified is a row a real person can later be relinked into. The app side
--     now writes only Clerk-verified emails (`verifiedPrimaryEmail`), which
--     closes provisioning; this closes the direct PostgREST write.
--
-- ## The fix
--
-- The same CREATE OR REPLACE as 20260817130000, with `email` added to the
-- guarded set. Column-scoped, so every legitimate write is untouched:
-- provisioning, the relink itself, the profile route and the staff role-bump
-- all run as service_role; an admin editing a user passes the admin arm;
-- `push_subscription` remains the one column the client writes directly.
--
-- Guard: supabase/tests/users_identity_immutable_test.sql — Scenario A now
-- covers email alongside phone/clerk_user_id/auth_uid, and Scenario C proves
-- the service_role and admin writes survive.

CREATE OR REPLACE FUNCTION public.prevent_identity_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.phone            IS DISTINCT FROM OLD.phone
     OR NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id
     OR NEW.auth_uid      IS DISTINCT FROM OLD.auth_uid
     OR NEW.email         IS DISTINCT FROM OLD.email THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: cannot change identity columns (phone, clerk_user_id, auth_uid, email)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_identity_self_change() IS
  'Trigger guard on public.users: blocks changes to phone/clerk_user_id/auth_uid/'
  'email unless the caller is service_role or admin. phone closes the '
  'merchant_staff-seat hijack (20260817130000, D124); email closes the '
  'relink-ambiguity lockout once the verified-email fallback ships '
  '(20260819200000, D142). EXECUTE revoked from every role — trigger-only.';

-- The trigger itself is unchanged: it already fires BEFORE UPDATE on every row
-- and calls this function, so replacing the function body is the whole change.
-- Grants were revoked from all roles by 20260817130000 and CREATE OR REPLACE
-- preserves them, so there is nothing to re-revoke.
