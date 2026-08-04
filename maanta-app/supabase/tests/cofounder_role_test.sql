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

-- Scenario B: the RLS bridge resolves cofounder as itself, and no policy grants
-- it anything.
--
-- Policies across the schema are written as current_user_role() = 'admin'.
-- Adding a value to the vocabulary must not change what any of them match. The
-- second half is the one that matters over time: if a future migration ever
-- widened a policy to 'cofounder', the role would silently gain a surface it was
-- created to be excluded from, and nothing else in the repo would notice.
DO $$
DECLARE
  v_cofounder UUID;
  v_auth UUID := gen_random_uuid();
  v_role TEXT;
  v_policies TEXT;
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

  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
    INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') LIKE '%cofounder%'
          OR COALESCE(with_check, '') LIKE '%cofounder%');
  ASSERT v_policies IS NULL,
    format(
      'B: no RLS policy may name cofounder — the role is route-level access only, '
      'but these do: %s', v_policies
    );

  DELETE FROM public.users WHERE id = v_cofounder;
  RAISE NOTICE 'Scenario B passed: cofounder resolves as itself and holds no policy grant';
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
