-- ============================================================================
-- Demo mode — the wipe must not delete a REAL merchant's audit trail just
-- because a synthetic account was the actor
--
-- Founder decision 2026-07-30: Option C (retention-aware). No schema changes, no
-- relaxing NOT NULL on admin_ops_log, no nulling of actor references.
--
-- What went wrong
-- ---------------
-- Three deletes in wipe_demo_data() keyed off the ACTOR being synthetic:
--
--   guardian_events   ... OR g.user_id      IN (demo users)
--   fraud_events      ... OR f.user_id      IN (demo users)
--   admin_ops_log     WHERE admin_user_id   IN (demo users)
--
-- A demo shopper claiming at a REAL merchant's counter, or a demo admin account
-- acting on a REAL merchant, therefore had that real merchant's guardian, fraud
-- or ops record deleted. Exactly the rehearsal activity demo mode exists for.
--
-- The comment above those deletes claimed "Real merchants' trails are not in
-- scope: every predicate keys off a demo parent id." Literally true about the
-- keying and false in its conclusion — a demo ACTOR id attaches to events whose
-- SUBJECT is real. Corrected below.
--
-- Why this is not implemented as "make the deletes respect user retention"
-- -----------------------------------------------------------------------
-- That phrasing is circular. "Delete the audit row iff its actor is deleted"
-- and "retain the actor iff an audit row survives" are mutually defined, with no
-- fixed point to compute.
--
-- It would also abort the wipe. demo_agent_is_retained() already judges
-- fraud_events survival with `NOT EXISTS (demo user)`. Make the fraud delete
-- actor-aware and a row whose user is demo-but-retained now survives, while that
-- helper still concludes the agent is disposable — so step 5's
-- `DELETE FROM public.agents` hits fraud_events.agent_id, which is
-- REFERENCES agents(id) with no ON DELETE action, and the whole wipe rolls back.
--
-- The acyclic form, which reaches the same outcome:
--
--   * audit-row survival is decided by its SUBJECT (merchant / deal /
--     redemption / ops target) — never by its actor;
--   * an ACTOR (user or agent) is retained when a surviving audit row still
--     references it.
--
-- No cycle, because subject-based survival does not consult actor retention. The
-- fraud_events arm of demo_agent_is_retained() moves to the same subject-based
-- rule in this migration, so all three definitions of "does this row survive"
-- agree. Keeping them in step is the whole difficulty here: the same predicate
-- appears in the DELETE, in agent retention and now in user retention.
--
-- Two foreign keys shape the result and are worth stating
-- ------------------------------------------------------
--   guardian_events.redemption_id  NOT NULL REFERENCES redemptions(id) ON DELETE
--     CASCADE. A guardian row on a DEMO redemption is destroyed by the cascade
--     whatever retention says, so retention is only meaningful for rows on real
--     redemptions. The delete now names that arm explicitly rather than leaving
--     it to the cascade, so the dry-run count matches what actually disappears.
--
--   fraud_events.agent_id  REFERENCES agents(id), no ON DELETE action — the
--     hazard described above.
--
-- Rollback: re-apply 20260729190000_demo_wipe_user_references.sql, then
-- 20260729170000_demo_wipe_agent_references.sql (in that order, so the older
-- definition of demo_agent_is_retained wins).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- admin_ops_log.target is polymorphic (target_type + target_id, both NOT NULL,
-- no FK). Resolving it needs a per-type lookup, and neither fraud_events nor
-- agent_tasks carries is_demo, so those two resolve through their merchant.
--
-- Returns TRUE only when the target is PROVABLY synthetic. An unresolvable
-- target (the row it named is already gone) is deliberately NOT provably demo:
-- for an audit log, an action against a since-deleted subject is still a real
-- record, and over-retaining is the safe direction. This is why the wipe deletes
-- admin_ops_log in step 1, while demo merchants and deals still exist to resolve
-- against.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demo_admin_ops_target_is_demo(
  p_target_type TEXT,
  p_target_id   UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE p_target_type
    WHEN 'merchant'   THEN EXISTS (SELECT 1 FROM public.merchants  WHERE id = p_target_id AND is_demo)
    WHEN 'deal'       THEN EXISTS (SELECT 1 FROM public.deals      WHERE id = p_target_id AND is_demo)
    WHEN 'redemption' THEN EXISTS (SELECT 1 FROM public.redemptions WHERE id = p_target_id AND is_demo)
    WHEN 'fraud_event' THEN EXISTS (
      SELECT 1 FROM public.fraud_events f
       WHERE f.id = p_target_id
         AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = f.merchant_id AND m.is_demo))
    WHEN 'agent_task' THEN EXISTS (
      SELECT 1 FROM public.agent_tasks t
       WHERE t.id = p_target_id
         AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = t.merchant_id AND m.is_demo))
    ELSE FALSE
  END;
$fn$;

COMMENT ON FUNCTION public.demo_admin_ops_target_is_demo(TEXT, UUID) IS
  'TRUE only when an admin_ops_log target resolves to a synthetic row. An unresolvable target is not provably demo, so the ops record is kept — over-retaining is the safe direction for an audit log.';

REVOKE EXECUTE ON FUNCTION public.demo_admin_ops_target_is_demo(TEXT, UUID) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Agent retention: the fraud_events arm becomes subject-based, matching the new
-- delete. Previously it required `NOT EXISTS (demo user)`, which after this
-- change would under-retain agents referenced by rows that now survive because
-- their merchant is real — and under-retaining an agent aborts the wipe on
-- fraud_events.agent_id. Every other arm is unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demo_agent_is_retained(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
     EXISTS (SELECT 1 FROM public.leads l WHERE l.agent_id = p_agent_id)
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
     -- Subject-based, mirroring the fraud_events DELETE: the row survives when
     -- its merchant is provably real, whoever the actor was.
  OR EXISTS (
       SELECT 1 FROM public.fraud_events f
        WHERE f.agent_id = p_agent_id
          AND EXISTS (SELECT 1 FROM public.merchants m
                       WHERE m.id = f.merchant_id AND NOT m.is_demo))
  OR EXISTS (
       SELECT 1 FROM public.merchants m
        WHERE NOT m.is_demo
          AND (m.onboarded_by = p_agent_id
               OR m.assisted_by_agent_id = p_agent_id));
$fn$;

COMMENT ON FUNCTION public.demo_agent_is_retained(UUID) IS
  'TRUE when a row that survives wipe_demo_data() still references this agent, so deleting it would raise a foreign-key violation. Scoped to survivors, so it answers identically before and after the wipe. The fraud_events arm is subject-based (real merchant), matching the DELETE.';

REVOKE EXECUTE ON FUNCTION public.demo_agent_is_retained(UUID) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- User retention gains the three audit tables. Each arm is scoped to rows that
-- SURVIVE, so the predicate answers identically before and after the deletes —
-- the invariant that makes the dry-run count truthful.
-- ----------------------------------------------------------------------------
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
                           WHERE m.id = f.merchant_id AND m.is_demo))
     -- Guardian trail for a real counter event. Survival needs all three: a real
     -- redemption (else the ON DELETE CASCADE takes the row), and neither a demo
     -- merchant nor a demo deal (either of which the DELETE still catches).
  OR EXISTS (
       SELECT 1 FROM public.guardian_events g
        WHERE g.user_id = p_user_id
          AND EXISTS (SELECT 1 FROM public.redemptions r
                       WHERE r.id = g.redemption_id AND NOT r.is_demo)
          AND NOT EXISTS (SELECT 1 FROM public.merchants m
                           WHERE m.id = g.merchant_id AND m.is_demo)
          AND NOT EXISTS (SELECT 1 FROM public.deals d
                           WHERE d.id = g.deal_id AND d.is_demo))
     -- Fraud trail against a real merchant.
  OR EXISTS (
       SELECT 1 FROM public.fraud_events f
        WHERE f.user_id = p_user_id
          AND EXISTS (SELECT 1 FROM public.merchants m
                       WHERE m.id = f.merchant_id AND NOT m.is_demo))
     -- Admin action whose target is not provably synthetic.
  OR EXISTS (
       SELECT 1 FROM public.admin_ops_log l
        WHERE l.admin_user_id = p_user_id
          AND NOT public.demo_admin_ops_target_is_demo(l.target_type, l.target_id));
$fn$;

COMMENT ON FUNCTION public.demo_user_is_retained(UUID) IS
  'TRUE when a row that survives wipe_demo_data() still references this user, so deleting it would raise a foreign-key violation. Covers real merchants, real redemptions, fee reversals on real merchants, and audit trails (guardian_events, fraud_events, admin_ops_log) whose SUBJECT is real even though this user was the actor. Scoped to survivors, so it answers identically before and after the wipe. Does not cover agents.user_id — the wipe handles that separately, after agents are removed.';

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
  -- Each audit count uses the same predicate as its DELETE below.
  SELECT count(*) INTO v_guardian FROM public.guardian_events g
    WHERE g.merchant_id   IN (SELECT id FROM public.merchants   WHERE is_demo)
       OR g.deal_id       IN (SELECT id FROM public.deals       WHERE is_demo)
       OR g.redemption_id IN (SELECT id FROM public.redemptions WHERE is_demo);
  SELECT count(*) INTO v_fraud FROM public.fraud_events f
    WHERE f.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
       OR (
            NOT EXISTS (SELECT 1 FROM public.merchants m
                         WHERE m.id = f.merchant_id AND NOT m.is_demo)
            AND (
              f.user_id IN (SELECT id FROM public.users WHERE is_demo)
              OR f.agent_id IN (SELECT a.id FROM public.agents a
                                 WHERE a.user_id IN (SELECT id FROM public.users WHERE is_demo))
            )
          );
  SELECT count(*) INTO v_boost FROM public.boost_flags
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_audit FROM public.audit_logs
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_feerev FROM public.fee_reversals
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_adminops FROM public.admin_ops_log l
    WHERE l.admin_user_id IN (SELECT id FROM public.users WHERE is_demo)
      AND public.demo_admin_ops_target_is_demo(l.target_type, l.target_id);
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

    -- 1. Blocking dependents. Audit and fraud trails are scoped by their
    --    SUBJECT, not their actor: a synthetic account acting against a REAL
    --    merchant, deal or redemption produced a record of something that
    --    genuinely happened, and that record stays. The actor row is then
    --    retained rather than deleted — see demo_user_is_retained() and
    --    demo_agent_is_retained().
    --
    --    (The old predicates keyed off the actor as well, which deleted real
    --    merchants' trails. Keying off "a demo parent id" is not by itself
    --    enough to keep real subjects out of scope — a demo actor id attaches
    --    to events whose subject is real.)
    DELETE FROM public.guardian_events g
      WHERE g.merchant_id   IN (SELECT id FROM public.merchants   WHERE is_demo)
         OR g.deal_id       IN (SELECT id FROM public.deals       WHERE is_demo)
         -- Named explicitly though redemption_id is ON DELETE CASCADE, so the
         -- dry-run count above matches what actually disappears.
         OR g.redemption_id IN (SELECT id FROM public.redemptions WHERE is_demo);
    -- Kept when the merchant is provably real. Deleted when the merchant is
    -- demo, or when a demo actor's event has no real merchant to anchor it —
    -- an unanchored synthetic event is not a record worth keeping, and leaving
    -- it would retain its actor forever.
    DELETE FROM public.fraud_events f
      WHERE f.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
         OR (
              NOT EXISTS (SELECT 1 FROM public.merchants m
                           WHERE m.id = f.merchant_id AND NOT m.is_demo)
              AND (
                f.user_id IN (SELECT id FROM public.users WHERE is_demo)
                OR f.agent_id IN (SELECT a.id FROM public.agents a
                                   WHERE a.user_id IN (SELECT id FROM public.users WHERE is_demo))
              )
            );
    DELETE FROM public.boost_flags
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.audit_logs
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.fee_reversals
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    -- Runs while demo merchants and deals still exist, so the polymorphic
    -- target can be resolved. A target that cannot be resolved is not provably
    -- synthetic and the ops record is kept.
    DELETE FROM public.admin_ops_log l
      WHERE l.admin_user_id IN (SELECT id FROM public.users WHERE is_demo)
        AND public.demo_admin_ops_target_is_demo(l.target_type, l.target_id);

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
    --    step 5), a real merchant, redemption or fee reversal, or a surviving
    --    audit trail whose subject was real.
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
  'Removes every is_demo row in FK order. DRY RUN by default — pass TRUE to apply. Real rows are never in scope. Audit trails (guardian_events, fraud_events, admin_ops_log) are scoped by SUBJECT, not actor, so a real merchant''s record survives a synthetic actor; the actor is then retained and reported on the RETAINED lines.';

COMMIT;
