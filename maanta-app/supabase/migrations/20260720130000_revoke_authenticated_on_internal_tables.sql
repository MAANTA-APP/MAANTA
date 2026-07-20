-- Least-privilege: strip `authenticated` grants on server-only internal tables.
--
-- Closes advisor lint 0027 (pg_graphql_authenticated_table_exposed) for the
-- internal/ops tables below. Supabase's default privileges grant `authenticated`
-- access on every public table, which makes these discoverable — and queryable —
-- through the auto-generated PostgREST / GraphQL API by ANY signed-in user
-- (RLS still governs rows, but the schema and any RLS-permitted rows are
-- reachable). None of these tables are meant to be client-reachable.
--
-- Safe because the application never touches any of them through the
-- anon/authenticated client: every reference in the codebase goes through the
-- service-role client (`lib/supabase/service`, RLS/grants bypassed) or a
-- SECURITY DEFINER RPC (which executes as its definer, not the calling role).
-- Verified table-by-table against the app source. RLS, service_role, and every
-- user-facing table (users, deals, merchants, redemptions, merchant_transactions,
-- merchant_staff, merchant_favourites, notifications, …) are left untouched.
--
-- REVOKE ALL (not just SELECT): the Supabase default also grants INSERT/UPDATE/
-- DELETE to `authenticated`, a strictly larger exposure than the SELECT the
-- advisor flags. Idempotent — a no-op where the grant is already absent.

REVOKE ALL PRIVILEGES ON TABLE
  public.audit_logs,
  public.fraud_events,
  public.payment_webhook_failures,
  public.agent_tasks,
  public.archive_history,
  public.reporting_aggregates,
  public.kpi_counters,
  public.api_rate_limit_buckets,
  public.agents,
  public.leads,
  public.organizations,
  public.tier_flags,
  public.boost_flags,
  public.app_config
FROM authenticated;
