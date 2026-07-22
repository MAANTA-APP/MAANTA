-- ============================================================
-- Test: capture_lead RPC (migration 20260722190000_capture_lead_atomic.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/capture_lead_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- Scenario A: first capture on a shop name succeeds.
DO $$
DECLARE
  v_uid UUID;
  v_aid UUID;
  v_lead_id UUID;
  v_locked TIMESTAMPTZ;
BEGIN
  INSERT INTO public.users (role) VALUES ('agent') RETURNING id INTO v_uid;
  INSERT INTO public.agents (user_id, is_active) VALUES (v_uid, TRUE) RETURNING id INTO v_aid;

  SELECT lead_id, locked_until
    INTO v_lead_id, v_locked
    FROM public.capture_lead(v_aid, '__test_capture_shop', 'Owner', '+254700000301');

  ASSERT v_lead_id IS NOT NULL, 'A: capture_lead should return a lead id';
  ASSERT v_locked > NOW(), 'A: locked_until should be in the future';

  DELETE FROM public.leads WHERE id = v_lead_id;
  DELETE FROM public.agents WHERE id = v_aid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: capture_lead inserts a locked lead';
END $$;

-- Scenario B: duplicate shop name while lock is live is rejected (shop_locked).
DO $$
DECLARE
  v_uid UUID;
  v_aid UUID;
  v_lead_id UUID;
  v_err TEXT;
BEGIN
  INSERT INTO public.users (role) VALUES ('agent') RETURNING id INTO v_uid;
  INSERT INTO public.agents (user_id, is_active) VALUES (v_uid, TRUE) RETURNING id INTO v_aid;

  SELECT lead_id INTO v_lead_id
    FROM public.capture_lead(v_aid, '__test_capture_dup', NULL, NULL);

  BEGIN
    PERFORM public.capture_lead(v_aid, '  __TEST_capture_DUP  ', NULL, NULL);
    RAISE EXCEPTION 'B: second capture should have been blocked';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    ASSERT v_err LIKE '%shop_locked%', format('B: unexpected error: %', v_err);
  END;

  DELETE FROM public.leads WHERE id = v_lead_id;
  DELETE FROM public.agents WHERE id = v_aid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario B passed: duplicate shop name rejected while locked';
END $$;

-- Scenario C: authenticated cannot execute capture_lead directly.
DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.capture_lead(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ), 'C: authenticated must not execute capture_lead';
  ASSERT has_function_privilege(
    'service_role',
    'public.capture_lead(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ), 'C: service_role must execute capture_lead';
  RAISE NOTICE 'Scenario C passed: capture_lead is service_role-only';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL capture_lead scenarios passed.'; END $$;
