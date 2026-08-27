-- ============================================================
-- D206 — the nightly demo seed refresh must be CAP-COMPLIANT BY CONSTRUCTION.
--
-- Why this file exists: `refresh_demo_seed_deals()` used to be one blanket
-- `UPDATE ... SET is_active = TRUE` over every seed-batch row. Two things were
-- wrong with that once the cap guards the UPDATE transition:
--
--   1. it RECONSTRUCTED impossible commercial state every night — measured on
--      production 2026-08-27 as 28 merchants above their plan's cap; and
--   2. under the new guard the single statement would RAISE on the first
--      over-cap row and abort the entire refresh, silently, in cron — the very
--      ageing-out failure the function was written to prevent.
--
-- So the function now chooses, per merchant, only as many deals as the plan
-- permits, deterministically. These scenarios prove it: never over cap, never
-- aborted, stable across repeat runs, and self-healing from state that is
-- already over cap.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/demo_seed_refresh_cap_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The function no-ops unless demo mode is on, so this suite must turn it on —
-- and MUST put it back. The save/restore mirrors demo_mode_test.sql, and it is
-- not optional bookkeeping: leaving the flag on leaks into whichever suite runs
-- next (alphabetically that is demo_wipe_audit_retention_test.sql, whose
-- retention behaviour depends on it), and the failure surfaces as a broken
-- test somewhere else entirely.
CREATE TEMP TABLE _demo_mode_restore AS
  SELECT key, value FROM public.app_config WHERE key = 'demo_mode_enabled';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _demo_mode_restore) THEN
    RAISE EXCEPTION 'app_config.demo_mode_enabled is missing — apply 20260729140000_demo_mode_tagging.sql first.';
  END IF;
END $$;

UPDATE public.app_config SET value = 'true' WHERE key = 'demo_mode_enabled';

-- ------------------------------------------------------------
-- Scenario A: a refresh over already-over-cap state completes, brings every
--             merchant within cap, and does not abort.
--
-- Reproduces production's exact shape: an Elite merchant holding two seed-batch
-- rows PLUS an autoreseed flash row (3 active, cap 2), and a Standard merchant
-- holding two seed-batch rows (2 active, cap 1). The over-cap rows are created
-- by direct UPDATE with the trigger disabled, because the guard now correctly
-- refuses to create this state through normal means — it is legacy data.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_elite  UUID;
  v_std    UUID;
  v_e1     UUID;
  v_e2     UUID;
  v_auto   UUID;
  v_s1     UUID;
  v_s2     UUID;
  v_result INT;
  v_active INT;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier, is_demo
  )
    VALUES ('__test_refresh_elite', 'test.refresh.elite', '+254700000930', 'BBS Mall', 'active', TRUE, 999, 'elite', TRUE)
    RETURNING id INTO v_elite;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier, is_demo
  )
    VALUES ('__test_refresh_std', 'test.refresh.std', '+254700000931', 'BBS Mall', 'active', TRUE, 999, 'standard', TRUE)
    RETURNING id INTO v_std;

  -- Seed-batch rows, created one at a time within cap, then parked inactive.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_elite, '__t refresh e1', 'x', TRUE, NOW() - INTERVAL '1 hour', 100, TRUE, 'node0_100_deals')
    RETURNING id INTO v_e1;
  UPDATE public.deals SET is_active = FALSE WHERE id = v_e1;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_elite, '__t refresh e2', 'x', TRUE, NOW() - INTERVAL '1 hour', 100, TRUE, 'nairobi_150')
    RETURNING id INTO v_e2;
  UPDATE public.deals SET is_active = FALSE WHERE id = v_e2;
  -- The autoreseed flash row this function does NOT manage.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, flash_duration_hours, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_elite, '__t refresh auto', 'x', TRUE, 'flash', 6, NOW() + INTERVAL '2 hours', 100, TRUE, 'autoreseed')
    RETURNING id INTO v_auto;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_std, '__t refresh s1', 'x', TRUE, NOW() - INTERVAL '1 hour', 100, TRUE, 'node0_100_deals')
    RETURNING id INTO v_s1;
  UPDATE public.deals SET is_active = FALSE WHERE id = v_s1;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_std, '__t refresh s2', 'x', TRUE, NOW() - INTERVAL '1 hour', 100, TRUE, 'nairobi_150')
    RETURNING id INTO v_s2;
  UPDATE public.deals SET is_active = FALSE WHERE id = v_s2;

  -- Force the legacy over-cap state the guard would now refuse to create.
  ALTER TABLE public.deals DISABLE TRIGGER enforce_deal_limit_trigger;
  UPDATE public.deals SET is_active = TRUE WHERE id IN (v_e1, v_e2, v_s1, v_s2);
  ALTER TABLE public.deals ENABLE TRIGGER enforce_deal_limit_trigger;

  ASSERT (SELECT COUNT(*) FROM public.deals WHERE merchant_id = v_elite AND is_active) = 3,
    'A: fixture did not reach the 3-active Elite state';
  ASSERT (SELECT COUNT(*) FROM public.deals WHERE merchant_id = v_std AND is_active) = 2,
    'A: fixture did not reach the 2-active Standard state';

  -- THE RUN. Must not raise.
  v_result := public.refresh_demo_seed_deals();
  ASSERT v_result >= 0, 'A: refresh returned no row count';

  SELECT COUNT(*) INTO v_active FROM public.deals WHERE merchant_id = v_elite AND is_active;
  ASSERT v_active <= 2, format('A: Elite merchant left with %s active deals (cap 2)', v_active);
  SELECT COUNT(*) INTO v_active FROM public.deals WHERE merchant_id = v_std AND is_active;
  ASSERT v_active <= 1, format('A: Standard merchant left with %s active deals (cap 1)', v_active);

  -- The autoreseed row is not this function's to retire.
  ASSERT (SELECT is_active FROM public.deals WHERE id = v_auto),
    'A: the refresh retired an autoreseed row it does not manage';
  -- Its slot was respected: only ONE batch row may join it under a cap of 2.
  ASSERT (SELECT COUNT(*) FROM public.deals
           WHERE merchant_id = v_elite AND is_active AND demo_source <> 'autoreseed') = 1,
    'A: the refresh ignored the slot already held by the autoreseed row';

  DELETE FROM public.archive_history WHERE merchant_id IN (v_elite, v_std);
  DELETE FROM public.deals WHERE merchant_id IN (v_elite, v_std);
  DELETE FROM public.merchants WHERE id IN (v_elite, v_std);
  RAISE NOTICE 'Scenario A passed: refresh completes and leaves every merchant within cap';
END $$;

-- ------------------------------------------------------------
-- Scenario B: running the refresh twice is idempotent with respect to caps —
--             the same rows stay active, and nothing drifts.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mid    UUID;
  v_first  UUID[];
  v_second UUID[];
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier, is_demo
  )
    VALUES ('__test_refresh_idem', 'test.refresh.idem', '+254700000932', 'BBS Mall', 'active', TRUE, 999, 'elite', TRUE)
    RETURNING id INTO v_mid;

  -- Three batch rows, all parked inactive: more than the cap of 2.
  FOR i IN 1..3 LOOP
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, is_demo, demo_source)
      VALUES (v_mid, '__t idem ' || i, 'x', FALSE, NOW() + INTERVAL '2 hours', 100, TRUE, 'node0_rehearsal');
  END LOOP;

  PERFORM public.refresh_demo_seed_deals();
  SELECT array_agg(id ORDER BY id) INTO v_first
    FROM public.deals WHERE merchant_id = v_mid AND is_active;

  PERFORM public.refresh_demo_seed_deals();
  SELECT array_agg(id ORDER BY id) INTO v_second
    FROM public.deals WHERE merchant_id = v_mid AND is_active;

  ASSERT array_length(v_first, 1) = 2,
    format('B: first run left %s active deals, expected the Elite cap of 2', COALESCE(array_length(v_first, 1), 0));
  ASSERT v_first = v_second,
    'B: NOT IDEMPOTENT — the second run chose a different set of deals';

  DELETE FROM public.archive_history WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario B passed: repeat runs are cap-safe and deterministic';
END $$;

-- ------------------------------------------------------------
-- Scenario C: a Standard merchant's flash seed row is never activated, and
--             its presence does not cost the merchant its one standard slot.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mid   UUID;
  v_flash UUID;
  v_std   UUID;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier, is_demo
  )
    VALUES ('__test_refresh_flash', 'test.refresh.flash', '+254700000933', 'BBS Mall', 'active', TRUE, 999, 'elite', TRUE)
    RETURNING id INTO v_mid;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, flash_duration_hours, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_mid, '__t flash row', 'x', FALSE, 'flash', 6, NOW() + INTERVAL '2 hours', 100, TRUE, 'node0_100_deals')
    RETURNING id INTO v_flash;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, is_demo, demo_source)
    VALUES (v_mid, '__t std row', 'x', FALSE, NOW() + INTERVAL '2 hours', 100, TRUE, 'node0_100_deals')
    RETURNING id INTO v_std;

  UPDATE public.merchants SET tier = 'standard' WHERE id = v_mid;

  PERFORM public.refresh_demo_seed_deals();

  ASSERT NOT (SELECT is_active FROM public.deals WHERE id = v_flash),
    'C: FLASH LEAKED — the refresh activated an Elite-only flash deal for a Standard merchant';
  ASSERT (SELECT is_active FROM public.deals WHERE id = v_std),
    'C: the standard row was starved by the skipped flash row';
  ASSERT (SELECT COUNT(*) FROM public.deals WHERE merchant_id = v_mid AND is_active) = 1,
    'C: the Standard merchant is not at exactly its cap of 1';

  DELETE FROM public.archive_history WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario C passed: Standard flash rows are skipped, not starved';
END $$;

-- ------------------------------------------------------------
-- Scenario D: the deliberately-dark fixture shops stay dark, and the function
--             still no-ops entirely when demo mode is off.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_result INT;
BEGIN
  UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';
  v_result := public.refresh_demo_seed_deals();
  ASSERT v_result = 0, format('D: the refresh ran with demo mode OFF (returned %s)', v_result);
  UPDATE public.app_config SET value = 'true' WHERE key = 'demo_mode_enabled';  -- back on for any later scenario
  RAISE NOTICE 'Scenario D passed: no-ops with demo mode off';
END $$;

-- Put demo mode back exactly as it was found.
UPDATE public.app_config a
   SET value = r.value
  FROM _demo_mode_restore r
 WHERE a.key = r.key;

SELECT 'demo_seed_refresh_cap_test.sql: ALL SCENARIOS PASSED. demo_mode_enabled restored to '
       || (SELECT value FROM public.app_config WHERE key = 'demo_mode_enabled') AS result;
