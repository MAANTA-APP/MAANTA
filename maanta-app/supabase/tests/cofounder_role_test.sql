-- ============================================================
-- Test: cofounder role (20260804010000_cofounder_role.sql)
--
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cofounder_role_test.sql
--
-- The migration only widens a CHECK constraint, which is easy to wave through.
-- What actually needs asserting is what it does NOT do: adding a value to the
-- role vocabulary must not hand that value any of admin's authority. The route
-- guards in src/lib/roles.ts are an app-layer concern; these are the database
-- facts they rest on.
-- ============================================================

-- Scenario A: the constraint accepts 'cofounder' and still rejects anything else.
DO $$
DECLARE
  v_id UUID;
  v_rejected BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('cofounder', gen_random_uuid()) RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'A: users_role_check must accept cofounder';

  BEGIN
    INSERT INTO public.users (role, auth_uid)
      VALUES ('superadmin', gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  ASSERT v_rejected,
    'A: users_role_check must still reject roles outside the vocabulary — a '
    'constraint that accepts anything is not a constraint';

  DELETE FROM public.users WHERE id = v_id;
  RAISE NOTICE 'Scenario A passed: cofounder accepted, unknown roles rejected';
END $$;

-- Scenario B: the RLS bridge resolves cofounder as itself, and the policy
-- layer matches the documented read scope EXACTLY — inverted 2026-08-07 by
-- 20260807161000_cofounder_read_policies.sql (drift D74).
--
-- Until then this scenario asserted that NO policy named cofounder, guarding
-- the role's route-level-only posture. D74 landed the DB layer, so the
-- assertion flips to the stronger form: the set of policies naming cofounder
-- must be exactly the enumerated read surface, and every one of them must be
-- SELECT-only. Both directions matter — a missing policy dead-ends a
-- documented read; an extra or non-SELECT one silently widens a role that was
-- created to be narrower than admin (the leads_agent FOR ALL trap from the
-- #175 review).
DO $$
DECLARE
  v_cofounder UUID;
  v_auth UUID := gen_random_uuid();
  v_role TEXT;
  v_actual TEXT;
  v_expected TEXT :=
    'agent_tasks.agent_tasks_cofounder_read, agents.agents_cofounder_read, '
    'deals.deals_cofounder_read, leads.leads_cofounder_read, '
    'merchant_transactions.transactions_cofounder_read, '
    'merchants.merchants_cofounder_read, redemptions.redemptions_cofounder_read, '
    'users.users_cofounder_read';
  v_non_select TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('cofounder', v_auth) RETURNING id INTO v_cofounder;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text,
    TRUE
  );
  v_role := public.current_user_role();
  ASSERT v_role = 'cofounder',
    format('B: current_user_role() must resolve to cofounder, got %L', v_role);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);

  SELECT string_agg(format('%s.%s', tablename, policyname), ', ' ORDER BY tablename, policyname)
    INTO v_actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') LIKE '%cofounder%'
          OR COALESCE(with_check, '') LIKE '%cofounder%');
  ASSERT v_actual = v_expected,
    format(
      'B: policies naming cofounder must be exactly the documented read surface '
      '(D74). Expected: %s — got: %s', v_expected, COALESCE(v_actual, '(none)')
    );

  SELECT string_agg(format('%s.%s [%s]', tablename, policyname, cmd), ', ')
    INTO v_non_select
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') LIKE '%cofounder%'
          OR COALESCE(with_check, '') LIKE '%cofounder%')
     AND cmd IS DISTINCT FROM 'SELECT';
  ASSERT v_non_select IS NULL,
    format(
      'B: every policy naming cofounder must be SELECT-only — a write-capable '
      'policy widens the role beyond its documented scope: %s', v_non_select
    );

  DELETE FROM public.users WHERE id = v_cofounder;
  RAISE NOTICE 'Scenario B passed: cofounder resolves as itself; policy set matches the documented read scope, SELECT-only';
END $$;

-- Scenario B2: the scope holds behaviorally, both directions. As a cofounder
-- session under the `authenticated` DB role (so RLS actually applies): a lead
-- row is readable, a lead write is refused, and fraud_events — an admin
-- surface the role is excluded from — yields nothing.
DO $$
DECLARE
  v_cofounder UUID;
  v_auth UUID := gen_random_uuid();
  v_agent_user UUID;
  v_agent UUID;
  v_lead UUID;
  v_visible INT;
  v_updated INT;
  v_write_refused BOOLEAN := FALSE;
  v_fraud_visible INT := 0;
BEGIN
  -- Seed (as owner): an agent with one lead, and the cofounder user.
  INSERT INTO public.users (role, auth_uid)
    VALUES ('agent', gen_random_uuid()) RETURNING id INTO v_agent_user;
  INSERT INTO public.agents (user_id, is_active)
    VALUES (v_agent_user, TRUE) RETURNING id INTO v_agent;
  INSERT INTO public.leads (agent_id, shop_name)
    VALUES (v_agent, '__test_cofounder_rls_lead') RETURNING id INTO v_lead;
  INSERT INTO public.users (role, auth_uid)
    VALUES ('cofounder', v_auth) RETURNING id INTO v_cofounder;

  -- Become the cofounder for RLS purposes.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text,
    TRUE
  );
  SET LOCAL ROLE authenticated;

  -- Positive: the pipeline is readable.
  SELECT COUNT(*) INTO v_visible FROM public.leads WHERE id = v_lead;
  ASSERT v_visible = 1,
    'B2: cofounder must be able to read a lead (leads_cofounder_read missing or not matching)';

  -- Negative: the pipeline is not writable. Depending on grants this surfaces
  -- as a privilege error (write revoked for authenticated) or as 0 rows
  -- matched (no write policy); both mean the write did not happen.
  BEGIN
    UPDATE public.leads SET status = 'lost' WHERE id = v_lead;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    ASSERT v_updated = 0,
      'B2: a cofounder lead UPDATE must match no rows — a row was written';
  EXCEPTION WHEN insufficient_privilege THEN
    v_write_refused := TRUE;
  END;

  -- Negative: an admin-only surface stays dark. No grant or no policy both
  -- read as "nothing visible".
  BEGIN
    SELECT COUNT(*) INTO v_fraud_visible FROM public.fraud_events;
  EXCEPTION WHEN insufficient_privilege THEN
    v_fraud_visible := 0;
  END;
  ASSERT COALESCE(v_fraud_visible, 0) = 0,
    'B2: cofounder must not see fraud_events rows — admin surface leaked';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);

  -- The lead must be untouched regardless of which refusal path fired.
  ASSERT (SELECT status FROM public.leads WHERE id = v_lead) = 'locked',
    'B2: lead status changed — the read-only scope did not hold';

  DELETE FROM public.leads WHERE id = v_lead;
  DELETE FROM public.agents WHERE id = v_agent;
  DELETE FROM public.users WHERE id IN (v_cofounder, v_agent_user);
  RAISE NOTICE 'Scenario B2 passed: cofounder reads the pipeline, cannot write it, cannot see fraud_events (write refused via %)',
    CASE WHEN v_write_refused THEN 'privilege revoke' ELSE 'row policy' END;
END $$;

-- Scenario C: a cofounder cannot promote itself to admin.
--
-- prevent_self_role_escalation allows a role change only from service_role or an
-- admin. Cofounder is neither. This is the one path that would turn a deliberately
-- narrow role into a full one, so it gets its own assertion.
DO $$
DECLARE
  v_cofounder UUID;
  v_auth UUID := gen_random_uuid();
  v_blocked BOOLEAN := FALSE;
  v_role_after TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('cofounder', v_auth) RETURNING id INTO v_cofounder;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text,
    TRUE
  );

  BEGIN
    UPDATE public.users SET role = 'admin' WHERE id = v_cofounder;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := TRUE;
  END;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);
  SELECT role INTO v_role_after FROM public.users WHERE id = v_cofounder;

  ASSERT v_blocked, 'C: self-promotion to admin must raise, not silently succeed';
  ASSERT v_role_after = 'cofounder',
    format('C: role must still be cofounder after the blocked update, got %L', v_role_after);

  DELETE FROM public.users WHERE id = v_cofounder;
  RAISE NOTICE 'Scenario C passed: cofounder cannot escalate itself to admin';
END $$;
