-- ============================================================
-- Test: the frozen commercial values in app_config, and the accuracy of the
--       operator-facing notes attached to them.
--       (truth audit 2026-07-30 — docs/skills/truth-audit-2026-07-30.md)
--
-- Why this exists: the audit found the *values* correct everywhere but the
-- `notes` on success_fee_kes stale in a way that mattered. They said the Elite
-- price review was "Oct 2026" (superseded by the founder ruling of 2026-07-20,
-- which moved it to Feb 2027) and pointed at PROJECT_RULES.md / DECISIONS_LOG.md,
-- neither of which exists in this repo. `notes` is what an operator reads in the
-- Supabase dashboard when checking a fee before touching money, so a wrong date
-- and a dangling doc pointer are not cosmetic.
--
-- Proves:
--   A. The frozen amounts are present and exact.
--   B. success_fee_kes.notes states the fee applies to ALL plans, cites files
--      that exist, and does NOT carry the superseded Oct 2026 review date.
--   C. No app_config note references a repo file that does not exist.
--   D. enforce_deal_success_fee still forces the canonical fee on write, so the
--      value asserted in A is the value merchants are actually charged.
--
-- Read-only except for the throwaway rows in D, which are cleaned up.
--   psql "$DATABASE_URL" -f supabase/tests/frozen_commercial_config_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: the frozen amounts.
DO $$
DECLARE
  v_fee     numeric;
  v_boost   numeric;
  v_credit  numeric;
  v_cap     int;
  v_node    text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT value::numeric INTO v_fee    FROM public.app_config WHERE key = 'success_fee_kes';
  SELECT value::numeric INTO v_boost  FROM public.app_config WHERE key = 'boost_fee_kes';
  SELECT value::numeric INTO v_credit FROM public.app_config WHERE key = 'node0_opening_credit_kes';
  SELECT value::int     INTO v_cap    FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap';
  SELECT value          INTO v_node   FROM public.app_config WHERE key = 'node0_launch_node';

  -- Each of these is frozen and changes only via a new docs/maanta-decisions-log.md
  -- entry. If one of these assertions fails, the fix is a decisions-log entry
  -- plus an update here — not a quiet edit to the config row.
  ASSERT v_fee    = 30,        format('A: success_fee_kes must be 30 (frozen), got %s', v_fee);
  ASSERT v_boost  = 500,       format('A: boost_fee_kes must be 500 (frozen), got %s', v_boost);
  ASSERT v_credit = 300,       format('A: node0_opening_credit_kes must be 300 (frozen), got %s', v_credit);
  ASSERT v_cap    = 100,       format('A: node0_opening_credit_merchant_cap must be 100 (frozen), got %s', v_cap);
  ASSERT v_node   = 'BBS Mall', format('A: node0_launch_node must be BBS Mall (Node 0), got %s', v_node);

  RAISE NOTICE 'Scenario A passed: frozen commercial amounts are exact (fee 30, boost 500, credit 300 x100, BBS Mall)';
END $$;

-- Scenario B: the success-fee notes are accurate and cite real files.
DO $$
DECLARE v_notes text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT notes INTO v_notes FROM public.app_config WHERE key = 'success_fee_kes';

  ASSERT v_notes IS NOT NULL AND length(v_notes) > 0,
    'B: success_fee_kes has no notes — operators read this row when verifying a fee';

  -- The fee applies on Standard as well as Elite. An operator must not be able
  -- to read this row and conclude Standard is free.
  ASSERT v_notes ILIKE '%ALL plans%',
    'B: notes must state the fee is charged on ALL plans (Standard and Elite)';

  -- Superseded by the founder ruling of 2026-07-20.
  ASSERT v_notes NOT ILIKE '%Oct 2026%' AND v_notes NOT ILIKE '%October 2026%',
    'B: notes still carry the superseded Oct 2026 Elite price-review date — it is Feb 2027';

  -- Must point at documents that exist.
  ASSERT v_notes NOT LIKE '%PROJECT_RULES.md%',
    'B: notes reference PROJECT_RULES.md, which does not exist — use CLAUDE.md';
  ASSERT v_notes NOT LIKE '%DECISIONS_LOG.md%' OR v_notes LIKE '%docs/maanta-decisions-log.md%',
    'B: notes reference DECISIONS_LOG.md, which does not exist — use docs/maanta-decisions-log.md';

  RAISE NOTICE 'Scenario B passed: success_fee_kes notes are accurate and cite existing docs';
END $$;

-- Scenario C: no config note points at a repo file that does not exist.
DO $$
DECLARE v_bad text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- These two filenames have never existed in this repository; they were carried
  -- from an earlier project layout. Catching them across every key stops the
  -- same dangling pointer being pasted into the next config row.
  SELECT string_agg(key, ', ') INTO v_bad
  FROM public.app_config
  WHERE notes LIKE '%PROJECT_RULES.md%'
     OR (notes LIKE '%DECISIONS_LOG.md%' AND notes NOT LIKE '%docs/maanta-decisions-log.md%');

  ASSERT v_bad IS NULL,
    format('C: app_config notes reference non-existent repo files on key(s): %s', v_bad);

  RAISE NOTICE 'Scenario C passed: no app_config note cites a non-existent repo file';
END $$;

-- Scenario D: the asserted fee is the fee actually written onto deals.
-- Guards against A passing while a merchant-supplied success_fee sticks.
DO $$
DECLARE
  v_uid uuid; v_mid uuid; v_did uuid; v_written numeric; v_sfx text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_sfx := left(replace(gen_random_uuid()::text, '-', ''), 10);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fc_'||v_sfx, 'test.fc.'||v_sfx, '+254'||left(v_sfx,9), 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;

  -- Deliberately try to write a tampered fee of 1 KES.
  INSERT INTO public.deals (merchant_id, title, image_url, success_fee)
    VALUES (v_mid, '__fc', 'x', 1)
    RETURNING id INTO v_did;

  SELECT success_fee INTO v_written FROM public.deals WHERE id = v_did;
  ASSERT v_written = 30,
    format('D: enforce_deal_success_fee did not force the canonical fee — deal stored %s, expected 30', v_written);

  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;

  RAISE NOTICE 'Scenario D passed: a tampered success_fee of 1 is forced back to the canonical 30';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL frozen commercial-config scenarios passed.'; END $$;
