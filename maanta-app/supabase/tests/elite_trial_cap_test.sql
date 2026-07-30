-- ============================================================
-- Test: the frozen launch offer's cap — "First 100 BBS Mall merchants get a
--       30-day free Elite trial" (decision D2, migration 20260730130000).
--
-- Proves:
--   A. Config + column + trigger are in place and the cap defaults to 100.
--   B. Under the cap, activate_merchant grants the trial and stamps
--      elite_trial_granted_at.
--   C. AT the cap, activate_merchant still ACTIVATES the merchant but grants no
--      trial — a spent promo must never block a merchant going live.
--   D. A direct UPDATE (the /api/admin/plans grant-trial path) RAISES
--      ELITE_TRIAL_CAP_REACHED instead of silently exceeding the cap.
--   E. A slot is NOT recycled by downgrading: clearing elite_trial_active leaves
--      elite_trial_granted_at set, so the merchant still counts.
--   F. Re-granting to a merchant who already holds a slot does NOT consume a
--      second one, and does not move the original granted_at.
--   G. Off-node and demo merchants are outside the offer and not blocked by it.
--
-- The cap is temporarily lowered rather than creating 100 merchants; the value is
-- restored at the end, and every merchant created here is deleted.
--   psql "$DATABASE_URL" -f supabase/tests/elite_trial_cap_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Record the cap as found, so the closing check can prove this file left it alone
-- without hardcoding a value (which would rewrite an intentionally different
-- deployed cap and make the assertion tautological).
SELECT set_config(
  'maanta.test_cap_at_start',
  (SELECT value FROM public.app_config WHERE key = 'elite_trial_merchant_cap'),
  false
);

-- Helper: a pending merchant at a given node, returning its id.
CREATE OR REPLACE FUNCTION public.__test_etc_merchant(
  p_node text DEFAULT 'BBS Mall',
  p_is_demo boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE v_id uuid; v_sfx text;
BEGIN
  v_sfx := left(replace(gen_random_uuid()::text, '-', ''), 10);
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, account_balance, is_demo
  )
  VALUES (
    '__test_etc_'||v_sfx, 'test.etc.'||v_sfx, '+254'||left(v_sfx,9),
    p_node, 'pending', 0, p_is_demo
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Helper: an admin user id, since activate_merchant asserts caller identity
-- (bypassed under service_role, but the arg still has to resolve).
CREATE OR REPLACE FUNCTION public.__test_etc_admin()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.users (role) VALUES ('admin') RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Scenario A: the pieces exist.
DO $$
DECLARE v_cap int; v_col int; v_trg int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT value::int INTO v_cap FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  ASSERT v_cap = 100, format('A: elite_trial_merchant_cap must default to 100 (frozen), got %s', v_cap);

  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='merchants' AND column_name='elite_trial_granted_at';
  ASSERT v_col = 1, 'A: merchants.elite_trial_granted_at is missing';

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname = 'trg_enforce_elite_trial_cap' AND NOT tgisinternal;
  ASSERT v_trg = 1, 'A: trg_enforce_elite_trial_cap is not installed';

  RAISE NOTICE 'Scenario A passed: cap config, durable column and trigger all present';
END $$;

-- Scenario B: under the cap, the trial is granted and the slot is stamped.
DO $$
DECLARE v_m uuid; v_admin uuid; v_active boolean; v_granted timestamptz; v_tier text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_admin := public.__test_etc_admin();
  v_m := public.__test_etc_merchant();

  PERFORM public.activate_merchant(v_m, v_admin, true);

  SELECT elite_trial_active, elite_trial_granted_at, tier
    INTO v_active, v_granted, v_tier
    FROM public.merchants WHERE id = v_m;

  ASSERT v_active,             'B: trial should be active when under the cap';
  ASSERT v_tier = 'elite',     format('B: tier should be elite, got %s', v_tier);
  ASSERT v_granted IS NOT NULL,'B: elite_trial_granted_at must be stamped by the trigger';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_admin;
  RAISE NOTICE 'Scenario B passed: under the cap the trial is granted and the slot stamped';
END $$;

-- Scenario C: at the cap, the merchant is still ACTIVATED, just without a trial.
DO $$
DECLARE v_m uuid; v_admin uuid; v_status text; v_active boolean; v_tier text; v_saved text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'elite_trial_merchant_cap';

  -- Exhaust the offer without creating 100 rows.
  UPDATE public.app_config SET value = '0' WHERE key = 'elite_trial_merchant_cap';

  v_admin := public.__test_etc_admin();
  v_m := public.__test_etc_merchant();

  PERFORM public.activate_merchant(v_m, v_admin, true);

  SELECT status, elite_trial_active, tier INTO v_status, v_active, v_tier
    FROM public.merchants WHERE id = v_m;

  -- The whole point: a spent promo must not stop a merchant going live.
  ASSERT v_status = 'active',   format('C: merchant must still be activated, got status %s', v_status);
  ASSERT NOT v_active,          'C: no trial may be granted once the offer is exhausted';
  ASSERT v_tier = 'standard',   format('C: merchant should stay on Standard, got tier %s', v_tier);

  UPDATE public.app_config SET value = v_saved WHERE key = 'elite_trial_merchant_cap';
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_admin;
  RAISE NOTICE 'Scenario C passed: offer exhausted → merchant activated on Standard, no trial, no error';
END $$;

-- Scenario D: a direct UPDATE cannot exceed the cap (the old bypass path).
DO $$
DECLARE v_m uuid; v_saved text; v_raised boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  UPDATE public.app_config SET value = '0' WHERE key = 'elite_trial_merchant_cap';

  v_m := public.__test_etc_merchant();

  BEGIN
    -- Exactly what /api/admin/plans/[id] `grant-trial` does.
    UPDATE public.merchants
       SET tier = 'elite', elite_trial_active = TRUE, trial_ends_at = NOW() + INTERVAL '30 days'
     WHERE id = v_m;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%ELITE_TRIAL_CAP_REACHED%',
      format('D: expected ELITE_TRIAL_CAP_REACHED, got %s', SQLERRM);
  END;

  ASSERT v_raised, 'D: a direct trial UPDATE past the cap must raise, not silently succeed';

  UPDATE public.app_config SET value = v_saved WHERE key = 'elite_trial_merchant_cap';
  DELETE FROM public.merchants WHERE id = v_m;
  RAISE NOTICE 'Scenario D passed: the admin-plans direct-UPDATE path is capped too';
END $$;

-- Scenario E: downgrading does NOT return the slot to the pool.
DO $$
DECLARE v_m uuid; v_admin uuid; v_granted timestamptz; v_before int; v_after int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_admin := public.__test_etc_admin();
  v_m := public.__test_etc_merchant();

  SELECT granted INTO v_before FROM public.elite_trial_cap_status();
  PERFORM public.activate_merchant(v_m, v_admin, true);

  -- The downgrade action from /api/admin/plans/[id].
  UPDATE public.merchants
     SET tier = 'standard', elite_trial_active = FALSE, trial_ends_at = NULL,
         grace_period_ends_at = NULL
   WHERE id = v_m;

  SELECT elite_trial_granted_at INTO v_granted FROM public.merchants WHERE id = v_m;
  SELECT granted INTO v_after FROM public.elite_trial_cap_status();

  ASSERT v_granted IS NOT NULL,
    'E: downgrade must NOT clear elite_trial_granted_at — the slot is spent for good';
  ASSERT v_after = v_before + 1,
    format('E: the merchant must still count against the cap after downgrade (%s → %s)', v_before, v_after);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_admin;
  RAISE NOTICE 'Scenario E passed: a downgraded merchant still occupies its launch-offer slot';
END $$;

-- Scenario F: re-granting to the same merchant reuses its slot.
DO $$
DECLARE v_m uuid; v_admin uuid; v_first timestamptz; v_second timestamptz;
        v_before int; v_after int; v_saved text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_admin := public.__test_etc_admin();
  v_m := public.__test_etc_merchant();

  PERFORM public.activate_merchant(v_m, v_admin, true);
  SELECT elite_trial_granted_at INTO v_first FROM public.merchants WHERE id = v_m;

  UPDATE public.merchants SET elite_trial_active = FALSE WHERE id = v_m;
  SELECT granted INTO v_before FROM public.elite_trial_cap_status();

  -- Even with the offer fully closed, a merchant holding a slot may restart.
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  UPDATE public.app_config SET value = '0' WHERE key = 'elite_trial_merchant_cap';

  UPDATE public.merchants
     SET elite_trial_active = TRUE, trial_ends_at = NOW() + INTERVAL '30 days'
   WHERE id = v_m;

  SELECT elite_trial_granted_at INTO v_second FROM public.merchants WHERE id = v_m;
  UPDATE public.app_config SET value = v_saved WHERE key = 'elite_trial_merchant_cap';
  SELECT granted INTO v_after FROM public.elite_trial_cap_status();

  ASSERT v_second = v_first,
    'F: re-granting must not move elite_trial_granted_at — it records when the slot was consumed';
  ASSERT v_after = v_before,
    format('F: a re-grant must not consume a second slot (%s → %s)', v_before, v_after);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_admin;
  RAISE NOTICE 'Scenario F passed: a re-grant reuses the merchant''s existing slot';
END $$;

-- Scenario G: off-node and demo merchants are outside the capped offer.
DO $$
DECLARE v_off uuid; v_demo uuid; v_saved text; v_before int; v_after int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  SELECT granted INTO v_before FROM public.elite_trial_cap_status();
  UPDATE public.app_config SET value = '0' WHERE key = 'elite_trial_merchant_cap';

  -- The cap is scoped to the launch node by the frozen rule, so a merchant at
  -- another node must not be blocked by an exhausted BBS-Mall offer.
  v_off := public.__test_etc_merchant('CBD Galleria', false);
  UPDATE public.merchants
     SET tier = 'elite', elite_trial_active = TRUE, trial_ends_at = NOW() + INTERVAL '30 days'
   WHERE id = v_off;
  ASSERT (SELECT elite_trial_active FROM public.merchants WHERE id = v_off),
    'G: an off-node merchant must not be blocked by the launch-node cap';

  -- Rehearsal rows are not launch merchants.
  v_demo := public.__test_etc_merchant('BBS Mall', true);
  UPDATE public.merchants
     SET tier = 'elite', elite_trial_active = TRUE, trial_ends_at = NOW() + INTERVAL '30 days'
   WHERE id = v_demo;
  ASSERT (SELECT elite_trial_active FROM public.merchants WHERE id = v_demo),
    'G: a demo merchant must not be blocked by the launch-offer cap';

  -- Delta, not an absolute. `granted = 0` only holds on a pristine database: the
  -- migration's backfill stamps every merchant that already had a trial, so a
  -- seeded or staging database starts non-zero and an absolute assertion would
  -- report a false failure there. What this scenario actually claims is that
  -- these two merchants consumed NOTHING.
  SELECT granted INTO v_after FROM public.elite_trial_cap_status();
  ASSERT v_after = v_before,
    format('G: neither an off-node nor a demo merchant may consume a real launch-offer slot (%s → %s)', v_before, v_after);

  UPDATE public.app_config SET value = v_saved WHERE key = 'elite_trial_merchant_cap';
  DELETE FROM public.merchants WHERE id IN (v_off, v_demo);
  RAISE NOTICE 'Scenario G passed: off-node and demo merchants sit outside the capped offer';
END $$;

-- Scenario H: an INSERT carrying a trial is gated and stamped like an UPDATE.
-- This is the path supabase/seed/node0_rehearsal_seed.sql uses, and before
-- 2026-07-30 it consumed a slot invisibly: no stamp, so cap_status under-counted
-- permanently and the offer could overshoot 100.
DO $$
DECLARE
  v_before int; v_after int; v_granted timestamptz; v_saved text;
  v_id uuid; v_sfx text; v_raised boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT granted INTO v_before FROM public.elite_trial_cap_status();

  -- H1: under the cap, a direct INSERT with a trial is allowed AND stamped.
  v_sfx := left(replace(gen_random_uuid()::text, '-', ''), 10);
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status,
    tier, elite_trial_active, trial_ends_at
  )
  VALUES (
    '__test_etc_ins_'||v_sfx, 'test.etc.i.'||v_sfx, '+254'||left(v_sfx,9),
    'BBS Mall', 'active', 'elite', TRUE, NOW() + INTERVAL '30 days'
  )
  RETURNING id, elite_trial_granted_at INTO v_id, v_granted;

  ASSERT v_granted IS NOT NULL,
    'H1: an INSERT that grants a trial must be stamped, or the slot is consumed invisibly';

  SELECT granted INTO v_after FROM public.elite_trial_cap_status();
  ASSERT v_after = v_before + 1,
    format('H1: an inserted trial must consume exactly one slot (%s → %s)', v_before, v_after);

  DELETE FROM public.merchants WHERE id = v_id;

  -- H2: at the cap, a direct INSERT with a trial is refused.
  SELECT value INTO v_saved FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  UPDATE public.app_config SET value = '0' WHERE key = 'elite_trial_merchant_cap';

  v_sfx := left(replace(gen_random_uuid()::text, '-', ''), 10);
  BEGIN
    INSERT INTO public.merchants (
      merchant_name, what3words_address, phone, node, status,
      tier, elite_trial_active, trial_ends_at
    )
    VALUES (
      '__test_etc_ins2_'||v_sfx, 'test.etc.j.'||v_sfx, '+254'||left(v_sfx,9),
      'BBS Mall', 'active', 'elite', TRUE, NOW() + INTERVAL '30 days'
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%ELITE_TRIAL_CAP_REACHED%',
      format('H2: expected ELITE_TRIAL_CAP_REACHED on INSERT, got %s', SQLERRM);
  END;

  ASSERT v_raised, 'H2: an INSERT granting a trial past the cap must raise, not slip through';

  UPDATE public.app_config SET value = v_saved WHERE key = 'elite_trial_merchant_cap';
  RAISE NOTICE 'Scenario H passed: the INSERT path is stamped under the cap and refused at it';
END $$;

DROP FUNCTION public.__test_etc_merchant(text, boolean);
DROP FUNCTION public.__test_etc_admin();

-- Closing check: the cap is exactly what it was when this file started.
--
-- Deliberately NOT `UPDATE ... SET value = '100'`. Forcing 100 here would rewrite
-- an intentionally different deployed cap and make this assertion tautological —
-- it would pass because we just wrote the value we then check.
--
-- No unconditional restore is needed either: psql runs each statement in its own
-- transaction, so a DO block whose assertion fails has all of its own changes
-- rolled back, including its cap mutation. Verified by experiment, not assumed —
-- a scenario cannot leak `elite_trial_merchant_cap = 0` into a later suite.
DO $$
DECLARE v_cap text;
BEGIN
  SELECT value INTO v_cap FROM public.app_config WHERE key = 'elite_trial_merchant_cap';
  ASSERT v_cap = current_setting('maanta.test_cap_at_start', true),
    format('cleanup: cap leaked — started at %s, ended at %s',
           current_setting('maanta.test_cap_at_start', true), v_cap);
  RAISE NOTICE 'ALL Elite trial launch-offer cap scenarios passed (cap intact at %).', v_cap;
END $$;
