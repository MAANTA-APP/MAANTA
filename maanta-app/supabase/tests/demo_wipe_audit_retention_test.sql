-- ============================================================
-- Test: wipe_demo_data() keeps a REAL subject's audit trail when the actor was
--   synthetic, and still deletes genuinely synthetic trails
--   (migration 20260730150000_demo_wipe_audit_trail_retention.sql)
--
-- Founder decision 2026-07-30, Option C. Covers the three cases asked for:
--   A  demo actor on real merchant / deal / redemption activity is RETAINED
--   B  genuinely synthetic audit rows are still DELETED
--   C  the retained-user count shows up on the wipe report
-- plus D, the foreign-key hazard that makes this more than a predicate tweak.
--
-- Run against a throwaway database that has the migrations applied:
--   psql "$DATABASE_URL" -f supabase/tests/demo_wipe_audit_retention_test.sql
--
-- ------------------------------------------------------------------
-- THROWAWAY-DATABASE GUARD — read this before removing it.
--
-- Every scenario here calls wipe_demo_data(TRUE), which deletes EVERY is_demo
-- row in the database, not just this file's fixtures. Against a database holding
-- a real demo dataset (production does) that would destroy the rehearsal set.
--
-- Same guard as demo_mode_test.sql, same fixture prefix convention: refuse to
-- run if any demo row is not one of ours.
-- ------------------------------------------------------------------
DO $$
DECLARE v_foreign INT;
BEGIN
  SELECT count(*) INTO v_foreign FROM (
    SELECT id FROM public.merchants   WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.deals WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.users WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.redemptions           WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.merchant_transactions WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
  ) s;

  IF v_foreign > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('REFUSING TO RUN: %s demo row(s) in this database are not test fixtures.', v_foreign),
      DETAIL  = 'Every scenario calls wipe_demo_data(TRUE), which would DELETE them all.',
      HINT    = 'Run this suite only against a throwaway stack — make db-verify. Never against production.';
  END IF;

  IF public.is_demo_mode() THEN
    RAISE EXCEPTION USING
      MESSAGE = 'REFUSING TO RUN: demo mode is ON, so wipe_demo_data(TRUE) will refuse anyway.',
      HINT    = 'Set app_config.demo_mode_enabled to false first.';
  END IF;
END $$;

-- ------------------------------------------------------------------
-- Scenario A: a demo shopper at a REAL merchant's counter. The guardian and
-- fraud trails describe something that genuinely happened, so they stay — and
-- the demo user stays with them, because the FKs would otherwise break.
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_real_m  UUID;
  v_demo_u  UUID := '9d9d9d9d-0000-4000-a000-00000000a001';
  v_real_r  UUID := '9d9d9d9d-0000-4000-a000-00000000a002';
  v_g       UUID;
  v_f       UUID;
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_demo)
  VALUES ('ZZ real merchant A', 'test.real.a', '+254700008101', 'BBS Mall', 'active', FALSE)
  RETURNING id INTO v_real_m;

  INSERT INTO public.users (id, phone, role, is_demo)
  VALUES (v_demo_u, '+254700008102', 'customer', TRUE);

  -- A REAL redemption: guardian_events.redemption_id is ON DELETE CASCADE, so a
  -- demo redemption would take the guardian row with it whatever retention says.
  INSERT INTO public.redemptions (id, user_id, merchant_id, is_demo)
  VALUES (v_real_r, v_demo_u, v_real_m, FALSE);

  INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, check_type, severity, recommendation)
  VALUES (v_real_r, v_real_m, v_demo_u, 'geofence', 'info', 'clear')
  RETURNING id INTO v_g;

  INSERT INTO public.fraud_events (merchant_id, user_id, event_type, severity)
  VALUES (v_real_m, v_demo_u, 'velocity', 'low')
  RETURNING id INTO v_f;

  -- Retention must be true BEFORE the wipe too — that is what makes the dry-run
  -- count truthful.
  ASSERT public.demo_user_is_retained(v_demo_u),
    'A: demo user with real-side audit rows is not reported as retained pre-wipe';

  PERFORM public.wipe_demo_data(TRUE);

  ASSERT EXISTS (SELECT 1 FROM public.guardian_events WHERE id = v_g),
    'A: real merchant guardian trail was deleted because the actor was synthetic';
  ASSERT EXISTS (SELECT 1 FROM public.fraud_events WHERE id = v_f),
    'A: real merchant fraud trail was deleted because the actor was synthetic';
  ASSERT EXISTS (SELECT 1 FROM public.users WHERE id = v_demo_u),
    'A: demo user deleted while surviving audit rows still reference it';
  ASSERT EXISTS (SELECT 1 FROM public.redemptions WHERE id = v_real_r),
    'A: real redemption deleted';

  DELETE FROM public.guardian_events WHERE id = v_g;
  DELETE FROM public.fraud_events    WHERE id = v_f;
  DELETE FROM public.redemptions     WHERE id = v_real_r;
  DELETE FROM public.users           WHERE id = v_demo_u;
  DELETE FROM public.merchants       WHERE id = v_real_m;

  RAISE NOTICE 'A ok: real subject + synthetic actor — trails and actor retained';
END $$;

-- ------------------------------------------------------------------
-- Scenario B: genuinely synthetic. Demo merchant, demo deal, demo redemption,
-- demo user — everything goes, and the user is NOT retained.
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_demo_m UUID := '9d9d9d9d-0000-4000-a000-00000000b001';
  v_demo_d UUID := '9d9d9d9d-0000-4000-a000-00000000b002';
  v_demo_u UUID := '9d9d9d9d-0000-4000-a000-00000000b003';
  v_demo_r UUID := '9d9d9d9d-0000-4000-a000-00000000b004';
  v_g      UUID;
  v_f      UUID;
BEGIN
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, node, status, is_demo)
  VALUES (v_demo_m, 'ZZ demo merchant B', 'test.demo.b', '+254700008201', 'BBS Mall', 'active', TRUE);
  INSERT INTO public.deals (id, merchant_id, title, price_kes, is_demo)
  VALUES (v_demo_d, v_demo_m, 'ZZ demo deal B', 100, TRUE);
  INSERT INTO public.users (id, phone, role, is_demo)
  VALUES (v_demo_u, '+254700008202', 'customer', TRUE);
  INSERT INTO public.redemptions (id, user_id, merchant_id, deal_id, is_demo)
  VALUES (v_demo_r, v_demo_u, v_demo_m, v_demo_d, TRUE);

  INSERT INTO public.guardian_events (redemption_id, merchant_id, user_id, deal_id, check_type, severity, recommendation)
  VALUES (v_demo_r, v_demo_m, v_demo_u, v_demo_d, 'geofence', 'info', 'clear')
  RETURNING id INTO v_g;
  INSERT INTO public.fraud_events (merchant_id, user_id, event_type, severity)
  VALUES (v_demo_m, v_demo_u, 'velocity', 'low')
  RETURNING id INTO v_f;

  ASSERT NOT public.demo_user_is_retained(v_demo_u),
    'B: fully synthetic demo user is reported as retained';

  PERFORM public.wipe_demo_data(TRUE);

  ASSERT NOT EXISTS (SELECT 1 FROM public.guardian_events WHERE id = v_g),
    'B: synthetic guardian row survived';
  ASSERT NOT EXISTS (SELECT 1 FROM public.fraud_events WHERE id = v_f),
    'B: synthetic fraud row survived';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_demo_u),
    'B: fully synthetic demo user survived';
  ASSERT NOT EXISTS (SELECT 1 FROM public.merchants WHERE id = v_demo_m),
    'B: demo merchant survived';

  RAISE NOTICE 'B ok: fully synthetic audit rows and actor deleted';
END $$;

-- ------------------------------------------------------------------
-- Scenario C: a demo ADMIN acting on a real merchant vs on a demo merchant.
-- admin_ops_log.admin_user_id is NOT NULL REFERENCES users(id), so the record
-- can only be kept by keeping the user — which is why nulling the actor was
-- ruled out. Also asserts the retained-user count on the report.
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_real_m   UUID;
  v_demo_m   UUID := '9d9d9d9d-0000-4000-a000-00000000c001';
  v_admin_u  UUID := '9d9d9d9d-0000-4000-a000-00000000c002';
  v_ops_real UUID;
  v_ops_demo UUID;
  v_kept     BIGINT;
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_demo)
  VALUES ('ZZ real merchant C', 'test.real.c', '+254700008301', 'BBS Mall', 'active', FALSE)
  RETURNING id INTO v_real_m;
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, node, status, is_demo)
  VALUES (v_demo_m, 'ZZ demo merchant C', 'test.demo.c', '+254700008302', 'BBS Mall', 'active', TRUE);
  INSERT INTO public.users (id, phone, role, is_demo)
  VALUES (v_admin_u, '+254700008303', 'admin', TRUE);

  INSERT INTO public.admin_ops_log (admin_user_id, action, target_type, target_id)
  VALUES (v_admin_u, 'approve', 'merchant', v_real_m) RETURNING id INTO v_ops_real;
  INSERT INTO public.admin_ops_log (admin_user_id, action, target_type, target_id)
  VALUES (v_admin_u, 'approve', 'merchant', v_demo_m) RETURNING id INTO v_ops_demo;

  ASSERT NOT public.demo_admin_ops_target_is_demo('merchant', v_real_m), 'C: real target read as demo';
  ASSERT public.demo_admin_ops_target_is_demo('merchant', v_demo_m),     'C: demo target not detected';

  -- The retained-user count must include this admin, and say so on the report.
  SELECT rows_affected INTO v_kept FROM public.wipe_demo_data()
    WHERE table_name = 'users RETAINED (still referenced)';
  ASSERT v_kept >= 1,
    format('C: retained-user count on the dry-run report was %s, expected at least 1', v_kept);

  PERFORM public.wipe_demo_data(TRUE);

  ASSERT EXISTS (SELECT 1 FROM public.admin_ops_log WHERE id = v_ops_real),
    'C: ops record against a REAL merchant was deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.admin_ops_log WHERE id = v_ops_demo),
    'C: ops record against a demo merchant survived';
  ASSERT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_u),
    'C: demo admin deleted while its surviving ops record still references it';

  SELECT rows_affected INTO v_kept FROM public.wipe_demo_data()
    WHERE table_name = 'users RETAINED (still referenced)';
  ASSERT v_kept >= 1, 'C: retained-user count dropped to 0 after the wipe';

  DELETE FROM public.admin_ops_log WHERE admin_user_id = v_admin_u;
  DELETE FROM public.users     WHERE id = v_admin_u;
  DELETE FROM public.merchants WHERE id = v_real_m;

  RAISE NOTICE 'C ok: real-target ops record kept, demo-target deleted, retained count reported';
END $$;

-- ------------------------------------------------------------------
-- Scenario D: the foreign-key hazard. A surviving fraud_event on a real
-- merchant referencing a demo agent must retain that agent too, or step 5's
-- DELETE FROM agents raises on fraud_events.agent_id (REFERENCES agents(id),
-- no ON DELETE action) and rolls the entire wipe back. This is why
-- demo_agent_is_retained()'s fraud arm had to move to the same subject-based
-- rule as the DELETE.
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_real_m  UUID;
  v_demo_u  UUID := '9d9d9d9d-0000-4000-a000-00000000d001';
  v_agent   UUID;
  v_f       UUID;
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_demo)
  VALUES ('ZZ real merchant D', 'test.real.d', '+254700008401', 'BBS Mall', 'active', FALSE)
  RETURNING id INTO v_real_m;
  INSERT INTO public.users (id, phone, role, is_demo)
  VALUES (v_demo_u, '+254700008402', 'agent', TRUE);
  INSERT INTO public.agents (user_id, agent_name, phone)
  VALUES (v_demo_u, 'ZZ demo agent D', '+254700008403')
  RETURNING id INTO v_agent;

  INSERT INTO public.fraud_events (merchant_id, user_id, agent_id, event_type, severity)
  VALUES (v_real_m, NULL, v_agent, 'agent_pattern', 'medium')
  RETURNING id INTO v_f;

  ASSERT public.demo_agent_is_retained(v_agent),
    'D: agent referenced by a surviving real-merchant fraud row is not retained';

  -- Must not raise a foreign_key_violation.
  PERFORM public.wipe_demo_data(TRUE);

  ASSERT EXISTS (SELECT 1 FROM public.fraud_events WHERE id = v_f),
    'D: real merchant fraud row deleted';
  ASSERT EXISTS (SELECT 1 FROM public.agents WHERE id = v_agent),
    'D: agent deleted while a surviving fraud row still references it';

  DELETE FROM public.fraud_events WHERE id = v_f;
  DELETE FROM public.agents    WHERE id = v_agent;
  DELETE FROM public.users     WHERE id = v_demo_u;
  DELETE FROM public.merchants WHERE id = v_real_m;

  RAISE NOTICE 'D ok: agent retained via a surviving fraud row — wipe did not abort';
END $$;

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.merchants WHERE merchant_name LIKE 'ZZ %'),
    'cleanup: test merchants left behind';
  ASSERT NOT EXISTS (SELECT 1 FROM public.users WHERE id::text LIKE '9d9d9d9d%'),
    'cleanup: test users left behind';
  RAISE NOTICE 'demo_wipe_audit_retention_test: all scenarios passed';
END $$;
