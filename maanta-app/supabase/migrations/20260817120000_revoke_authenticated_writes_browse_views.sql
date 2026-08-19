-- SEC: strip authenticated/anon WRITE grants from every public view.
--
-- ## The hole
--
-- 20260723120000_revoke_authenticated_writes_core_tables.sql revoked
-- INSERT/UPDATE/DELETE on merchants, deals and redemptions from `authenticated`,
-- because Supabase's default privileges hand `ALL` to anon/authenticated on
-- every object in `public` and the RLS policies on those tables are
-- unrestricted `FOR ALL` with no column-level WITH CHECK.
--
-- One day later, 20260723130000_fix_browse_views_security_invoker.sql set
-- `security_invoker = false` on the two browse views — deliberately, and
-- correctly for reads: anon's SELECT on the base tables had just been revoked,
-- so an invoker view could not serve the pre-sign-in browse surface.
--
-- Both changes are right on their own. Together they open a write path that
-- neither one considered:
--
--   * `public.merchants_public_browse` selects from ONE table, with no join and
--     only plain column references, so PostgreSQL makes it **auto-updatable**
--     (`information_schema.views.is_updatable = YES`, every column
--     `is_updatable = YES`).
--   * `security_invoker = false` means the underlying write is performed as the
--     view OWNER — `postgres`, which holds `rolbypassrls` — so RLS on
--     `public.merchants` is not applied at all.
--   * The REVOKE above named the TABLE. The VIEW kept Supabase's default
--     `INSERT, UPDATE, DELETE` grant to `authenticated`. Nothing ever revoked it.
--
-- Net effect on production, measured 2026-08-17 on axrrslqssmbngbataejg:
-- **any signed-in user** — a shopper, not just a merchant — could PATCH or
-- DELETE `public.merchants` through the view with the publishable anon key and
-- their own session JWT, bypassing both the grant revoke and every RLS policy.
-- `EXPLAIN` under `SET ROLE authenticated` planned as
-- `Update on merchants … rows=40` with no RLS filter; the same statement
-- against the base table raised `42501 permission denied for table merchants`.
--
-- Reachable columns were the view's own list: `tier` (free Elite, KES 3,500/mo),
-- `status`, `is_visible` and `is_shadow_banned`-adjacent visibility, `is_featured`,
-- `trust_metric` (a fraud input), and the physical-location fields a shopper
-- walks to — `what3words_address`, `floor`, `unit_number`. The view's WHERE
-- clause limits which rows are *reachable* (active, visible, non-shadow-banned)
-- but not which rows a reachable statement may touch: every other live merchant
-- at the node is in scope, so this was competitor sabotage as much as
-- self-promotion. `account_balance` is not a view column, so the wallet itself
-- was never directly writable.
--
-- ## The fix
--
-- Revoke the write privileges. Reads are untouched — the browse surface keeps
-- working exactly as before, and `security_invoker = false` stays, because it is
-- what makes anon browse possible and is not the defect.
--
-- Scoped to all four views rather than the one that is exploitable today. The
-- other three are inert only by accident of their current shape: a join, or a
-- security_invoker flag, that a later `CREATE OR REPLACE VIEW` can remove
-- without anyone noticing — which is exactly how this got here (20260726120000
-- and 20260729141000 both recreated `merchants_public_browse`, and neither
-- needed to think about grants). Revoking the class costs nothing: nothing in
-- `src/`, `scripts/` or the Makefile writes through a view.
--
-- The durable guard is Scenario G in supabase/tests/browse_views_test.sql,
-- which fails on ANY view in `public` that grants a write to anon or
-- authenticated — so a view added later inherits the default grant and fails CI
-- rather than shipping.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.merchants_public_browse,
  public.deals_public_browse,
  public.admin_fee_reversal_log,
  public.demo_data_census
FROM anon, authenticated;

COMMENT ON VIEW public.merchants_public_browse IS
  'Anon/authenticated browse projection over public.merchants. security_invoker = false '
  'so pre-sign-in reads work without base-table grants; the view is auto-updatable, so '
  'INSERT/UPDATE/DELETE are revoked from anon and authenticated (20260817120000). '
  'Read-only by grant — do not re-grant a write here.';

COMMENT ON VIEW public.deals_public_browse IS
  'Anon/authenticated browse projection over public.deals, filtered to live, unpaused, '
  'unexpired deals of active merchants. security_invoker = false; writes revoked from '
  'anon and authenticated (20260817120000). Read-only by grant.';
