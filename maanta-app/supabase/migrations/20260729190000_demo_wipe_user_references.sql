-- ============================================================================
-- Demo mode — the wipe must consider references to demo USERS too
--
-- Follow-up to 20260729170000, which fixed exactly this bug class on the
-- `agents` side and stopped there. Neither is applied to production yet.
--
-- What went wrong
-- ---------------
-- 20260729170000 made `wipe_demo_data()` retain a demo AGENT that any surviving
-- row still referenced. It did not ask the same question about demo USERS.
-- Nine non-CASCADE foreign keys point at `public.users`; the wipe explicitly
-- clears five of them and relies on CASCADE for none. Four are unhandled:
--
--   merchants.user_id                -- a real merchant owned by a demo user
--   merchants.onboarded_by_user_id   -- a real merchant onboarded by one
--   redemptions.user_id              -- a real redemption made by one
--   fee_reversals.approver_user_id   -- a real reversal approved by one
--
-- All four are ON DELETE NO ACTION, so any such row aborts
-- `DELETE FROM public.users` and takes the whole wipe down with it — and the
-- dry run does not surface it, because the old count was a flat
-- `count(*) WHERE is_demo` that ignored the question entirely.
--
-- These are not hypothetical in the direction that matters: a demo account
-- used to rehearse an onboarding or a counter verification against a REAL
-- merchant leaves exactly these rows behind. That is a normal thing to do
-- during a rehearsal, which is when demo mode is on.
--
-- The fix
-- -------
-- `demo_user_is_retained()`, mirroring `demo_agent_is_retained()`: it asks
-- whether anything that SURVIVES the wipe still points at this user. Each
-- clause is scoped to survivors, so it answers identically before and after
-- the deletes — which is what makes the dry-run count truthful.
--
-- The `v_users` inventory now uses the same predicate as the DELETE, so the
-- dry run stops overstating what will be removed, and retained users are
-- reported on their own line rather than silently surviving.
--
-- Rollback: re-apply 20260729170000_demo_wipe_agent_references.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.demo_user_is_retained(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
     -- Real merchants are never deleted, so either reference outlives the wipe.
     EXISTS (
       SELECT 1 FROM public.merchants m
        WHERE NOT m.is_demo
          AND (m.user_id = p_user_id OR m.onboarded_by_user_id = p_user_id))
     -- The wipe deletes redemptions on `is_demo` alone; a real one survives.
  OR EXISTS (
       SELECT 1 FROM public.redemptions r
        WHERE r.user_id = p_user_id AND NOT r.is_demo)
     -- Mirrors the wipe's own fee_reversals predicate: only rows on a demo
     -- merchant are cleared, so one on a real merchant survives.
  OR EXISTS (
       SELECT 1 FROM public.fee_reversals f
        WHERE f.approver_user_id = p_user_id
          AND NOT EXISTS (SELECT 1 FROM public.merchants m
                           WHERE m.id = f.merchant_id AND m.is_demo));
$fn$;

COMMENT ON FUNCTION public.demo_user_is_retained(UUID) IS
  'TRUE when a row that survives wipe_demo_data() still references this user, so deleting it would raise a foreign-key violation. Scoped to survivors, so it answers identically before and after the wipe. Does not cover agents.user_id — the wipe handles that separately, after agents are removed.';

REVOKE EXECUTE ON FUNCTION public.demo_user_is_retained(UUID) FROM PUBLIC;

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
  v_users_kept  BIGINT;
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
  -- Same predicate as the DELETE in step 6, so the dry run reports what will
  -- actually go rather than every demo user. Agents are excluded here too: a
  -- user backing an agent that survives cannot be deleted either.
  SELECT count(*) INTO v_users FROM public.users u
    WHERE u.is_demo
      AND NOT public.demo_user_is_retained(u.id)
      AND NOT EXISTS (SELECT 1 FROM public.agents a
                       WHERE a.user_id = u.id AND public.demo_agent_is_retained(a.id));
  SELECT count(*) INTO v_users_kept FROM public.users u
    WHERE u.is_demo
      AND (public.demo_user_is_retained(u.id)
           OR EXISTS (SELECT 1 FROM public.agents a
                       WHERE a.user_id = u.id AND public.demo_agent_is_retained(a.id)));

  IF p_confirm THEN
    -- 0. The Makefile refuses to wipe while demo mode is on, but that check
    --    runs in its own psql connection moments earlier. Re-assert it here,
    --    inside the transaction that actually deletes, so a flag flipped in
    --    between cannot empty a live demo out from under whoever is using it.
    IF public.is_demo_mode() THEN
      RAISE EXCEPTION USING
        MESSAGE = 'REFUSING TO WIPE: demo mode is currently ON.',
        DETAIL  = 'Deleting the demo dataset while it is being served would empty the public surfaces mid-demo.',
        HINT    = 'Run: make demo-off  (or set app_config.demo_mode_enabled to false), then retry.';
    END IF;

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

    -- 6. Retain a demo user that anything surviving still points at — a
    --    retained agent (agents.user_id is checked against what is left after
    --    step 5), or a real merchant, redemption or fee reversal.
    DELETE FROM public.users u
      WHERE u.is_demo
        AND NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = u.id)
        AND NOT public.demo_user_is_retained(u.id);
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
    UNION ALL SELECT 'users',                 v_users,       p_confirm
    UNION ALL SELECT 'users RETAINED (still referenced)',  v_users_kept, p_confirm;
END;
$$;

COMMENT ON FUNCTION public.wipe_demo_data(BOOLEAN) IS
  'Removes every is_demo row in FK order. DRY RUN by default — pass TRUE to apply. Real rows are never in scope; a demo agent or user still referenced by a surviving row is retained and reported.';

COMMIT;
