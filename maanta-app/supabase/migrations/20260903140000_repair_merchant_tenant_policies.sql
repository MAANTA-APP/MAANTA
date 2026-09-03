-- =============================================================================
-- D168 — ten tenant-isolation policies ERROR instead of filtering.
--
-- ## Root cause (measured, not inferred)
--
-- Ten RLS policies scope a row to the caller's shops with the same subquery:
--
--     merchant_id IN (SELECT id FROM public.merchants WHERE user_id = current_user_id())
--
-- An RLS predicate is evaluated as the INVOKING role. D147
-- (`20260820120000_revoke_customer_base_table_reads_merchants_deals.sql`)
-- deliberately revoked base-table SELECT on `merchants` from `anon` and
-- `authenticated`, so from that migration onward the subquery could no longer
-- read the table it names. Evaluating any of these policies as `authenticated`
-- raises `42501 permission denied for table merchants` — the query fails
-- outright instead of returning the caller's own rows.
--
-- Reproduced 2026-09-03 on production AND on a fresh chain built from this
-- repository, so it is a defect in the migration chain, not production drift:
--
--     redemptions           -> 42501 permission denied for table merchants
--     merchant_transactions -> 42501 permission denied for table merchants
--     pending_topups        -> 42501 permission denied for table merchants
--
-- Those three are the LIVE surface: they are the only affected tables on which
-- `authenticated` holds any privilege at all. The other seven
-- (archive_history, boost_flags, deals, kpi_counters, merchant_staff,
-- reporting_aggregates, tier_flags) grant `authenticated` nothing, so their
-- policies are never reached today — dormant, not safe. They are repaired here
-- too, because the trap re-arms the moment any of them is granted.
--
-- Nothing leaked: the failure is a hard error, and every live merchant surface
-- reads through the service client with an app-layer `merchant_id` predicate.
-- This is a reliability and defence-in-depth defect, not a disclosure.
--
-- ## The repair, and why it is not a grant
--
-- Restoring `SELECT` on `merchants` to `authenticated` would silence the error
-- by handing every signed-in shopper the merchant table — the exact isolation
-- D147 was written to remove. So instead the ownership lookup moves behind a
-- `SECURITY DEFINER` helper that returns ONLY the ids of shops the caller owns.
--
-- Why that is safe:
--   * it takes no arguments — a caller cannot ask about anyone else;
--   * it filters on `current_user_id()` internally, so the answer is derived
--     from the session, never from input;
--   * it returns bare uuids, never a merchant row, so no merchant column
--     (name, balance, phone, coordinates) is reachable through it;
--   * `anon` keeps no EXECUTE, and an unauthenticated caller would get an
--     empty set regardless because `current_user_id()` is NULL;
--   * D147's revoke stands untouched — `authenticated` still cannot select
--     from `merchants`.
--
-- Every policy below keeps its EXACT prior semantics: same command, same admin
-- and role clauses, same shape. The only change is where the id list comes
-- from. Recreated with USING only, exactly as before, so ALL-policies keep
-- deriving WITH CHECK from USING.
--
-- Guard: supabase/tests/merchant_tenant_policy_repair_test.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_merchant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.id FROM public.merchants m
   WHERE m.user_id = public.current_user_id()
$$;

COMMENT ON FUNCTION public.current_user_merchant_ids() IS
  'D168: the shop ids owned by the calling user. SECURITY DEFINER so a tenant RLS predicate can resolve ownership without granting authenticated SELECT on merchants (D147). Takes no arguments and filters on current_user_id(), so it cannot be asked about another user; returns ids only, never merchant columns.';

REVOKE ALL ON FUNCTION public.current_user_merchant_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_merchant_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_merchant_ids() TO authenticated, service_role, postgres;

-- --- The three LIVE policies ------------------------------------------------

DROP POLICY IF EXISTS transactions_merchant ON public.merchant_transactions;
CREATE POLICY transactions_merchant ON public.merchant_transactions
  FOR SELECT USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS pending_topups_merchant_read ON public.pending_topups;
CREATE POLICY pending_topups_merchant_read ON public.pending_topups
  FOR SELECT USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
  );

DROP POLICY IF EXISTS redemptions_merchant ON public.redemptions;
CREATE POLICY redemptions_merchant ON public.redemptions
  FOR ALL USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    AND public.current_user_role() = ANY (ARRAY['merchant_admin', 'merchant_staff'])
  );

-- --- The seven dormant policies, repaired before they are ever granted ------

DROP POLICY IF EXISTS archive_merchant ON public.archive_history;
CREATE POLICY archive_merchant ON public.archive_history
  FOR ALL USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
  );

DROP POLICY IF EXISTS boost_flags_merchant ON public.boost_flags;
CREATE POLICY boost_flags_merchant ON public.boost_flags
  FOR ALL USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS deals_merchant ON public.deals;
CREATE POLICY deals_merchant ON public.deals
  FOR ALL USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    AND public.current_user_role() = ANY (ARRAY['merchant_admin', 'merchant_staff'])
  );

DROP POLICY IF EXISTS kpi_merchant ON public.kpi_counters;
CREATE POLICY kpi_merchant ON public.kpi_counters
  FOR SELECT USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS staff_owner_manage ON public.merchant_staff;
CREATE POLICY staff_owner_manage ON public.merchant_staff
  FOR ALL USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS reporting_merchant ON public.reporting_aggregates;
CREATE POLICY reporting_merchant ON public.reporting_aggregates
  FOR SELECT USING (
    (entity_type = 'merchant'
     AND entity_id IN (SELECT public.current_user_merchant_ids()))
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS tier_flags_merchant ON public.tier_flags;
CREATE POLICY tier_flags_merchant ON public.tier_flags
  FOR ALL USING (
    merchant_id IN (SELECT public.current_user_merchant_ids())
    OR public.current_user_role() = 'admin'
  );
