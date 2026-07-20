-- anon least-privilege lockdown.
--
-- Reconciles a change already applied to the live database out-of-band
-- (recorded there as migration 20260720000644). anon previously held broad
-- grants across every public table, gated only by RLS. This strips anon to
-- read-only on the two pre-sign-in browse surfaces — deals and merchants,
-- which the shopper feed ranks from — and hardens default privileges so future
-- public tables never inherit anon grants. RLS and all authenticated /
-- service_role behaviour are untouched.
--
-- Why capture it here: applying via the Supabase tooling recorded the change in
-- the live DB's migration history but never wrote a repo migration, so a
-- from-scratch build (`supabase start`, the CI db-tests job) would NOT reproduce
-- the live anon posture — the same drift class reconciled for rls_auto_enable in
-- the 20260703233440 migration.
--
-- Idempotent and safe to re-apply: on the live DB (already locked down) this is
-- a no-op in effect; on a from-scratch build it reproduces the live posture. The
-- filename version matches the version recorded on prod so the repo and prod
-- migration histories stay in lockstep. It sorts last, after every table exists,
-- so the blanket REVOKE cannot miss a table.

-- 1. Strip every anon grant on existing public tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;

-- 2. Re-grant read-only on the pre-sign-in browse surfaces only.
GRANT SELECT ON public.deals     TO anon;
GRANT SELECT ON public.merchants TO anon;

-- 3. Harden default privileges: future public tables must not grant anon.
--    (Counters the Supabase default that grants anon on newly created tables.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
