-- ============================================================
-- Test: demo mode — tagging, isolation, reseed, wipe
--   (migrations 20260729140000 / 141000 / 142000 / 150000 / 160000 / 170000 / 180000 / 190000 / 20260730010000)
--
-- Self-contained and self-cleaning. Run against a database that has the
-- migrations applied, e.g.:
--   psql "$DATABASE_URL" -f supabase/tests/demo_mode_test.sql
--
-- Each scenario runs inside a DO block. ASSERT raises (aborting the whole
-- run) on failure; on success the block deletes the rows it made.
--
-- The property under test throughout is one-directional: REAL rows must be
-- unaffected by every demo-mode code path, in both demo and launch mode. A
-- test that only proves demo rows behave correctly would miss the failure
-- that actually matters.
--
-- Test fixtures use the 9d9d9d9d prefix (not a shipped seed namespace) so a
-- failed run is trivially identifiable and cannot collide with real data or
-- with the b/c/d/e/f seed batches.
-- ============================================================

-- ------------------------------------------------------------------
-- THROWAWAY-DATABASE GUARD — read this before removing it.
--
-- Scenarios F and G call wipe_demo_data(TRUE), which deletes EVERY is_demo
-- row in the database, not just this file's fixtures. Against a database
-- holding a real demo dataset (production does, as of 2026-07-29: 213
-- merchants, 291 deals, 221 users) that would destroy the whole rehearsal
-- set mid-demo.
--
-- So: refuse to run if any demo row is not one of ours. On a throwaway stack
-- from `make db-verify` there are none, and the suite proceeds normally.
-- ------------------------------------------------------------------
DO $$
DECLARE v_foreign INT; v_trial_eligible INT;
BEGIN
  SELECT count(*) INTO v_foreign FROM (
    SELECT id FROM public.merchants   WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.deals WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.users WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    -- Every table the wipe deletes on `WHERE is_demo` alone belongs here. A
    -- database holding demo redemption history but no demo merchants would
    -- otherwise pass the guard and lose it.
    UNION ALL SELECT id FROM public.redemptions           WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
    UNION ALL SELECT id FROM public.merchant_transactions WHERE is_demo AND id::text NOT LIKE '9d9d9d9d%'
  ) s;

  IF v_foreign > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('REFUSING TO RUN: %s demo row(s) in this database are not test fixtures.', v_foreign),
      DETAIL  = 'Scenarios F and G call wipe_demo_data(TRUE), which would DELETE them all.',
      HINT    = 'Run this suite only against a throwaway stack — make db-verify. Never against production.';
  END IF;

  -- Second blast radius, and it is NOT demo-scoped. Scenario D calls
  -- handle_trial_expiry() with no argument — it processes every eligible
  -- merchant in the database — while cleanup only removes D's two fixture ids.
  -- On a database holding real merchants with expired Elite trials, the suite
  -- starts grace periods, writes agent_tasks and tier_flags, and downgrades
  -- tiers, then leaves all of it behind. A database with zero demo rows passes
  -- the check above and is still mutated, so this needs its own guard.
  --
  -- Predicates mirror handle_trial_expiry() (20260729141000, phases 1 and 2).
  SELECT count(*) INTO v_trial_eligible
    FROM public.merchants
   WHERE NOT is_demo
     AND id::text NOT LIKE '9d9d9d9d%'
     AND elite_trial_active
     AND (
       (grace_period_ends_at IS NOT NULL AND grace_period_ends_at < NOW())
       OR (trial_ends_at IS NOT NULL AND trial_ends_at < NOW()
           AND grace_period_ends_at IS NULL)
     );

  IF v_trial_eligible > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('REFUSING TO RUN: %s real merchant(s) have an Elite trial this suite would act on.', v_trial_eligible),
      DETAIL  = 'Scenario D calls handle_trial_expiry() unscoped: it would start grace periods, insert agent_tasks and tier_flags, and downgrade tiers for real merchants, and does not clean them up.',
      HINT    = 'Run this suite only against a throwaway stack — make db-verify. Never against production.';
  END IF;
END $$;

-- Preserve the operator's demo-mode setting: these tests flip it, and leaving
-- it on would silently expose synthetic data in whatever environment ran them.
-- All three keys the suite overwrites, not just the flag: scenario E2 retunes
-- the floor and ceiling, and writing literals back would silently discard
-- whatever the operator had set for a rehearsal.
CREATE TEMP TABLE _demo_mode_restore AS
  SELECT key, value FROM public.app_config
   WHERE key IN ('demo_mode_enabled', 'demo_flash_deal_floor', 'demo_flash_deal_ceiling');

-- If the key is missing the snapshot is empty and the restore UPDATE at the
-- end silently matches nothing, leaving whatever the last scenario wrote. Fail
-- here instead, where the message still points at the cause.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _demo_mode_restore WHERE key = 'demo_mode_enabled') THEN
    RAISE EXCEPTION 'app_config.demo_mode_enabled is missing — the restore step could not honour its contract. Apply 20260729140000_demo_mode_tagging.sql first.';
  END IF;
END $$;

-- Scenario A: is_demo_mode() is fail-safe.
--   Only the exact string 'true' (case/whitespace insensitive) enables demo
--   mode. Every other state — including a missing key — must read as OFF,
--   because the dangerous direction is demo data leaking into a real launch.
DO $$
BEGIN
  UPDATE public.app_config SET value = 'true'  WHERE key = 'demo_mode_enabled';
  ASSERT public.is_demo_mode(),      'A1: "true" should enable demo mode';

  UPDATE public.app_config SET value = ' TRUE ' WHERE key = 'demo_mode_enabled';
  ASSERT public.is_demo_mode(),      'A2: whitespace/case variants of true should enable';

  UPDATE public.app_config SET value = '1'    WHERE key = 'demo_mode_enabled';
  ASSERT NOT public.is_demo_mode(), 'A3: "1" must NOT enable demo mode';
  UPDATE public.app_config SET value = 'yes'  WHERE key = 'demo_mode_enabled';
  ASSERT NOT public.is_demo_mode(), 'A4: "yes" must NOT enable demo mode';
  UPDATE public.app_config SET value = ''     WHERE key = 'demo_mode_enabled';
  ASSERT NOT public.is_demo_mode(), 'A5: empty must NOT enable demo mode';

  RAISE NOTICE 'A ok — is_demo_mode() fail-safe';
END $$;

-- Scenario B: browse views hide demo rows in launch mode and never hide real ones.
DO $$
DECLARE
  v_real_merchant UUID := '9d9d9d9d-0000-4000-a000-000000000001';
  v_demo_merchant UUID := '9d9d9d9d-0000-4000-a000-000000000002';
  v_real_deal     UUID := '9d9d9d9d-1111-4000-a000-000000000001';
  v_demo_deal     UUID := '9d9d9d9d-1111-4000-a000-000000000002';
  v_n             INT;
BEGIN
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_visible, account_balance, is_demo)
  VALUES (v_real_merchant, 'ZZ Test Real Shop', 'zz.test.real', '+254700099001', 'active', TRUE, 500, FALSE),
         (v_demo_merchant, 'ZZ Test Demo Shop', 'zz.test.demo', '+254700099002', 'active', TRUE, 500, TRUE);

  INSERT INTO public.deals (id, merchant_id, title, image_url, is_active, expires_at, is_demo)
  VALUES (v_real_deal, v_real_merchant, 'ZZ Real deal', '/x.png', TRUE, NOW() + INTERVAL '6 hours', FALSE),
         (v_demo_deal, v_demo_merchant, 'ZZ Demo deal', '/x.png', TRUE, NOW() + INTERVAL '6 hours', TRUE);

  -- Launch mode: real only.
  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';

  SELECT count(*) INTO v_n FROM public.deals_public_browse WHERE id = v_demo_deal;
  ASSERT v_n = 0, 'B1: demo deal must be hidden when demo mode is off';
  SELECT count(*) INTO v_n FROM public.deals_public_browse WHERE id = v_real_deal;
  ASSERT v_n = 1, 'B2: REAL deal must stay visible when demo mode is off';
  SELECT count(*) INTO v_n FROM public.merchants_public_browse WHERE id = v_demo_merchant;
  ASSERT v_n = 0, 'B3: demo merchant must be hidden when demo mode is off';
  SELECT count(*) INTO v_n FROM public.merchants_public_browse WHERE id = v_real_merchant;
  ASSERT v_n = 1, 'B4: REAL merchant must stay visible when demo mode is off';

  -- Demo mode: both.
  UPDATE public.app_config SET value = 'true' WHERE key = 'demo_mode_enabled';

  SELECT count(*) INTO v_n FROM public.deals_public_browse WHERE id = v_demo_deal;
  ASSERT v_n = 1, 'B5: demo deal must be visible when demo mode is on';
  SELECT count(*) INTO v_n FROM public.deals_public_browse WHERE id = v_real_deal;
  ASSERT v_n = 1, 'B6: REAL deal must remain visible when demo mode is on';

  DELETE FROM public.deals     WHERE id IN (v_real_deal, v_demo_deal);
  DELETE FROM public.merchants WHERE id IN (v_real_merchant, v_demo_merchant);
  RAISE NOTICE 'B ok — browse views gate demo rows, never real ones';
END $$;

-- Scenario C: a real deal on a DEMO merchant is still hidden in launch mode.
--   Guards the join predicate specifically — tagging the deal alone is not
--   enough, because a rehearsal deal created by hand against a seeded shop
--   would otherwise leak.
DO $$
DECLARE
  v_demo_merchant UUID := '9d9d9d9d-0000-4000-a000-000000000003';
  v_untagged_deal UUID := '9d9d9d9d-1111-4000-a000-000000000003';
  v_n INT;
BEGIN
  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';

  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_visible, account_balance, is_demo)
  VALUES (v_demo_merchant, 'ZZ Test Demo Shop 3', 'zz.test.three', '+254700099003', 'active', TRUE, 500, TRUE);
  INSERT INTO public.deals (id, merchant_id, title, image_url, is_active, expires_at, is_demo)
  VALUES (v_untagged_deal, v_demo_merchant, 'ZZ untagged deal', '/x.png', TRUE, NOW() + INTERVAL '6 hours', FALSE);

  SELECT count(*) INTO v_n FROM public.deals_public_browse WHERE id = v_untagged_deal;
  ASSERT v_n = 0, 'C1: deal on a demo merchant must be hidden even if the deal itself is untagged';

  DELETE FROM public.deals     WHERE id = v_untagged_deal;
  DELETE FROM public.merchants WHERE id = v_demo_merchant;
  RAISE NOTICE 'C ok — demo merchants hide their deals';
END $$;

-- Scenario D: handle_trial_expiry never manages demo merchants.
--   Both merchants have an identically expired Elite trial; only the real one
--   may be acted on. This is the live defect the isolation migration fixed.
DO $$
DECLARE
  v_real UUID := '9d9d9d9d-0000-4000-a000-000000000010';
  v_demo UUID := '9d9d9d9d-0000-4000-a000-000000000011';
  v_n INT;
BEGIN
  INSERT INTO public.merchants
    (id, merchant_name, what3words_address, phone, status, tier, elite_trial_active, trial_ends_at, grace_period_ends_at, is_demo)
  VALUES
    (v_real, 'ZZ Trial Real', 'zz.trial.real', '+254700099010', 'active', 'elite', TRUE, NOW() - INTERVAL '2 days', NULL, FALSE),
    (v_demo, 'ZZ Trial Demo', 'zz.trial.demo', '+254700099011', 'active', 'elite', TRUE, NOW() - INTERVAL '2 days', NULL, TRUE);

  PERFORM public.handle_trial_expiry();

  SELECT count(*) INTO v_n FROM public.merchants
   WHERE id = v_demo AND grace_period_ends_at IS NOT NULL;
  ASSERT v_n = 0, 'D1: demo merchant must NOT be given a grace period';

  SELECT count(*) INTO v_n FROM public.agent_tasks WHERE merchant_id = v_demo;
  ASSERT v_n = 0, 'D2: demo merchant must NOT generate an agent task';

  SELECT count(*) INTO v_n FROM public.merchants
   WHERE id = v_real AND grace_period_ends_at IS NOT NULL;
  ASSERT v_n = 1, 'D3: REAL merchant must still be processed normally';

  DELETE FROM public.agent_tasks WHERE merchant_id IN (v_real, v_demo);
  DELETE FROM public.tier_flags  WHERE merchant_id IN (v_real, v_demo);
  DELETE FROM public.merchants   WHERE id IN (v_real, v_demo);
  RAISE NOTICE 'D ok — trial lifecycle skips demo merchants';
END $$;

-- Scenario E: reseed no-ops in launch mode, and only ever creates demo rows.
DO $$
DECLARE
  v_created INT;
  v_before  INT;
BEGIN
  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';
  SELECT count(*) INTO v_before FROM public.deals;

  v_created := public.reseed_demo_flash_deals();
  ASSERT v_created = 0, 'E1: reseed must no-op when demo mode is off';

  ASSERT (SELECT count(*) FROM public.deals) = v_before,
    'E2: reseed must not write a single row when demo mode is off';

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.deals d
      JOIN public.merchants m ON m.id = d.merchant_id
     WHERE d.demo_source = 'autoreseed' AND NOT m.is_demo
  ), 'E3: no reseeded deal may ever attach to a real merchant';

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.deals WHERE demo_source = 'autoreseed' AND NOT is_demo
  ), 'E4: every reseeded deal must be tagged is_demo';

  RAISE NOTICE 'E ok — reseed gated and demo-scoped';
END $$;

-- Scenario E2: the reseed's CREATION path.
--   E1-E4 above run entirely with demo mode off, so they only prove the master
--   switch works — every assertion about created rows passes over an empty set.
--   This turns demo mode on and exercises what 20260729150000/160000/180000
--   actually changed: Elite-only eligibility, the active-deal limit, and the
--   retirement of expired demo deals that would otherwise saturate it.
DO $$
DECLARE
  v_elite    UUID := '9d9d9d9d-0000-4000-a000-000000000040';
  v_standard UUID := '9d9d9d9d-0000-4000-a000-000000000041';
  v_created  INT;
  v_n        INT;
BEGIN
  UPDATE public.app_config SET value = 'true'  WHERE key = 'demo_mode_enabled';
  -- Floor 1 / ceiling 2 keeps the run small and deterministic in intent.
  UPDATE public.app_config SET value = '1' WHERE key = 'demo_flash_deal_floor';
  UPDATE public.app_config SET value = '2' WHERE key = 'demo_flash_deal_ceiling';

  INSERT INTO public.merchants
    (id, merchant_name, what3words_address, phone, status, is_demo, is_visible,
     tier, account_balance)
  VALUES
    (v_elite,    'ZZ Reseed Elite',    'zz.reseed.elite',    '+254700099040',
     'active', TRUE, TRUE, 'elite',    500),
    (v_standard, 'ZZ Reseed Standard', 'zz.reseed.standard', '+254700099041',
     'active', TRUE, TRUE, 'standard', 500);

  v_created := public.reseed_demo_flash_deals();
  ASSERT v_created > 0, 'E5: reseed must create rows when demo mode is on';

  SELECT count(*) INTO v_n FROM public.deals
   WHERE merchant_id = v_elite AND demo_source = 'autoreseed'
     AND is_demo AND deal_type = 'flash';
  ASSERT v_n > 0, 'E6: an eligible Elite demo merchant must be selected';

  -- Flash is Elite-only in enforce_deal_limit(); picking a Standard merchant
  -- would raise and abort the whole run.
  SELECT count(*) INTO v_n FROM public.deals WHERE merchant_id = v_standard;
  ASSERT v_n = 0, 'E7: a Standard demo merchant must never be selected';

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.deals WHERE demo_source = 'autoreseed' AND NOT is_demo
  ), 'E8: every created row must be tagged is_demo';

  -- Saturation: expire the Elite merchant's deals but leave is_active TRUE,
  -- which is exactly the state the reseed leaves behind an hour later. Before
  -- 20260729180000 the merchant stayed pinned at the limit and the job returned
  -- 0 forever, draining the pool.
  --   Two rounds, because one merchant reaches the cap of 2 only on the second
  --   pass — and the whole point is that the failure is slow. Round 2 is where
  --   the unfixed function goes to 0 and stays there.
  FOR v_n IN 1..2 LOOP
    UPDATE public.deals SET expires_at = NOW() - INTERVAL '1 hour'
     WHERE merchant_id = v_elite AND is_demo;

    v_created := public.reseed_demo_flash_deals();
    ASSERT v_created > 0,
      format('E9: expired demo deals must be retired so the reseed can refill (round %s returned %s)',
             v_n, v_created);
  END LOOP;

  SELECT count(*) INTO v_n FROM public.deals
   WHERE merchant_id = v_elite AND is_active AND expires_at <= NOW();
  ASSERT v_n = 0, 'E10: no expired demo deal may still be counted as active';

  -- Floor/ceiling are restored from the snapshot at the end of the file, not
  -- reset to literals here.
  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';

  DELETE FROM public.archive_history WHERE merchant_id IN (v_elite, v_standard);
  DELETE FROM public.deals           WHERE merchant_id IN (v_elite, v_standard);
  DELETE FROM public.tier_flags      WHERE merchant_id IN (v_elite, v_standard);
  DELETE FROM public.merchants       WHERE id IN (v_elite, v_standard);
  RAISE NOTICE 'E2 ok — reseed creates Elite-only rows and retires expired ones';
END $$;

-- Scenario F: wipe_demo_data() is dry-run by default and spares real rows.
DO $$
DECLARE
  v_real UUID := '9d9d9d9d-0000-4000-a000-000000000020';
  v_demo UUID := '9d9d9d9d-0000-4000-a000-000000000021';
  v_n INT;
BEGIN
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_demo)
  VALUES (v_real, 'ZZ Wipe Real', 'zz.wipe.real', '+254700099020', 'active', FALSE),
         (v_demo, 'ZZ Wipe Demo', 'zz.wipe.demo', '+254700099021', 'active', TRUE);

  -- Default call must report only.
  PERFORM public.wipe_demo_data();
  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_demo;
  ASSERT v_n = 1, 'F1: default wipe must be a dry run and delete nothing';

  PERFORM public.wipe_demo_data(TRUE);
  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_demo;
  ASSERT v_n = 0, 'F2: confirmed wipe must remove demo merchants';
  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_real;
  ASSERT v_n = 1, 'F3: confirmed wipe must NOT touch real merchants';

  DELETE FROM public.merchants WHERE id = v_real;
  RAISE NOTICE 'F ok — wipe is dry-run by default and real-safe';
END $$;

-- Scenario G: the wipe clears FK dependents that would otherwise block it.
--   Every table below references merchants/deals/users with ON DELETE NO
--   ACTION, so an unhandled row raises a foreign-key violation and the whole
--   wipe aborts. With the shipped seeds in place, fraud_events and agents both
--   already held such rows — this scenario reproduces that and asserts the
--   wipe now completes, that a real merchant's own audit trail survives, and
--   that leads are detached rather than destroyed.
DO $$
DECLARE
  v_demo_m UUID := '9d9d9d9d-0000-4000-a000-000000000030';
  v_real_m UUID := '9d9d9d9d-0000-4000-a000-000000000031';
  v_demo_u UUID := '9d9d9d9d-2222-4000-a000-000000000030';
  v_agent  UUID;
  v_n INT;
BEGIN
  INSERT INTO public.users (id, email, role, is_demo)
  VALUES (v_demo_u, 'zz-demo-agent@example.test', 'agent', TRUE);
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_demo)
  VALUES (v_demo_m, 'ZZ FK Demo', 'zz.fk.demo', '+254700099030', 'active', TRUE),
         (v_real_m, 'ZZ FK Real', 'zz.fk.real', '+254700099031', 'active', FALSE);

  -- Blockers on the demo merchant / demo user. agents.user_id and
  -- fraud_events.event_type are NOT NULL, and leads/audit_logs both require an
  -- agent_id, so the demo agent is created first and reused below.
  INSERT INTO public.agents (user_id) VALUES (v_demo_u) RETURNING id INTO v_agent;
  INSERT INTO public.fraud_events (merchant_id, event_type) VALUES (v_demo_m, 'merchant_override');
  INSERT INTO public.audit_logs (agent_id, merchant_id) VALUES (v_agent, v_demo_m);
  -- A REAL lead that happened to convert to a synthetic merchant.
  INSERT INTO public.leads (agent_id, shop_name, converted_to) VALUES (v_agent, 'ZZ FK Lead', v_demo_m);
  -- The real merchant's own trail, which must survive untouched.
  INSERT INTO public.audit_logs (agent_id, merchant_id) VALUES (v_agent, v_real_m);

  -- Would raise a foreign_key_violation before the dependent handling existed.
  PERFORM public.wipe_demo_data(TRUE);

  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_demo_m;
  ASSERT v_n = 0, 'G1: wipe must complete despite FK dependents';

  SELECT count(*) INTO v_n FROM public.audit_logs WHERE merchant_id = v_real_m;
  ASSERT v_n = 1, 'G2: a real merchant''s audit trail must survive the wipe';

  SELECT count(*) INTO v_n FROM public.leads WHERE converted_to = v_demo_m;
  ASSERT v_n = 0, 'G3: leads must be detached from wiped demo merchants';

  -- Clean up EVERY fixture this scenario created, scoped to the agent it made.
  -- `WHERE converted_to IS NULL` would have matched every real unconverted lead
  -- in the database, so scoping is not tidiness — it is the difference between
  -- a self-contained test and a data-loss bug. The demo agent and its user are
  -- deliberately spared by wipe_demo_data (leads.agent_id is NOT NULL), so they
  -- are removed here too, otherwise a second run collides on the fixed UUID.
  DELETE FROM public.audit_logs WHERE agent_id = v_agent;
  DELETE FROM public.leads      WHERE agent_id = v_agent;
  DELETE FROM public.merchants  WHERE id = v_real_m;
  DELETE FROM public.agents     WHERE id = v_agent;
  DELETE FROM public.users      WHERE id = v_demo_u;
  RAISE NOTICE 'G ok — wipe clears blocking dependents, spares real trails';
END $$;

-- Scenario H: a demo agent is blocked by references OTHER than leads.
--   Five columns point at agents(id), all ON DELETE NO ACTION. Scenario G
--   covers the leads route; this covers the two that survive on a REAL parent
--   — an audit of a real merchant, and onboarding attribution on one — which
--   the original leads-only guard walked straight into.
--   (migration 20260729170000)
DO $$
DECLARE
  v_demo_m UUID := '9d9d9d9d-0000-4000-a000-000000000032';
  v_real_m UUID := '9d9d9d9d-0000-4000-a000-000000000033';
  v_demo_u UUID := '9d9d9d9d-2222-4000-a000-000000000032';
  v_agent  UUID;
  v_n INT;
BEGIN
  INSERT INTO public.users (id, email, role, is_demo)
  VALUES (v_demo_u, 'zz-demo-agent-h@example.test', 'agent', TRUE);
  -- Deliberately NO lead: the old guard would have deleted this agent.
  INSERT INTO public.agents (user_id) VALUES (v_demo_u) RETURNING id INTO v_agent;

  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_demo, onboarded_by)
  VALUES (v_real_m, 'ZZ Agent-Ref Real', 'zz.agentref.real', '+254700099033', 'active', FALSE, v_agent);
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_demo)
  VALUES (v_demo_m, 'ZZ Agent-Ref Demo', 'zz.agentref.demo', '+254700099032', 'active', TRUE);

  -- The demo agent audited a REAL merchant. audit_logs.agent_id is NOT NULL
  -- and the wipe only clears rows on DEMO merchants, so this row survives and
  -- must hold the agent.
  INSERT INTO public.audit_logs (agent_id, merchant_id) VALUES (v_agent, v_real_m);

  -- Would raise a foreign_key_violation before 20260729170000.
  PERFORM public.wipe_demo_data(TRUE);

  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_demo_m;
  ASSERT v_n = 0, 'H1: wipe must still remove demo merchants';

  SELECT count(*) INTO v_n FROM public.agents WHERE id = v_agent;
  ASSERT v_n = 1, 'H2: an agent a surviving row references must be retained';

  SELECT count(*) INTO v_n FROM public.users WHERE id = v_demo_u;
  ASSERT v_n = 1, 'H3: the user behind a retained agent must be retained too';

  SELECT count(*) INTO v_n FROM public.audit_logs WHERE merchant_id = v_real_m;
  ASSERT v_n = 1, 'H4: a real merchant''s audit trail must survive the wipe';

  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_real_m;
  ASSERT v_n = 1, 'H5: a real merchant onboarded by a demo agent must survive';

  DELETE FROM public.audit_logs WHERE agent_id = v_agent;
  DELETE FROM public.merchants  WHERE id = v_real_m;
  DELETE FROM public.agents     WHERE id = v_agent;
  DELETE FROM public.users      WHERE id = v_demo_u;
  RAISE NOTICE 'H ok — non-lead references hold a demo agent through the wipe';
END $$;

-- Scenario I: a demo USER is blocked by references other than agents.
--   Same bug class as H, on the other side of the graph. Four non-CASCADE FKs
--   point at users from rows the wipe does not clear: a real merchant owned by
--   or onboarded by a demo user, a real redemption made by one, a real fee
--   reversal approved by one. Any of them aborts the whole wipe.
--   (migration 20260729190000)
DO $$
DECLARE
  v_demo_m UUID := '9d9d9d9d-0000-4000-a000-000000000050';
  v_real_m UUID := '9d9d9d9d-0000-4000-a000-000000000051';
  v_demo_u UUID := '9d9d9d9d-2222-4000-a000-000000000050';
  v_real_d UUID := '9d9d9d9d-1111-4000-a000-000000000050';
  v_n INT;
BEGIN
  INSERT INTO public.users (id, email, role, is_demo)
  VALUES (v_demo_u, 'zz-demo-shopper-i@example.test', 'customer', TRUE);

  -- account_balance > 0: the zero-balance gate blocks new deals otherwise, and
  -- this scenario needs a real deal to hang a real redemption off.
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_demo, account_balance, onboarded_by_user_id)
  VALUES (v_real_m, 'ZZ User-Ref Real', 'zz.userref.real', '+254700099051', 'active', FALSE, 500, v_demo_u);
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status, is_demo)
  VALUES (v_demo_m, 'ZZ User-Ref Demo', 'zz.userref.demo', '+254700099050', 'active', TRUE);

  -- A REAL redemption made by the demo shopper. The wipe deletes redemptions
  -- on is_demo alone, so this one survives and must hold the user.
  INSERT INTO public.deals (id, merchant_id, title, image_url, is_active, expires_at, is_demo)
  VALUES (v_real_d, v_real_m, 'ZZ Real deal I', '/x.png', TRUE, NOW() + INTERVAL '6 hours', FALSE);
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status,
                                  redeemed_at, expires_at, is_demo)
  VALUES (v_real_d, v_real_m, v_demo_u, '424242', 'success',
          NOW() - INTERVAL '1 hour', NOW() - INTERVAL '50 minutes', FALSE);

  -- Would raise a foreign_key_violation before 20260729190000.
  PERFORM public.wipe_demo_data(TRUE);

  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_demo_m;
  ASSERT v_n = 0, 'I1: wipe must still remove demo merchants';

  SELECT count(*) INTO v_n FROM public.users WHERE id = v_demo_u;
  ASSERT v_n = 1, 'I2: a user a surviving row references must be retained';

  SELECT count(*) INTO v_n FROM public.redemptions WHERE user_id = v_demo_u AND NOT is_demo;
  ASSERT v_n = 1, 'I3: a real redemption must survive the wipe';

  SELECT count(*) INTO v_n FROM public.merchants WHERE id = v_real_m;
  ASSERT v_n = 1, 'I4: a real merchant onboarded by a demo user must survive';

  -- The dry run must agree with what actually happens: this user is retained,
  -- so it must be reported as retained rather than counted for deletion.
  SELECT rows_affected INTO v_n FROM public.wipe_demo_data()
   WHERE table_name = 'users RETAINED (still referenced)';
  ASSERT v_n >= 1, 'I5: dry run must report the retained user';

  DELETE FROM public.redemptions WHERE user_id = v_demo_u;
  DELETE FROM public.deals       WHERE id = v_real_d;
  DELETE FROM public.merchants   WHERE id = v_real_m;
  DELETE FROM public.users       WHERE id = v_demo_u;
  RAISE NOTICE 'I ok — non-agent references hold a demo user through the wipe';
END $$;

-- Scenario J: the daily seed refresh reopens expiry windows without trampling
--   the things it must not touch.
--   The fixed seed batches all expire together roughly a day after seeding, which
--   took production from 248 live demo deals to 25 overnight. refresh_demo_seed_deals()
--   reopens them. Three things it must get right, and only the first is obvious.
--   (migration 20260730010000)
DO $$
DECLARE
  v_seed_m   UUID := '9d9d9d9d-0000-4000-a000-000000000060';
  v_reseed_m UUID := '9d9d9d9d-0000-4000-a000-000000000061';
  -- nairobi_150's deliberate empty-state fixture. This exact id is the only way
  -- to test the exclusion, since its merchant row is indistinguishable from any
  -- other active visible standard merchant. Removed in cleanup below.
  v_dark_m   UUID := 'c2000000-0000-4000-a000-000000000059';
  v_seed_d   UUID := '9d9d9d9d-1111-4000-a000-000000000060';
  v_dark_d   UUID := '9d9d9d9d-1111-4000-a000-000000000061';
  v_reseed_d UUID := '9d9d9d9d-1111-4000-a000-000000000062';
  v_n INT;
BEGIN
  INSERT INTO public.merchants (id, merchant_name, what3words_address, phone, status,
                                is_demo, is_visible, tier, account_balance)
  VALUES (v_seed_m,   'ZZ Seed Shop',   'zz.refresh.seed',   '+254700099060', 'active', TRUE, TRUE, 'elite',    500),
         (v_reseed_m, 'ZZ Reseed Shop', 'zz.refresh.reseed', '+254700099061', 'active', TRUE, TRUE, 'elite',    500),
         (v_dark_m,   'ZZ Dark Shop',   'zz.refresh.dark',   '+254700099062', 'active', TRUE, TRUE, 'standard', 500);

  -- All three start expired, which is the state the bug leaves behind.
  INSERT INTO public.deals (id, merchant_id, title, image_url, deal_type, is_active, is_paused,
                            starts_at, expires_at, is_demo, demo_source)
  VALUES (v_seed_d,   v_seed_m,   'ZZ seed standard', '/x.png', 'standard', TRUE,  FALSE,
          NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', TRUE, 'nairobi_150'),
         (v_dark_d,   v_dark_m,   'ZZ dark deal',     '/x.png', 'standard', FALSE, FALSE,
          NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', TRUE, 'nairobi_150'),
         (v_reseed_d, v_reseed_m, 'ZZ autoreseed',    '/x.png', 'flash',    TRUE,  FALSE,
          NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', TRUE, 'autoreseed');

  -- Off mode: must not resurrect anything. An operator letting demo data lapse
  -- before a cutover cannot have a cron undo it overnight.
  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';
  ASSERT public.refresh_demo_seed_deals() = 0,
    'J1: refresh must no-op entirely when demo mode is off';
  SELECT count(*) INTO v_n FROM public.deals
   WHERE id = v_seed_d AND expires_at > NOW();
  ASSERT v_n = 0, 'J2: nothing may be refreshed while demo mode is off';

  UPDATE public.app_config SET value = 'true' WHERE key = 'demo_mode_enabled';
  ASSERT public.refresh_demo_seed_deals() = 1,
    'J3: exactly the one eligible seed deal must be refreshed';

  SELECT count(*) INTO v_n FROM public.deals
   WHERE id = v_seed_d AND is_active AND NOT is_paused AND expires_at > NOW();
  ASSERT v_n = 1, 'J4: an expired seed deal must come back live';

  -- The two dark fixtures exist so the empty-state and suspended-shop surfaces
  -- have something to render. Blanket-activating would delete those test cases.
  SELECT count(*) INTO v_n FROM public.deals WHERE id = v_dark_d AND is_active;
  ASSERT v_n = 0, 'J5: the deliberately-dark fixture shop must stay dark';

  -- reseed_demo_flash_deals() owns autoreseed rows; two jobs extending the same
  -- windows would fight over them.
  SELECT count(*) INTO v_n FROM public.deals
   WHERE id = v_reseed_d AND expires_at > NOW();
  ASSERT v_n = 0, 'J6: autoreseed rows belong to the reseed, not the refresh';

  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';
  DELETE FROM public.archive_history WHERE merchant_id IN (v_seed_m, v_reseed_m, v_dark_m);
  DELETE FROM public.deals     WHERE id IN (v_seed_d, v_dark_d, v_reseed_d);
  DELETE FROM public.merchants WHERE id IN (v_seed_m, v_reseed_m, v_dark_m);
  RAISE NOTICE 'J ok — seed refresh reopens windows, spares dark fixtures and autoreseed';
END $$;

-- Restore the operator's original demo-mode setting.
UPDATE public.app_config a
   SET value = r.value
  FROM _demo_mode_restore r
 WHERE a.key = r.key;

SELECT 'demo_mode_test: all scenarios passed. demo_mode_enabled restored to '
       || (SELECT value FROM public.app_config WHERE key = 'demo_mode_enabled') AS result;
