-- ============================================================
-- Cofounder DB read scope (drift D74).
--
-- The cofounder role (20260804010000) existed only as a CHECK-constraint
-- value: every RLS policy was written as current_user_role() = 'admin', so at
-- the database layer a co-founder session was indistinguishable from a plain
-- authenticated user. The documented scope (docs/skills/role-permissions.md)
-- — reaches /founder, reads /agent/*, no /admin, no lead writes — was
-- app-enforced only, which breaks the house rule that backend is the source
-- of truth for access control (the D25 lesson). This migration lands the DB
-- layer BEFORE the role is ever assigned (assignment is founder-held, Q14).
--
-- Contract (from the D74 register row and the #175 review warning):
--   * SELECT-only, as NEW standalone policies. Never add 'cofounder' to an
--     existing policy — leads_agent and friends are FOR ALL, so widening them
--     would grant writes against the documented read-only scope.
--   * The table list is the enumerated read surface of the two consoles the
--     role reaches, nothing more:
--       /founder dashboard reads: users, merchants, deals, redemptions,
--         merchant_transactions, agent_tasks   (src/app/founder/page.tsx)
--       /agent/* read-only:       leads, agents (+ merchants, above)
--     Deliberately absent: fraud_events, audit_logs, archive_history,
--     favourites, and every write path — those are admin/agent surfaces the
--     role is defined to be excluded from.
--
-- The app reads these pages via service_role today, so this changes no
-- runtime behavior; it makes the database itself express — and enforce — the
-- scope the docs promise, so a future user-JWT read path cannot silently
-- widen or dead-end the role.
--
-- Verified by supabase/tests/cofounder_role_test.sql, rewritten with this
-- migration: it now asserts these exact policies exist and are SELECT-only
-- (inverting its previous "no policy names cofounder" posture), asserts the
-- role can read a lead but not write one nor read fraud_events, and keeps the
-- self-promotion check.
-- ============================================================

-- Founder dashboard surface -------------------------------------------------

DROP POLICY IF EXISTS users_cofounder_read ON public.users;
CREATE POLICY users_cofounder_read ON public.users
  FOR SELECT USING (public.current_user_role() = 'cofounder');
COMMENT ON POLICY users_cofounder_read ON public.users IS
  'D74: /founder dashboard KPI counts read users. Read-only executive scope; writes stay admin/service_role.';

DROP POLICY IF EXISTS merchants_cofounder_read ON public.merchants;
CREATE POLICY merchants_cofounder_read ON public.merchants
  FOR SELECT USING (public.current_user_role() = 'cofounder');

DROP POLICY IF EXISTS deals_cofounder_read ON public.deals;
CREATE POLICY deals_cofounder_read ON public.deals
  FOR SELECT USING (public.current_user_role() = 'cofounder');

DROP POLICY IF EXISTS redemptions_cofounder_read ON public.redemptions;
CREATE POLICY redemptions_cofounder_read ON public.redemptions
  FOR SELECT USING (public.current_user_role() = 'cofounder');

DROP POLICY IF EXISTS transactions_cofounder_read ON public.merchant_transactions;
CREATE POLICY transactions_cofounder_read ON public.merchant_transactions
  FOR SELECT USING (public.current_user_role() = 'cofounder');

DROP POLICY IF EXISTS agent_tasks_cofounder_read ON public.agent_tasks;
CREATE POLICY agent_tasks_cofounder_read ON public.agent_tasks
  FOR SELECT USING (public.current_user_role() = 'cofounder');

-- Agent console read surface ------------------------------------------------

DROP POLICY IF EXISTS leads_cofounder_read ON public.leads;
CREATE POLICY leads_cofounder_read ON public.leads
  FOR SELECT USING (public.current_user_role() = 'cofounder');
COMMENT ON POLICY leads_cofounder_read ON public.leads IS
  'D74: cofounder may look at the pipeline and may not add to it — SELECT only, standalone. Do not fold into leads_agent (FOR ALL): that would grant lead writes against the documented read-only scope.';

DROP POLICY IF EXISTS agents_cofounder_read ON public.agents;
CREATE POLICY agents_cofounder_read ON public.agents
  FOR SELECT USING (public.current_user_role() = 'cofounder');

-- Table grants --------------------------------------------------------------
-- RLS decides which rows; the grant decides whether PostgREST/user-JWT reads
-- are possible at all. Mirrors the explicit-grant precedent in
-- 20260723*_revoke_authenticated_writes_core_tables.sql: migration-created
-- tables do not always inherit dashboard default privileges in from-scratch
-- CI. SELECT-only; no write grant is added anywhere. Row visibility for
-- non-cofounder roles is unchanged — their policies are untouched.
GRANT SELECT ON TABLE
  public.users,
  public.merchant_transactions,
  public.agent_tasks,
  public.leads,
  public.agents
TO authenticated;
-- (merchants, deals, redemptions already carry an explicit authenticated
-- SELECT grant from the revoke migration.)
