-- Add 'cofounder' to public.users.role.
--
-- Co-founder is executive access that is *narrower* than admin: the founder
-- dashboard plus a read-only view of the acquisition pipeline. No admin console,
-- no merchant approvals, no fee reversals, no payouts. Until now the role did not
-- exist in the database and co-founders were provisioned as `admin`, which meant
-- "read the KPIs" and "reverse a success fee" were the same grant.
--
-- The baseline (20260630231915) declares the CHECK inline and therefore unnamed,
-- so Postgres auto-named it `users_role_check`. DROP ... IF EXISTS then re-ADD is
-- the only way to extend an inline CHECK, and it is safe here because the new
-- constraint is a strict superset of the old one: every row that satisfied the
-- old list satisfies the new one, so the implicit validation scan cannot fail.
--
-- Adding the value grants nothing on its own. RLS policies written as
-- `current_user_role() = 'admin'` do not match 'cofounder', which is the intended
-- posture rather than an oversight — see supabase/tests/cofounder_role_test.sql,
-- which asserts a co-founder cannot escalate its own role and does not inherit
-- admin's table policies. Route-level access lives in src/lib/roles.ts.
--
-- Timestamp note: this migration was authored on the branch
-- cursor/design-changes-expiry-map-nav-2718 as 20260727010000. That number sorts
-- *before* seven migrations already in this repo (20260729092118 through
-- 20260730190000), so applying it under the original name would insert it into
-- the middle of the chain. Renumbered to 2026-08-04 to land at the end, where it
-- belongs. See drift row D68 and docs/ops/unmerged-branch-inventory-2026-08-04.md.
--
-- That is repository ordering. Production's schema_migrations ledger was not read
-- when this was written, and drift D24 records that the ledger and this repo
-- disagree on four version numbers (as of 2026-08-04) — so check the ledger
-- before the apply rather than assuming this number is also the highest there.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

-- NOT VALID, then VALIDATE as a separate statement.
--
-- A plain ADD CONSTRAINT ... CHECK holds ACCESS EXCLUSIVE on public.users for
-- the whole validating scan, and this table takes a write on every first
-- sign-in — ensureAppUser() upserts the row. NOT VALID makes the ADD a catalog
-- update that returns immediately; VALIDATE CONSTRAINT then does the scan under
-- SHARE UPDATE EXCLUSIVE, which readers and writers do not block on. The end
-- state is a fully validated constraint either way.
--
-- The scan cannot fail: the new list is a strict superset of the old one, so
-- every row that satisfied the previous constraint satisfies this one. Keeping
-- the role literals inside the ADD CONSTRAINT statement also keeps
-- src/lib/__tests__/roles.test.ts able to parse them.
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'customer'::text,
    'merchant_admin'::text,
    'merchant_staff'::text,
    'agent'::text,
    'admin'::text,
    'cofounder'::text
  ])) NOT VALID;

ALTER TABLE public.users VALIDATE CONSTRAINT users_role_check;

COMMENT ON COLUMN public.users.role IS
  'App role. cofounder = founder dashboard + read-only acquisition pipeline; no admin console, no money actions.';
