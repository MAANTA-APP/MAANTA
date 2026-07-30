-- ============================================================================
-- Demo mode — the wipe must consider EVERY reference to a demo agent
--
-- Follow-up to 20260729142000, which is already applied, so the fix ships as
-- its own CREATE OR REPLACE rather than an edit to applied history.
--
-- What went wrong
-- ---------------
-- `wipe_demo_data()` retained a demo agent only when a row in `leads` pointed
-- at it. Five columns reference `public.agents(id)`, not one:
--
--   leads.agent_id                  NOT NULL   (never deleted by the wipe)
--   audit_logs.agent_id             NOT NULL   (only demo-merchant rows deleted)
--   agent_tasks.assigned_to         nullable   (only demo-merchant rows deleted)
--   fraud_events.agent_id           nullable   (only demo-parent rows deleted)
--   merchants.onboarded_by          nullable   (real merchants are never deleted)
--   merchants.assisted_by_agent_id  nullable   (same)
--
-- Enumerated from pg_constraint against the full migration chain, not from
-- reading the baseline: `assisted_by_agent_id` is the post-rename name of the
-- column 20260702083812 introduced as `onboarded_by_agent_id`.
--
-- Every one of those is ON DELETE NO ACTION. So a demo agent that audited a
-- REAL merchant, was assigned a task on one, was named on a surviving fraud
-- event, or onboarded one, would raise a foreign_key_violation and abort the
-- whole wipe — the exact failure mode the leads guard was written to prevent,
-- reached by four other routes. The production wipe only ever succeeded
-- because no demo agent happened to hold any of those references.
--
-- The fix
-- -------
-- 1. `demo_agent_is_retained()` replaces the single-table NOT EXISTS. It asks
--    the real question: after this wipe finishes, will anything still point at
--    this agent? Each clause is scoped to rows that SURVIVE the wipe, so the
--    predicate returns the same answer before and after the deletes — which is
--    what lets the dry run report an accurate count.
--
-- 2. The agents DELETE moves to after the merchants DELETE. `onboarded_by`
--    means a demo merchant can hold its own agent hostage; the child has to go
--    first. Agents still precede users, since `agents.user_id` requires it.
--
-- Nullable references are retained rather than detached on purpose. Nulling
-- `merchants.onboarded_by` on a real merchant would edit a real record to make
-- synthetic-data cleanup tidier; an orphan agent row is the cheaper mistake.
--
-- Rollback: re-apply 20260729142000_demo_mode_reseed.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.demo_agent_is_retained(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
     -- Leads are never deleted: a lead can be a real prospect even when the
     -- agent that captured it was synthetic.
     EXISTS (SELECT 1 FROM public.leads l WHERE l.agent_id = p_agent_id)
     -- Audit trails on real merchants survive; only demo-merchant rows go.
  OR EXISTS (
       SELECT 1 FROM public.audit_logs al
        WHERE al.agent_id = p_agent_id
          AND EXISTS (SELECT 1 FROM public.merchants m
                       WHERE m.id = al.merchant_id AND NOT m.is_demo))
  OR EXISTS (
       SELECT 1 FROM public.agent_tasks t
        WHERE t.assigned_to = p_agent_id
          AND EXISTS (SELECT 1 FROM public.merchants m
                       WHERE m.id = t.merchant_id AND NOT m.is_demo))
     -- Mirrors the wipe's own fraud_events predicate: a row is deleted only
     -- when its merchant OR its user is synthetic. Anything else survives.
  OR EXISTS (
       SELECT 1 FROM public.fraud_events f
        WHERE f.agent_id = p_agent_id
          AND NOT EXISTS (SELECT 1 FROM public.merchants m
                           WHERE m.id = f.merchant_id AND m.is_demo)
          AND NOT EXISTS (SELECT 1 FROM public.users u
                           WHERE u.id = f.user_id AND u.is_demo))
     -- Attribution on a real merchant. Real merchants are never deleted, so
     -- this reference outlives the wipe unconditionally.
  OR EXISTS (
       SELECT 1 FROM public.merchants m
        WHERE NOT m.is_demo
          AND (m.onboarded_by = p_agent_id
               OR m.assisted_by_agent_id = p_agent_id));
$fn$;

COMMENT ON FUNCTION public.demo_agent_is_retained(UUID) IS
  'TRUE when a row that survives wipe_demo_data() still references this agent, so deleting it would raise a foreign-key violation. Scoped to survivors, so it answers identically before and after the wipe.';

REVOKE EXECUTE ON FUNCTION public.demo_agent_is_retained(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.wipe_demo_data(p_confirm BOOLEAN DEFAULT FALSE)
RETURNS TABLE (table_name TEXT, rows_affected BIGINT, applied BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guardian    BIGINT;
  v_fraud       BIGINT;
  v_boost       BIGINT;
  v_audit       BIGINT;
  v_feerev      BIGINT;
  v_adminops    BIGINT;
  v_agents      BIGINT;
  v_agents_kept BIGINT;
  v_leads       BIGINT;
  v_tierflags   BIGINT;
  v_tasks       BIGINT;
  v_redemptions BIGINT;
  v_mtx         BIGINT;
  v_deals       BIGINT;
  v_merchants   BIGINT;
  v_users       BIGINT;
BEGIN
  -- Count everything first so the dry run reports the full blast radius,
  -- including the dependent rows the caller never explicitly asked about.
  SELECT count(*) INTO v_guardian FROM public.guardian_events g
    WHERE g.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
       OR g.deal_id     IN (SELECT id FROM public.deals     WHERE is_demo)
       OR g.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
  SELECT count(*) INTO v_fraud FROM public.fraud_events f
    WHERE f.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
       OR f.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
  SELECT count(*) INTO v_boost FROM public.boost_flags
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_audit FROM public.audit_logs
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_feerev FROM public.fee_reversals
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_adminops FROM public.admin_ops_log
    WHERE admin_user_id IN (SELECT id FROM public.users WHERE is_demo);
  SELECT count(*) INTO v_agents FROM public.agents a
    WHERE a.user_id IN (SELECT id FROM public.users WHERE is_demo)
      AND NOT public.demo_agent_is_retained(a.id);
  SELECT count(*) INTO v_agents_kept FROM public.agents a
    WHERE a.user_id IN (SELECT id FROM public.users WHERE is_demo)
      AND public.demo_agent_is_retained(a.id);
  SELECT count(*) INTO v_leads FROM public.leads
    WHERE converted_to IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_tierflags FROM public.tier_flags
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_tasks FROM public.agent_tasks
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_redemptions FROM public.redemptions           WHERE is_demo;
  SELECT count(*) INTO v_mtx         FROM public.merchant_transactions WHERE is_demo;
  SELECT count(*) INTO v_deals       FROM public.deals                 WHERE is_demo;
  SELECT count(*) INTO v_merchants   FROM public.merchants             WHERE is_demo;
  SELECT count(*) INTO v_users       FROM public.users                 WHERE is_demo;

  IF p_confirm THEN
    -- 1. Blocking dependents, scoped to demo parents. These are audit and
    --    fraud trails FOR SYNTHETIC MERCHANTS — deleting them removes a record
    --    of events that never really happened. Real merchants' trails are not
    --    in scope: every predicate keys off a demo parent id.
    DELETE FROM public.guardian_events g
      WHERE g.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
         OR g.deal_id     IN (SELECT id FROM public.deals     WHERE is_demo)
         OR g.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
    DELETE FROM public.fraud_events f
      WHERE f.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
         OR f.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
    DELETE FROM public.boost_flags
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.audit_logs
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.fee_reversals
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.admin_ops_log
      WHERE admin_user_id IN (SELECT id FROM public.users WHERE is_demo);

    -- 2. Leads are NEVER deleted — a lead can be a real prospect even when the
    --    merchant it converted to was synthetic. Detach instead.
    UPDATE public.leads SET converted_to = NULL
      WHERE converted_to IN (SELECT id FROM public.merchants WHERE is_demo);

    -- 3. A demo user staffing a real merchant: detach rather than delete, so
    --    the real merchant's staff list survives. (Rows on demo merchants
    --    cascade away with the merchant below.)
    UPDATE public.merchant_staff SET user_id = NULL
      WHERE user_id IN (SELECT id FROM public.users WHERE is_demo)
        AND merchant_id NOT IN (SELECT id FROM public.merchants WHERE is_demo);

    -- 4. Core rows, children before parents.
    DELETE FROM public.redemptions           WHERE is_demo;
    DELETE FROM public.merchant_transactions WHERE is_demo;
    DELETE FROM public.deals                 WHERE is_demo;
    DELETE FROM public.tier_flags  WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.agent_tasks WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.merchants             WHERE is_demo;

    -- 5. Agents come AFTER merchants: merchants.onboarded_by references
    --    agents(id), so a demo merchant would otherwise block its own agent.
    --    An agent anything surviving still points at is RETAINED and reported
    --    rather than deleted — see demo_agent_is_retained().
    DELETE FROM public.agents a
      WHERE a.user_id IN (SELECT id FROM public.users WHERE is_demo)
        AND NOT public.demo_agent_is_retained(a.id);

    -- 6. Retain any demo user still backing a retained agent.
    DELETE FROM public.users u
      WHERE u.is_demo
        AND NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = u.id);
  END IF;

  RETURN QUERY
    SELECT 'guardian_events'::TEXT,           v_guardian,    p_confirm
    UNION ALL SELECT 'fraud_events',          v_fraud,       p_confirm
    UNION ALL SELECT 'boost_flags',           v_boost,       p_confirm
    UNION ALL SELECT 'audit_logs',            v_audit,       p_confirm
    UNION ALL SELECT 'fee_reversals',         v_feerev,      p_confirm
    UNION ALL SELECT 'admin_ops_log',         v_adminops,    p_confirm
    UNION ALL SELECT 'agents',                v_agents,      p_confirm
    UNION ALL SELECT 'agents RETAINED (still referenced)', v_agents_kept, p_confirm
    UNION ALL SELECT 'leads (detached)',      v_leads,       p_confirm
    UNION ALL SELECT 'tier_flags',            v_tierflags,   p_confirm
    UNION ALL SELECT 'agent_tasks',           v_tasks,       p_confirm
    UNION ALL SELECT 'redemptions',           v_redemptions, p_confirm
    UNION ALL SELECT 'merchant_transactions', v_mtx,         p_confirm
    UNION ALL SELECT 'deals',                 v_deals,       p_confirm
    UNION ALL SELECT 'merchants',             v_merchants,   p_confirm
    UNION ALL SELECT 'users',                 v_users,       p_confirm;
END;
$$;

COMMENT ON FUNCTION public.wipe_demo_data(BOOLEAN) IS
  'Removes every is_demo row in FK order. DRY RUN by default — pass TRUE to apply. Real rows are never in scope; a demo agent still referenced by a surviving row is retained and reported.';

COMMIT;
