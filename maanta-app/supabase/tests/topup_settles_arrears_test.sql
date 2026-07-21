-- ============================================================
-- Test: top-ups settle arrears FIRST, then credit the remainder, and the
-- ledger reconciles in both directions.
--   (migration 20260721120000_topup_settles_arrears_first.sql;
--    ENGINEERING_NOTES §3, §8.4; boards M6 arrears / M7 top-up)
--
-- record_merchant_ledger_entry is service_role-only; reproduce that context.
--   psql "$DATABASE_URL" -f supabase/tests/topup_settles_arrears_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: arrears fully cleared, remainder credited (board M7 canonical).
DO $$
DECLARE
  v_mid UUID;
  v_applied BOOLEAN;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_topup RECORD;
  v_settle RECORD;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, outstanding_arrears)
    VALUES ('__test_settle_A', 'test.settle.a', '+254700000301', 'BBS Mall', 'active', 0, 340)
    RETURNING id INTO v_mid;

  SELECT applied, new_balance, new_arrears
    INTO v_applied, v_new_balance, v_new_arrears
    FROM public.record_merchant_ledger_entry(
      v_mid, 3000, 'topup', 'intasend', 'topup:A:INV-1', 'M-Pesa top-up', 'KES', 3000);

  ASSERT v_applied,            'A: top-up should apply';
  ASSERT v_new_balance = 2660, format('A: balance should be 2660 (3000 - 340), got %s', v_new_balance);
  ASSERT v_new_arrears = 0,    format('A: arrears should be fully settled to 0, got %s', v_new_arrears);

  -- Full top-up row + a settlement row.
  SELECT * INTO v_topup FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'topup';
  ASSERT FOUND AND v_topup.amount = 3000, format('A: top-up row amount = %s (want full 3000)', v_topup.amount);

  SELECT * INTO v_settle FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'arrears_settlement';
  ASSERT FOUND AND v_settle.amount = -340, format('A: settlement row amount = %s (want -340)', v_settle.amount);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario A passed: arrears settled first, remainder credited';
END $$;

-- Scenario B: top-up smaller than arrears — all of it settles, balance stays 0.
DO $$
DECLARE
  v_mid UUID;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, outstanding_arrears)
    VALUES ('__test_settle_B', 'test.settle.b', '+254700000302', 'BBS Mall', 'active', 0, 5000)
    RETURNING id INTO v_mid;

  SELECT new_balance, new_arrears
    INTO v_new_balance, v_new_arrears
    FROM public.record_merchant_ledger_entry(
      v_mid, 3000, 'topup', 'intasend', 'topup:B:INV-1', 'M-Pesa top-up', 'KES', 3000);

  ASSERT v_new_balance = 0,    format('B: balance should stay 0 (all 3000 settles), got %s', v_new_balance);
  ASSERT v_new_arrears = 2000, format('B: arrears should drop to 2000, got %s', v_new_arrears);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario B passed: partial settle, never pre-credits balance';
END $$;

-- Scenario C: no arrears — plain credit, no settlement row.
DO $$
DECLARE
  v_mid UUID;
  v_new_balance NUMERIC;
  v_settle_rows INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, outstanding_arrears)
    VALUES ('__test_settle_C', 'test.settle.c', '+254700000303', 'BBS Mall', 'active', 100, 0)
    RETURNING id INTO v_mid;

  SELECT new_balance INTO v_new_balance
    FROM public.record_merchant_ledger_entry(
      v_mid, 1000, 'topup', 'intasend', 'topup:C:INV-1', 'M-Pesa top-up', 'KES', 1000);

  ASSERT v_new_balance = 1100, format('C: balance should be 1100, got %s', v_new_balance);
  SELECT count(*) INTO v_settle_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'arrears_settlement';
  ASSERT v_settle_rows = 0, format('C: no settlement row expected, got %s', v_settle_rows);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario C passed: no arrears → plain credit, no settlement row';
END $$;

-- Scenario D: duplicate provider_reference is idempotent (never pre-credits).
DO $$
DECLARE
  v_mid UUID;
  v_applied BOOLEAN;
  v_balance NUMERIC;
  v_arrears NUMERIC;
  v_topup_rows INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, outstanding_arrears)
    VALUES ('__test_settle_D', 'test.settle.d', '+254700000304', 'BBS Mall', 'active', 0, 340)
    RETURNING id INTO v_mid;

  PERFORM public.record_merchant_ledger_entry(
    v_mid, 3000, 'topup', 'intasend', 'topup:D:INV-DUP', 'M-Pesa top-up', 'KES', 3000);

  -- Duplicate delivery, same provider_reference.
  SELECT applied INTO v_applied FROM public.record_merchant_ledger_entry(
    v_mid, 3000, 'topup', 'intasend', 'topup:D:INV-DUP', 'M-Pesa top-up', 'KES', 3000);

  ASSERT NOT v_applied, 'D: duplicate delivery must not apply';

  SELECT account_balance, outstanding_arrears INTO v_balance, v_arrears
    FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 2660, format('D: balance double-applied — got %s, expected 2660', v_balance);
  ASSERT v_arrears = 0,    format('D: arrears wrong after dup — got %s', v_arrears);

  SELECT count(*) INTO v_topup_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'topup';
  ASSERT v_topup_rows = 1, format('D: expected exactly 1 top-up row, got %s', v_topup_rows);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario D passed: duplicate top-up idempotent, no double credit';
END $$;

-- Scenario E: full ledger reconciliation from a zero start.
--   balance     = Σ amount over balance-affecting types (all but success_fee_arrears)
--   arrears     = Σ amount over ('success_fee_arrears','arrears_settlement')
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_balance NUMERIC;
  v_arrears NUMERIC;
  v_ledger_balance NUMERIC;
  v_ledger_arrears NUMERIC;
  v_codes TEXT[] := ARRAY['510001','510002','510003','510004'];
  v_code TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, outstanding_arrears)
    VALUES ('__test_recon', 'test.recon', '+254700000305', 'BBS Mall', 'active', 0, 0)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test recon deal', 'x') RETURNING id INTO v_did;

  -- Opening top-up of 100 (no arrears yet) → balance 100.
  PERFORM public.record_merchant_ledger_entry(
    v_mid, 100, 'topup', 'intasend', 'topup:E:INV-1', 'M-Pesa top-up', 'KES', 100);

  -- Four verified redemptions at KES 30: three charged (100→10), fourth arrears.
  FOREACH v_code IN ARRAY v_codes LOOP
    INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
      VALUES (v_did, v_mid, v_uid, v_code, 'pending', NOW() + INTERVAL '1 hour', 30);
    PERFORM public.verify_redemption(v_mid, v_code);
  END LOOP;

  -- Second top-up of 50 settles the 30 arrears, credits 20 → balance 30.
  PERFORM public.record_merchant_ledger_entry(
    v_mid, 50, 'topup', 'intasend', 'topup:E:INV-2', 'M-Pesa top-up', 'KES', 50);

  SELECT account_balance, outstanding_arrears INTO v_balance, v_arrears
    FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 30, format('E: expected balance 30, got %s', v_balance);
  ASSERT v_arrears = 0,  format('E: expected arrears 0, got %s', v_arrears);

  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_balance
    FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type <> 'success_fee_arrears';
  ASSERT v_ledger_balance = v_balance,
    format('E: ledger balance-sum %s != account_balance %s', v_ledger_balance, v_balance);

  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_arrears
    FROM public.merchant_transactions
    WHERE merchant_id = v_mid
      AND transaction_type IN ('success_fee_arrears', 'arrears_settlement');
  ASSERT v_ledger_arrears = v_arrears,
    format('E: ledger arrears-sum %s != outstanding_arrears %s', v_ledger_arrears, v_arrears);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario E passed: ledger reconciles to balance and arrears';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL top-up settle-first scenarios passed.'; END $$;
