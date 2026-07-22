-- ============================================================
-- Test: Guardian v1 thresholds are config-driven (docs/maanta-guardian-v1.md §2)
--
-- Proves:
--   A. With the seeded app_config('guardian_thresholds') row, guardian_evaluate
--      reproduces the shipped default outcomes.
--   B. Editing the config (tightening geofence) changes the outcome live —
--      no redeploy — via the SAME redemption inputs.
--   C. A MISSING config row falls back to the hardcoded defaults.
--   D. A MALFORMED config row falls back to defaults and never throws (Guardian
--      must not fail open to "clear everything").
--
-- Geofence is used throughout because it depends only on distance_from_shop —
-- no timing — so the suite is deterministic. Every scenario restores the
-- config, and the file ends by re-asserting the default row, so the later
-- guardian_v1_test.sql (which runs after this one) sees stock thresholds.
--   psql "$DATABASE_URL" -f supabase/tests/guardian_thresholds_config_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Helper: build a throwaway redemption at a given distance, run guardian_evaluate,
-- return the overall recommendation, and clean up (guardian_events cascade on the
-- redemption delete). guardian_evaluate touches no money or fraud_events.
CREATE OR REPLACE FUNCTION public.__test_guardian_reco(p_distance numeric)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid; v_mid uuid; v_did uuid; v_rid uuid; v_reco text; v_sfx text;
BEGIN
  v_sfx := left(replace(gen_random_uuid()::text, '-', ''), 10);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_gt_'||v_sfx, 'test.gt.'||v_sfx, '+254'||left(v_sfx,9), 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__gt', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, distance_from_shop)
    VALUES (v_did, v_mid, v_uid, left(v_sfx,6), 'pending', NOW() + INTERVAL '1 hour', 30, p_distance)
    RETURNING id INTO v_rid;

  SELECT (public.guardian_evaluate(v_rid)) ->> 'recommendation' INTO v_reco;

  DELETE FROM public.redemptions WHERE id = v_rid;   -- cascades guardian_events
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RETURN v_reco;
END $$;

-- Scenario A: seeded config reproduces the shipped defaults.
DO $$
DECLARE v_cfg int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_cfg FROM public.app_config WHERE key = 'guardian_thresholds';
  ASSERT v_cfg = 1, 'A: guardian_thresholds config row was not seeded by the migration';

  ASSERT public.__test_guardian_reco(100)  = 'clear',      'A: 100m should be clear (<250 warn)';
  ASSERT public.__test_guardian_reco(300)  = 'flag',       'A: 300m should be flag (>250 warn, <2000 hard)';
  ASSERT public.__test_guardian_reco(3000) = 'hard_block',  'A: 3000m should be hard_block (>2000)';
  RAISE NOTICE 'Scenario A passed: seeded config reproduces default geofence outcomes';
END $$;

-- Scenario B: tightening geofence via config changes the outcome live.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- Ops edit: warn at 100m, hard at 250m (merge just the geofence key).
  UPDATE public.app_config
    SET value = (value::jsonb || '{"geofence":{"warn_m":100,"hard_m":250}}'::jsonb)::text
    WHERE key = 'guardian_thresholds';

  ASSERT public.__test_guardian_reco(50)  = 'clear',      'B: 50m should be clear (<100 warn)';
  ASSERT public.__test_guardian_reco(150) = 'flag',       'B: 150m should now flag (>100 warn, <250 hard)';
  ASSERT public.__test_guardian_reco(300) = 'hard_block', 'B: 300m should now hard_block (>250) — was flag under defaults';

  -- Restore the geofence defaults.
  UPDATE public.app_config
    SET value = (value::jsonb || '{"geofence":{"warn_m":250,"hard_m":2000}}'::jsonb)::text
    WHERE key = 'guardian_thresholds';
  ASSERT public.__test_guardian_reco(300) = 'flag', 'B: restore failed — 300m should be flag again';
  RAISE NOTICE 'Scenario B passed: live geofence retune flips 300m flag→hard_block and back';
END $$;

-- Scenario C: a MISSING config row falls back to the hardcoded defaults.
DO $$
DECLARE v_saved text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'guardian_thresholds';
  DELETE FROM public.app_config WHERE key = 'guardian_thresholds';

  ASSERT public.__test_guardian_reco(100)  = 'clear',      'C: fallback 100m should be clear';
  ASSERT public.__test_guardian_reco(300)  = 'flag',       'C: fallback 300m should be flag';
  ASSERT public.__test_guardian_reco(3000) = 'hard_block', 'C: fallback 3000m should be hard_block';

  INSERT INTO public.app_config (key, value, notes)
    VALUES ('guardian_thresholds', v_saved, 'restored by guardian_thresholds_config_test');
  RAISE NOTICE 'Scenario C passed: missing config row falls back to shipped defaults';
END $$;

-- Scenario D: a MALFORMED config row falls back to defaults and never throws.
DO $$
DECLARE v_saved text; v_reco text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'guardian_thresholds';
  UPDATE public.app_config SET value = 'this is not json' WHERE key = 'guardian_thresholds';

  -- Must NOT raise, and must fall back to defaults (never "clear everything").
  v_reco := public.__test_guardian_reco(3000);
  ASSERT v_reco = 'hard_block', format('D: malformed config must fall back — 3000m got %s', v_reco);
  ASSERT public.__test_guardian_reco(100) = 'clear', 'D: malformed config fallback — 100m should be clear';

  UPDATE public.app_config SET value = v_saved WHERE key = 'guardian_thresholds';
  RAISE NOTICE 'Scenario D passed: malformed config falls back to defaults, Guardian never fails open';
END $$;

-- Final safety: guarantee the default row is present and stock, so the
-- guardian_v1_test.sql that runs after this file sees default thresholds.
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'guardian_thresholds',
  '{"velocity_shopper":{"window_minutes":10,"warn":5,"hard":8},"velocity_merchant":{"window_minutes":5,"warn":20},"velocity_deal":{"window_minutes":60,"warn":5,"soft":6},"geofence":{"warn_m":250,"hard_m":2000},"collusion":{"window_minutes":30,"warn_total":5,"soft_total":8,"max_distinct":2}}',
  'Guardian v1 thresholds (default, reset by test)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

DROP FUNCTION public.__test_guardian_reco(numeric);

DO $$ BEGIN RAISE NOTICE 'ALL Guardian threshold-config scenarios passed.'; END $$;
