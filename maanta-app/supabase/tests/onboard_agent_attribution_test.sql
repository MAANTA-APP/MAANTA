-- ============================================================
-- Test: agent-assisted onboarding attribution (walkthrough G1; frozen
-- DECISIONS_LOG 2026-07-02, merchant-authored redesign 20260702085628).
--
-- The merchant is ALWAYS the authenticated submitter. The agent is captured as
-- attribution only. Covers, via the real authenticated-caller path
-- (request.jwt.claims sub = merchant's auth_uid, so current_user_id() = the
-- merchant, exactly like the app's onboard route):
--   1. Yes + agent  → onboarding_mode = 'agent_assisted', assisted_by_agent_id
--      = the picked agent, onboarded_by_user_id = the merchant (submitter);
--      and agent-leaderboard credit links back to the resulting merchant
--      (merchants WHERE assisted_by_agent_id = agent finds it).
--   2. No agent     → onboarding_mode = 'self_serve', assisted_by_agent_id NULL.
--   3. Bad agent id → an inactive / unknown agent id is rejected with
--      invalid_attribution; no merchant row is created.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/onboard_agent_attribution_test.sql
-- ============================================================

-- Scenario 1: Yes + agent → agent_assisted + leaderboard credit links to merchant.
DO $$
DECLARE
  v_agent_user  UUID;
  v_agent_id    UUID;
  v_merch_user  UUID;
  v_merch_auth  UUID := gen_random_uuid();
  v_mid         UUID;
  v_mode        TEXT;
  v_assisted    UUID;
  v_submitter   UUID;
  v_credit_mid  UUID;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- An active field agent, and the merchant candidate (a plain customer with an
  -- auth identity, not yet a merchant).
  INSERT INTO public.users (role, full_name) VALUES ('agent', '__test agent G1')
    RETURNING id INTO v_agent_user;
  INSERT INTO public.agents (user_id, is_active) VALUES (v_agent_user, TRUE)
    RETURNING id INTO v_agent_id;
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_merch_auth)
    RETURNING id INTO v_merch_user;

  -- Authenticate AS the merchant (their own submission), then onboard while
  -- attributing the agent — the production route's exact call shape.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_merch_auth, 'role', 'authenticated')::text, true);

  v_mid := public.onboard_merchant(
    p_user_id            => v_merch_user,
    p_merchant_name      => '__test_g1_shop',
    p_phone              => '+254700000401',
    p_email              => NULL,
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => 'test.g1.shop',
    p_floor              => NULL,
    p_unit_number        => NULL,
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => v_agent_id
  );

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT onboarding_mode, assisted_by_agent_id, onboarded_by_user_id
    INTO v_mode, v_assisted, v_submitter
    FROM public.merchants WHERE id = v_mid;

  ASSERT v_mode = 'agent_assisted',
    format('1: onboarding_mode = %s (expected agent_assisted)', v_mode);
  ASSERT v_assisted = v_agent_id,
    format('1: assisted_by_agent_id = %s (expected %s)', v_assisted, v_agent_id);
  -- Trust boundary: the merchant (not the agent) is recorded as the submitter.
  ASSERT v_submitter = v_merch_user,
    format('1: onboarded_by_user_id = %s (expected merchant %s)', v_submitter, v_merch_user);

  -- Agent-leaderboard credit: the agent's assisted merchants are reachable from
  -- the agent id, and resolve back to this exact merchant.
  SELECT id INTO v_credit_mid
    FROM public.merchants WHERE assisted_by_agent_id = v_agent_id;
  ASSERT v_credit_mid = v_mid,
    format('1: leaderboard credit did not link agent %s to merchant %s', v_agent_id, v_mid);

  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.agents WHERE id = v_agent_id;
  DELETE FROM public.users WHERE id IN (v_agent_user, v_merch_user);
  RAISE NOTICE 'Scenario 1 passed: Yes+agent → agent_assisted, credit links to merchant';
END $$;

-- Scenario 2: No agent → self_serve, no attribution.
DO $$
DECLARE
  v_merch_user  UUID;
  v_merch_auth  UUID := gen_random_uuid();
  v_mid         UUID;
  v_mode        TEXT;
  v_assisted    UUID;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_merch_auth)
    RETURNING id INTO v_merch_user;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_merch_auth, 'role', 'authenticated')::text, true);

  v_mid := public.onboard_merchant(
    p_user_id            => v_merch_user,
    p_merchant_name      => '__test_g1_selfserve',
    p_phone              => '+254700000402',
    p_email              => NULL,
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => 'test.g1.self',
    p_floor              => NULL,
    p_unit_number        => NULL,
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => NULL
  );

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT onboarding_mode, assisted_by_agent_id INTO v_mode, v_assisted
    FROM public.merchants WHERE id = v_mid;
  ASSERT v_mode = 'self_serve', format('2: onboarding_mode = %s (expected self_serve)', v_mode);
  ASSERT v_assisted IS NULL, format('2: assisted_by_agent_id = %s (expected NULL)', v_assisted);

  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_merch_user;
  RAISE NOTICE 'Scenario 2 passed: No agent → self_serve';
END $$;

-- Scenario 3: an inactive / unknown agent id is rejected (invalid_attribution),
-- and no merchant row is created.
DO $$
DECLARE
  v_agent_user  UUID;
  v_agent_id    UUID;
  v_merch_user  UUID;
  v_merch_auth  UUID := gen_random_uuid();
  v_raised      BOOLEAN := false;
  v_count       INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- An INACTIVE agent — must not be creditable.
  INSERT INTO public.users (role) VALUES ('agent') RETURNING id INTO v_agent_user;
  INSERT INTO public.agents (user_id, is_active) VALUES (v_agent_user, FALSE)
    RETURNING id INTO v_agent_id;
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_merch_auth)
    RETURNING id INTO v_merch_user;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_merch_auth, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.onboard_merchant(
      p_user_id            => v_merch_user,
      p_merchant_name      => '__test_g1_badagent',
      p_phone              => '+254700000403',
      p_email              => NULL,
      p_whatsapp           => NULL,
      p_node               => 'BBS Mall',
      p_w3w_address        => 'test.g1.bad',
      p_floor              => NULL,
      p_unit_number        => NULL,
      p_entrance_notes     => NULL,
      p_onboarding_agent_id => v_agent_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%invalid_attribution%', format('3: wrong error: %s', SQLERRM);
  END;
  ASSERT v_raised, '3: an inactive agent id was accepted for attribution';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_count FROM public.merchants WHERE user_id = v_merch_user;
  ASSERT v_count = 0, format('3: a merchant row was created despite bad attribution (got %s)', v_count);

  DELETE FROM public.agents WHERE id = v_agent_id;
  DELETE FROM public.users WHERE id IN (v_agent_user, v_merch_user);
  RAISE NOTICE 'Scenario 3 passed: inactive/unknown agent → invalid_attribution, no merchant';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL onboarding-attribution scenarios passed.'; END $$;
