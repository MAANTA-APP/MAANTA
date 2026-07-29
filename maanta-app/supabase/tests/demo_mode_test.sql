-- ============================================================
-- Test: demo mode — tagging, isolation, reseed, wipe
--   (migrations 20260729140000 / 20260729141000 / 20260729142000)
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

-- Preserve the operator's demo-mode setting: these tests flip it, and leaving
-- it on would silently expose synthetic data in whatever environment ran them.
CREATE TEMP TABLE _demo_mode_restore AS
  SELECT value FROM public.app_config WHERE key = 'demo_mode_enabled';

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

  FOR i IN 1..1 LOOP
    UPDATE public.app_config SET value = '1'    WHERE key = 'demo_mode_enabled';
    ASSERT NOT public.is_demo_mode(), 'A3: "1" must NOT enable demo mode';
    UPDATE public.app_config SET value = 'yes'  WHERE key = 'demo_mode_enabled';
    ASSERT NOT public.is_demo_mode(), 'A4: "yes" must NOT enable demo mode';
    UPDATE public.app_config SET value = ''     WHERE key = 'demo_mode_enabled';
    ASSERT NOT public.is_demo_mode(), 'A5: empty must NOT enable demo mode';
  END LOOP;

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
  INSERT INTO public.merchants (id, merchant_name, phone, status, is_visible, is_demo)
  VALUES (v_real_merchant, 'ZZ Test Real Shop', '+254700099001', 'active', TRUE, FALSE),
         (v_demo_merchant, 'ZZ Test Demo Shop', '+254700099002', 'active', TRUE, TRUE);

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

  INSERT INTO public.merchants (id, merchant_name, phone, status, is_visible, is_demo)
  VALUES (v_demo_merchant, 'ZZ Test Demo Shop 3', '+254700099003', 'active', TRUE, TRUE);
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
    (id, merchant_name, phone, status, tier, elite_trial_active, trial_ends_at, grace_period_ends_at, is_demo)
  VALUES
    (v_real, 'ZZ Trial Real', '+254700099010', 'active', 'elite', TRUE, NOW() - INTERVAL '2 days', NULL, FALSE),
    (v_demo, 'ZZ Trial Demo', '+254700099011', 'active', 'elite', TRUE, NOW() - INTERVAL '2 days', NULL, TRUE);

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

-- Scenario F: wipe_demo_data() is dry-run by default and spares real rows.
DO $$
DECLARE
  v_real UUID := '9d9d9d9d-0000-4000-a000-000000000020';
  v_demo UUID := '9d9d9d9d-0000-4000-a000-000000000021';
  v_n INT;
BEGIN
  INSERT INTO public.merchants (id, merchant_name, phone, status, is_demo)
  VALUES (v_real, 'ZZ Wipe Real', '+254700099020', 'active', FALSE),
         (v_demo, 'ZZ Wipe Demo', '+254700099021', 'active', TRUE);

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

-- Restore the operator's original demo-mode setting.
UPDATE public.app_config a
   SET value = r.value
  FROM _demo_mode_restore r
 WHERE a.key = 'demo_mode_enabled';

SELECT 'demo_mode_test: all scenarios passed. demo_mode_enabled restored to '
       || (SELECT value FROM public.app_config WHERE key = 'demo_mode_enabled') AS result;
