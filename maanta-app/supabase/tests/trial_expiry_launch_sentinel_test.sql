-- ============================================================
-- Test: handle_trial_expiry() phase selection, and its behaviour when the
--   launch sentinel is missing
--   (migration 20260730140000_trial_expiry_launch_sentinel_null_guard.sql)
--
-- Self-contained and self-cleaning. Run against a database that has the
-- migrations applied, e.g.:
--   psql "$DATABASE_URL" -f supabase/tests/trial_expiry_launch_sentinel_test.sql
--
-- Each scenario runs inside a DO block. ASSERT raises (aborting the whole run)
-- on failure; on success the block deletes the rows it made. Test merchants use
-- user_id = NULL and a recognizable name prefix.
--
-- IMPORTANT: handle_trial_expiry() is global — it sweeps every merchant, not a
-- merchant passed in. So each scenario asserts only about ITS OWN fixtures and
-- never about row counts, and the app_config sentinel is snapshotted and
-- restored inside every block that mutates it.
--
-- On the sentinel's safety, since scenario C deletes it outright: the real
-- protection is that each DO block is one transaction under psql autocommit, so
-- a failing ASSERT rolls the whole block back — deletion included. Verified by
-- running the suite against the pre-fix function: C failed and the key was still
-- present afterwards. The explicit restore before C's assertions is belt and
-- braces for any path that reports failure without aborting.
-- ============================================================

-- Scenario A: inside the launch period → expiring trial gets a 7-day grace
-- period and an agent task, and is NOT downgraded yet.
DO $$
DECLARE
  v_mid        UUID;
  v_saved      TEXT;
  v_trial_end  TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_m          RECORD;
  v_task       RECORD;
BEGIN
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'node0_launch_period_ends_at';

  UPDATE public.app_config SET value = (NOW() + INTERVAL '30 days')::TEXT
    WHERE key = 'node0_launch_period_ends_at';

  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status,
    tier, elite_trial_active, trial_ends_at, grace_period_ends_at
  )
  VALUES (
    '__test_trial_sentinel_A', 'test.trial.a', '+254700009001', 'BBS Mall', 'active',
    'elite', TRUE, v_trial_end, NULL
  )
  RETURNING id INTO v_mid;

  PERFORM public.handle_trial_expiry();

  SELECT * INTO v_m FROM public.merchants WHERE id = v_mid;
  ASSERT v_m.grace_period_ends_at IS NOT NULL, 'A: grace period was not opened';
  ASSERT v_m.grace_period_ends_at = v_trial_end + INTERVAL '7 days',
    format('A: grace end = %s, expected %s', v_m.grace_period_ends_at, v_trial_end + INTERVAL '7 days');
  ASSERT v_m.tier = 'elite',            format('A: tier = %s, expected elite', v_m.tier);
  ASSERT v_m.elite_trial_active,        'A: trial deactivated too early';

  SELECT * INTO v_task FROM public.agent_tasks WHERE merchant_id = v_mid;
  ASSERT FOUND, 'A: no agent conversion task created';
  ASSERT v_task.task_type = 'onboarding_followup', format('A: task_type = %s', v_task.task_type);
  ASSERT v_task.due_at = v_m.grace_period_ends_at, 'A: task due_at does not match grace end';

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.tier_flags  WHERE merchant_id = v_mid;
  DELETE FROM public.merchants   WHERE id = v_mid;
  UPDATE public.app_config SET value = v_saved WHERE key = 'node0_launch_period_ends_at';

  RAISE NOTICE 'A ok: inside launch period — grace opened, agent task created, no downgrade';
END $$;

-- Scenario B: launch period over → expiring trial is downgraded immediately,
-- with no grace period, and the tier_flags note uses post-launch wording.
DO $$
DECLARE
  v_mid   UUID;
  v_saved TEXT;
  v_m     RECORD;
  v_flag  RECORD;
BEGIN
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'node0_launch_period_ends_at';

  UPDATE public.app_config SET value = (NOW() - INTERVAL '1 day')::TEXT
    WHERE key = 'node0_launch_period_ends_at';

  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status,
    tier, elite_trial_active, trial_ends_at, grace_period_ends_at
  )
  VALUES (
    '__test_trial_sentinel_B', 'test.trial.b', '+254700009002', 'BBS Mall', 'active',
    'elite', TRUE, NOW() - INTERVAL '1 hour', NULL
  )
  RETURNING id INTO v_mid;

  PERFORM public.handle_trial_expiry();

  SELECT * INTO v_m FROM public.merchants WHERE id = v_mid;
  ASSERT v_m.tier = 'standard',          format('B: tier = %s, expected standard', v_m.tier);
  ASSERT NOT v_m.elite_trial_active,     'B: elite_trial_active still TRUE';
  ASSERT v_m.grace_period_ends_at IS NULL, 'B: a grace period was opened post-launch';

  ASSERT NOT EXISTS (SELECT 1 FROM public.agent_tasks WHERE merchant_id = v_mid),
    'B: an agent conversion task was created post-launch';

  SELECT * INTO v_flag FROM public.tier_flags WHERE merchant_id = v_mid;
  ASSERT FOUND, 'B: no tier_flags row written';
  ASSERT v_flag.flag_type = 'subscription_lapsed', format('B: flag_type = %s', v_flag.flag_type);
  ASSERT v_flag.notes LIKE '%post-launch-period%',
    'B: tier_flags note does not use the post-launch wording';

  DELETE FROM public.tier_flags WHERE merchant_id = v_mid;
  DELETE FROM public.merchants  WHERE id = v_mid;
  UPDATE public.app_config SET value = v_saved WHERE key = 'node0_launch_period_ends_at';

  RAISE NOTICE 'B ok: post-launch — immediate downgrade, no grace, no agent task';
END $$;

-- Scenario C: THE REGRESSION. Sentinel missing entirely.
--
-- Before the guard, `NOW() <= NULL` made v_in_launch_period NULL, so neither
-- PHASE 1 (grace + task) nor PHASE 2 (immediate downgrade) ran: the merchant sat
-- in Elite forever with no grace row and no error. This asserts the safe default
-- instead — treated as still inside the launch period, so the merchant keeps the
-- grace period the frozen rule promises.
DO $$
DECLARE
  v_mid       UUID;
  v_saved     TEXT;
  v_trial_end TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_m         RECORD;
BEGIN
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
  ASSERT v_saved IS NOT NULL,
    'C: node0_launch_period_ends_at is already absent — cannot safely test its absence';

  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status,
    tier, elite_trial_active, trial_ends_at, grace_period_ends_at
  )
  VALUES (
    '__test_trial_sentinel_C', 'test.trial.c', '+254700009003', 'BBS Mall', 'active',
    'elite', TRUE, v_trial_end, NULL
  )
  RETURNING id INTO v_mid;

  DELETE FROM public.app_config WHERE key = 'node0_launch_period_ends_at';

  -- Raises a WARNING; must not raise an exception.
  PERFORM public.handle_trial_expiry();

  -- Restore before asserting, so a failure below cannot leave the key missing.
  INSERT INTO public.app_config (key, value)
  VALUES ('node0_launch_period_ends_at', v_saved)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  SELECT * INTO v_m FROM public.merchants WHERE id = v_mid;
  ASSERT v_m.grace_period_ends_at IS NOT NULL,
    'C: grace period NOT opened with the sentinel missing — the NULL trap is back';
  ASSERT v_m.grace_period_ends_at = v_trial_end + INTERVAL '7 days',
    format('C: grace end = %s', v_m.grace_period_ends_at);
  ASSERT v_m.tier = 'elite',
    format('C: tier = %s — downgraded with no grace, which breaches the frozen rule', v_m.tier);
  ASSERT v_m.elite_trial_active, 'C: elite_trial_active cleared without a grace period';

  ASSERT EXISTS (SELECT 1 FROM public.agent_tasks WHERE merchant_id = v_mid),
    'C: no agent conversion task created with the sentinel missing';

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.tier_flags  WHERE merchant_id = v_mid;
  DELETE FROM public.merchants   WHERE id = v_mid;

  ASSERT (SELECT value FROM public.app_config WHERE key = 'node0_launch_period_ends_at') = v_saved,
    'C: sentinel not restored';

  RAISE NOTICE 'C ok: sentinel missing — treated as launch period, grace granted, warned not aborted';
END $$;

-- Scenario D: grace expiry downgrades regardless of the sentinel. This arm never
-- referenced it, so it kept working even while the trap was live — pinned here so
-- the guard cannot regress it either.
DO $$
DECLARE
  v_mid   UUID;
  v_saved TEXT;
  v_m     RECORD;
  v_flag  RECORD;
BEGIN
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'node0_launch_period_ends_at';

  UPDATE public.app_config SET value = (NOW() + INTERVAL '30 days')::TEXT
    WHERE key = 'node0_launch_period_ends_at';

  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status,
    tier, elite_trial_active, trial_ends_at, grace_period_ends_at
  )
  VALUES (
    '__test_trial_sentinel_D', 'test.trial.d', '+254700009004', 'BBS Mall', 'active',
    'elite', TRUE, NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 hour'
  )
  RETURNING id INTO v_mid;

  PERFORM public.handle_trial_expiry();

  SELECT * INTO v_m FROM public.merchants WHERE id = v_mid;
  ASSERT v_m.tier = 'standard',      format('D: tier = %s, expected standard', v_m.tier);
  ASSERT NOT v_m.elite_trial_active, 'D: elite_trial_active still TRUE after grace expiry';

  SELECT * INTO v_flag FROM public.tier_flags WHERE merchant_id = v_mid;
  ASSERT FOUND, 'D: no tier_flags row written';
  ASSERT v_flag.notes LIKE '%grace period%',
    'D: tier_flags note does not use the grace-expiry wording';

  DELETE FROM public.tier_flags WHERE merchant_id = v_mid;
  DELETE FROM public.merchants  WHERE id = v_mid;
  UPDATE public.app_config SET value = v_saved WHERE key = 'node0_launch_period_ends_at';

  RAISE NOTICE 'D ok: grace expiry downgrades, with grace-expiry wording';
END $$;

-- Scenario E: demo merchants are never managed, in either phase.
--
-- Not hypothetical, and not really about the sentinel. The first cut of migration
-- 20260730140000 was written on top of 20260701111223 — the migration whose
-- header documents the two-phase logic — but the function had since been
-- redefined by 20260729141000, which added `AND NOT is_demo` to BOTH loops.
-- Rebasing on the older body silently reverted that, and demo merchants started
-- getting grace periods and downgrades again. CI caught it via
-- demo_mode_test.sql scenario D1; a bare-schema harness could not, because there
-- was no previous definition to diverge from. Pinned here too, since this is the
-- file someone opens when they touch this function.
DO $$
DECLARE
  v_mid   UUID;
  v_saved TEXT;
  v_m     RECORD;
BEGIN
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
  UPDATE public.app_config SET value = (NOW() + INTERVAL '30 days')::TEXT
    WHERE key = 'node0_launch_period_ends_at';

  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status,
    tier, elite_trial_active, trial_ends_at, grace_period_ends_at, is_demo
  )
  VALUES (
    '__test_trial_sentinel_E', 'test.trial.e', '+254700009005', 'BBS Mall', 'active',
    'elite', TRUE, NOW() - INTERVAL '1 hour', NULL, TRUE
  )
  RETURNING id INTO v_mid;

  PERFORM public.handle_trial_expiry();

  SELECT * INTO v_m FROM public.merchants WHERE id = v_mid;
  ASSERT v_m.grace_period_ends_at IS NULL,
    'E: demo merchant was given a grace period — the AND NOT is_demo guard is gone';
  ASSERT v_m.tier = 'elite' AND v_m.elite_trial_active,
    'E: demo merchant was downgraded — the AND NOT is_demo guard is gone';
  ASSERT NOT EXISTS (SELECT 1 FROM public.agent_tasks WHERE merchant_id = v_mid),
    'E: agent conversion task created for a demo merchant';

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.tier_flags  WHERE merchant_id = v_mid;
  DELETE FROM public.merchants   WHERE id = v_mid;
  UPDATE public.app_config SET value = v_saved WHERE key = 'node0_launch_period_ends_at';

  RAISE NOTICE 'E ok: demo merchants untouched in both phases';
END $$;

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE merchant_name LIKE '__test_trial_sentinel_%'
  ), 'cleanup: test merchants left behind';
  ASSERT (SELECT value FROM public.app_config WHERE key = 'node0_launch_period_ends_at') IS NOT NULL,
    'cleanup: node0_launch_period_ends_at left missing';
  RAISE NOTICE 'trial_expiry_launch_sentinel_test: all scenarios passed';
END $$;
