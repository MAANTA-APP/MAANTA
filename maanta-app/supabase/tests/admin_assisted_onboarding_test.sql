-- ============================================================
-- Test: admin-assisted onboarding attribution
--   (migration 20260816020000_admin_assisted_onboarding_attribution.sql)
--
-- Self-contained and self-cleaning. Run against a database with the migration
-- applied:
--   psql "$DATABASE_URL" -f supabase/tests/admin_assisted_onboarding_test.sql
--
-- What matters here is not that a merchant row appears — it is that
-- `onboarding_mode` and `onboarded_by_user_id` say something TRUE. Those two
-- columns are read by dispute and fraud review, so a wrong value is worse than
-- a failed call.
--
-- Every scenario runs under the service_role context a Next.js route handler
-- has (Clerk gives no user-scoped Postgres identity), because that is the path
-- the new parameter exists for. Session-level on purpose: `psql -f` autocommits
-- each statement, so a transaction-local setting would be gone before the DO
-- blocks run.
-- ============================================================

-- Only the JWT claim, never `SET ROLE`. `auth.role()` reads this claim, so the
-- function takes its service_role branch while the session keeps the owner
-- privileges the fixtures below need. Actually switching to the `service_role`
-- database role loses INSERT on public.users — which is how the first run of
-- this file failed, with "permission denied for table users".
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- Fixtures: one admin, one agent-owner, one active agent, and prospective
-- merchant users. Recognisable ids so cleanup is exact.
DO $$
BEGIN
  INSERT INTO public.users (id, phone, full_name, role)
  VALUES
    ('d0000000-0000-4000-a000-0000000000a1', '+254700000901', 'Test Admin', 'admin'),
    ('d0000000-0000-4000-a000-0000000000a2', '+254700000902', 'Test Agent User', 'agent'),
    ('d0000000-0000-4000-a000-0000000000b1', '+254700000911', 'Prospect One', 'customer'),
    ('d0000000-0000-4000-a000-0000000000b2', '+254700000912', 'Prospect Two', 'customer'),
    ('d0000000-0000-4000-a000-0000000000b3', '+254700000913', 'Prospect Three', 'customer'),
    ('d0000000-0000-4000-a000-0000000000b4', '+254700000914', 'Prospect Four', 'customer'),
    ('d0000000-0000-4000-a000-0000000000b5', '+254700000915', 'Prospect Five', 'customer')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.agents (id, user_id, is_active)
  VALUES ('d0000000-0000-4000-a000-0000000000c1', 'd0000000-0000-4000-a000-0000000000a2', TRUE)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- 1. A named admin is recorded as the actor, not the merchant.
DO $$
DECLARE
  v_merchant UUID;
  v_mode TEXT;
  v_by UUID;
  v_agent UUID;
BEGIN
  v_merchant := public.onboard_merchant(
    'd0000000-0000-4000-a000-0000000000b1',
    'ZZTEST Admin Onboarded Shop', '+254700000911', '', '',
    'BBS Mall', 'stored.riches.shine', '1', 'A1', '',
    NULL,
    'd0000000-0000-4000-a000-0000000000a1'
  );

  SELECT onboarding_mode, onboarded_by_user_id, assisted_by_agent_id
    INTO v_mode, v_by, v_agent
    FROM public.merchants WHERE id = v_merchant;

  ASSERT v_mode = 'admin_assisted',
    format('expected admin_assisted, got %s', v_mode);
  -- The whole point: the actor is the admin, NOT the merchant being onboarded.
  ASSERT v_by = 'd0000000-0000-4000-a000-0000000000a1',
    format('expected the admin as actor, got %s', v_by);
  ASSERT v_agent IS NULL, 'admin-assisted onboarding must carry no agent attribution';

  DELETE FROM public.merchants WHERE id = v_merchant;
  UPDATE public.users SET role = 'customer' WHERE id = 'd0000000-0000-4000-a000-0000000000b1';
END $$;

-- 2. Without the parameter, nothing changes: still self_serve, actor is the merchant.
DO $$
DECLARE
  v_merchant UUID;
  v_mode TEXT;
  v_by UUID;
BEGIN
  v_merchant := public.onboard_merchant(
    'd0000000-0000-4000-a000-0000000000b2',
    'ZZTEST Self Serve Shop', '+254700000912', '', '',
    'BBS Mall', 'stored.riches.shine', '1', 'A2', ''
  );

  SELECT onboarding_mode, onboarded_by_user_id INTO v_mode, v_by
    FROM public.merchants WHERE id = v_merchant;

  ASSERT v_mode = 'self_serve', format('expected self_serve, got %s', v_mode);
  ASSERT v_by = 'd0000000-0000-4000-a000-0000000000b2',
    'self-serve actor must remain the merchant';

  DELETE FROM public.merchants WHERE id = v_merchant;
  UPDATE public.users SET role = 'customer' WHERE id = 'd0000000-0000-4000-a000-0000000000b2';
END $$;

-- 3. Agent attribution is untouched by the new parameter's existence.
DO $$
DECLARE
  v_merchant UUID;
  v_mode TEXT;
  v_agent UUID;
BEGIN
  v_merchant := public.onboard_merchant(
    'd0000000-0000-4000-a000-0000000000b3',
    'ZZTEST Agent Assisted Shop', '+254700000913', '', '',
    'BBS Mall', 'stored.riches.shine', '1', 'A3', '',
    'd0000000-0000-4000-a000-0000000000c1'
  );

  SELECT onboarding_mode, assisted_by_agent_id INTO v_mode, v_agent
    FROM public.merchants WHERE id = v_merchant;

  ASSERT v_mode = 'agent_assisted', format('expected agent_assisted, got %s', v_mode);
  ASSERT v_agent = 'd0000000-0000-4000-a000-0000000000c1', 'agent attribution lost';

  DELETE FROM public.merchants WHERE id = v_merchant;
  UPDATE public.users SET role = 'customer' WHERE id = 'd0000000-0000-4000-a000-0000000000b3';
END $$;

-- 4. A non-admin cannot be stamped as the acting admin.
DO $$
DECLARE
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.onboard_merchant(
      'd0000000-0000-4000-a000-0000000000b4',
      'ZZTEST Should Not Exist', '+254700000914', '', '',
      'BBS Mall', 'stored.riches.shine', '1', 'A4', '',
      NULL,
      -- The agent's user row: a real user, not an admin.
      'd0000000-0000-4000-a000-0000000000a2'
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%invalid_attribution%',
      format('expected invalid_attribution, got: %s', SQLERRM);
  END;

  ASSERT v_raised, 'a non-admin p_admin_user_id must raise, not silently stamp';
  -- And nothing was written on the way to raising.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE user_id = 'd0000000-0000-4000-a000-0000000000b4'
  ), 'failed call must leave no merchant row';
  ASSERT (SELECT role FROM public.users WHERE id = 'd0000000-0000-4000-a000-0000000000b4')
         = 'customer', 'failed call must not promote the user';
END $$;

-- 5. Admin and agent attribution together is a caller bug, and fails loudly.
DO $$
DECLARE
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.onboard_merchant(
      'd0000000-0000-4000-a000-0000000000b5',
      'ZZTEST Both Attributions', '+254700000915', '', '',
      'BBS Mall', 'stored.riches.shine', '1', 'A5', '',
      'd0000000-0000-4000-a000-0000000000c1',
      'd0000000-0000-4000-a000-0000000000a1'
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%not both%',
      format('expected the not-both message, got: %s', SQLERRM);
  END;

  ASSERT v_raised, 'both attributions supplied must raise rather than pick one';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE user_id = 'd0000000-0000-4000-a000-0000000000b5'
  ), 'failed call must leave no merchant row';
END $$;

-- Cleanup.
DO $$
BEGIN
  DELETE FROM public.merchants WHERE merchant_name LIKE 'ZZTEST %';
  DELETE FROM public.agents WHERE id = 'd0000000-0000-4000-a000-0000000000c1';
  DELETE FROM public.users WHERE id IN (
    'd0000000-0000-4000-a000-0000000000a1',
    'd0000000-0000-4000-a000-0000000000a2',
    'd0000000-0000-4000-a000-0000000000b1',
    'd0000000-0000-4000-a000-0000000000b2',
    'd0000000-0000-4000-a000-0000000000b3',
    'd0000000-0000-4000-a000-0000000000b4',
    'd0000000-0000-4000-a000-0000000000b5'
  );
END $$;

SELECT 'admin_assisted_onboarding_test: OK' AS result;
