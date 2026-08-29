-- =========================================================================
-- GENERATED FILE — DO NOT EDIT.
--
-- Source:    supabase/tests/fixtures/fee-contract-cases.json
-- Generator: scripts/gen-fee-contract-cases.mjs
--
-- These are the SAME semantic cases `fee-contract-parity.test.ts` runs
-- against `aggregateLedgerFees`. Editing this file by hand breaks that
-- equivalence silently, which is the one thing the shared fixture exists to
-- prevent — so a drift check in CI regenerates it and fails on any diff.
--
-- Included by supabase/tests/fee_totals_contract_test.sql via \ir. It is
-- under fixtures/ rather than tests/ because the runner globs
-- supabase/tests/*.sql non-recursively and this file is not a suite of its
-- own.
--
-- Every case calls admin_fee_totals_for_merchants scoped to the merchants it
-- just created. That is ISOLATION, not the contract: the global wrapper sums
-- the whole database, so these assertions would otherwise depend on what
-- other suites left behind, and one stray genuine success with no fee row
-- would make every case here unavailable. The global wrapper has its own
-- hand-written coverage in the parent suite.
-- =========================================================================
-- ---------------------------------------------------------------------------
-- all-four-types
--
-- Every transaction type at once: both billed legs count, the reversal
-- subtracts, the settlement is invisible.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_r_r2 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_all-four-types_m1', 'fee.case.m1', '+254710000001',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_all-four-types_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100002', 'success',
            '2026-08-11T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-11T09:00:00Z', 70,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r2;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_all-four-types_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 70, 'success_fee_arrears', 'manual',
            '__fee_case_all-four-types_2', 'fixture', v_r_r2, '2026-08-11T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_all-four-types_3', 'fixture', v_r_r1, '2026-08-20T10:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'arrears_settlement', 'manual',
            '__fee_case_all-four-types_4', 'fixture', v_r_r1, '2026-08-20T10:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('all-four-types: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 100,
    format('all-four-types: gross_kes = %s, expected 100', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 30,
    format('all-four-types: reversals_kes = %s, expected 30', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 70,
    format('all-four-types: net_kes = %s, expected 70', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('all-four-types: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('all-four-types: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: all-four-types';
END $case$;

-- ---------------------------------------------------------------------------
-- charge-leg-negative
--
-- success_fee is written -p_amount. Read through its own sign it is positive
-- billed fee.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_charge-leg-negative_m1', 'fee.case.m1', '+254710000002',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_charge-leg-negative_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_charge-leg-negative_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('charge-leg-negative: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('charge-leg-negative: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('charge-leg-negative: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('charge-leg-negative: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('charge-leg-negative: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('charge-leg-negative: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: charge-leg-negative';
END $case$;

-- ---------------------------------------------------------------------------
-- arrears-leg-positive
--
-- success_fee_arrears is written p_amount — POSITIVE, because it accrues a
-- debt rather than moving the wallet. Opposite sign to the charge leg, same
-- billed fee.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_arrears-leg-positive_m1', 'fee.case.m1', '+254710000003',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_arrears-leg-positive_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'success_fee_arrears', 'manual',
            '__fee_case_arrears-leg-positive_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('arrears-leg-positive: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('arrears-leg-positive: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('arrears-leg-positive: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('arrears-leg-positive: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('arrears-leg-positive: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('arrears-leg-positive: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: arrears-leg-positive';
END $case$;

-- ---------------------------------------------------------------------------
-- reversal-reduces-net-not-gross
--
-- A reversal subtracts from net and leaves gross untouched. Under Math.abs
-- over a billed set it would have added.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_reversal-reduces-net-not-gross_m1', 'fee.case.m1', '+254710000004',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_reversal-reduces-net-not-gross_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_reversal-reduces-net-not-gross_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_reversal-reduces-net-not-gross_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('reversal-reduces-net-not-gross: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('reversal-reduces-net-not-gross: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 30,
    format('reversal-reduces-net-not-gross: reversals_kes = %s, expected 30', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('reversal-reduces-net-not-gross: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('reversal-reduces-net-not-gross: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('reversal-reduces-net-not-gross: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: reversal-reduces-net-not-gross';
END $case$;

-- ---------------------------------------------------------------------------
-- settlement-excluded
--
-- arrears_settlement moves an amount the arrears row already counted as
-- billed. In gross it doubles the fee; in reversals it subtracts a fee
-- nobody reversed.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_settlement-excluded_m1', 'fee.case.m1', '+254710000005',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_settlement-excluded_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'success_fee_arrears', 'manual',
            '__fee_case_settlement-excluded_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'arrears_settlement', 'manual',
            '__fee_case_settlement-excluded_2', 'fixture', v_r_r1, '2026-08-12T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('settlement-excluded: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('settlement-excluded: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('settlement-excluded: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('settlement-excluded: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('settlement-excluded: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('settlement-excluded: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: settlement-excluded';
END $case$;

-- ---------------------------------------------------------------------------
-- unrelated-types-excluded
--
-- Top-ups, boosts, subscriptions, refunds and disputes are not fee
-- generation. They must not move any of the three figures.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_unrelated-types-excluded_m1', 'fee.case.m1', '+254710000006',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_unrelated-types-excluded_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_unrelated-types-excluded_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 500, 'topup', 'manual',
            '__fee_case_unrelated-types-excluded_2', 'fixture', v_r_r1, '2026-08-11T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -500, 'boost_fee', 'manual',
            '__fee_case_unrelated-types-excluded_3', 'fixture', v_r_r1, '2026-08-11T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -3500, 'subscription', 'manual',
            '__fee_case_unrelated-types-excluded_4', 'fixture', v_r_r1, '2026-08-11T09:00:02Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 200, 'refund', 'manual',
            '__fee_case_unrelated-types-excluded_5', 'fixture', v_r_r1, '2026-08-11T09:00:03Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -50, 'dispute', 'manual',
            '__fee_case_unrelated-types-excluded_6', 'fixture', v_r_r1, '2026-08-11T09:00:04Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('unrelated-types-excluded: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('unrelated-types-excluded: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('unrelated-types-excluded: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('unrelated-types-excluded: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('unrelated-types-excluded: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('unrelated-types-excluded: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: unrelated-types-excluded';
END $case$;

-- ---------------------------------------------------------------------------
-- invalid-polarity-charge
--
-- A success_fee written POSITIVE contradicts the live function's -p_amount.
-- Unavailable, never normalised: Math.abs read this as 30.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_invalid-polarity-charge_m1', 'fee.case.m1', '+254710000007',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_invalid-polarity-charge_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'success_fee', 'manual',
            '__fee_case_invalid-polarity-charge_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('invalid-polarity-charge: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('invalid-polarity-charge: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('invalid-polarity-charge: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('invalid-polarity-charge: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('invalid-polarity-charge: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('invalid-polarity-charge: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: invalid-polarity-charge';
END $case$;

-- ---------------------------------------------------------------------------
-- invalid-polarity-reversal
--
-- A fee_reversal written negative contradicts reverse_success_fee's
-- v_fee_amount. All three unavailable under the all-or-nothing ruling.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_invalid-polarity-reversal_m1', 'fee.case.m1', '+254710000008',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_invalid-polarity-reversal_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_invalid-polarity-reversal_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'fee_reversal', 'manual',
            '__fee_case_invalid-polarity-reversal_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('invalid-polarity-reversal: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('invalid-polarity-reversal: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('invalid-polarity-reversal: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('invalid-polarity-reversal: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('invalid-polarity-reversal: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('invalid-polarity-reversal: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: invalid-polarity-reversal';
END $case$;

-- ---------------------------------------------------------------------------
-- zero-amount-fee-row
--
-- Neither RPC can write a zero fee. A row that says otherwise is unexpected,
-- not an absent fee.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_zero-amount-fee-row_m1', 'fee.case.m1', '+254710000009',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_zero-amount-fee-row_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 0, 'success_fee', 'manual',
            '__fee_case_zero-amount-fee-row_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('zero-amount-fee-row: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('zero-amount-fee-row: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('zero-amount-fee-row: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('zero-amount-fee-row: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('zero-amount-fee-row: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('zero-amount-fee-row: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: zero-amount-fee-row';
END $case$;

-- ---------------------------------------------------------------------------
-- missing-fee-row
--
-- verify_redemption commits status='success' before the fee step and
-- swallows its exception, so a genuine success can carry no ledger row at
-- all. The total is unknown, not smaller.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_r_r2 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_missing-fee-row_m1', 'fee.case.m1', '+254710000010',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_missing-fee-row_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100002', 'success',
            '2026-08-11T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-11T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r2;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_missing-fee-row_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('missing-fee-row: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('missing-fee-row: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('missing-fee-row: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('missing-fee-row: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('missing-fee-row: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('missing-fee-row: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: missing-fee-row';
END $case$;

-- ---------------------------------------------------------------------------
-- zero-activity
--
-- Nothing happened. That is an ANSWER, and it is zero — not unavailable.
-- Confusing the two is how a quiet period reads as a broken read.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_zero-activity_m1', 'fee.case.m1', '+254710000011',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_zero-activity_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('zero-activity: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('zero-activity: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('zero-activity: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('zero-activity: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('zero-activity: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('zero-activity: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: zero-activity';
END $case$;

-- ---------------------------------------------------------------------------
-- d188-demo-redemption
--
-- D188: the redemption itself is demo-tagged. Its fee never reaches an
-- executive figure.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_d188-demo-redemption_m1', 'fee.case.m1', '+254710000012',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_d188-demo-redemption_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            TRUE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_d188-demo-redemption_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('d188-demo-redemption: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-redemption: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-redemption: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-redemption: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('d188-demo-redemption: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('d188-demo-redemption: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: d188-demo-redemption';
END $case$;

-- ---------------------------------------------------------------------------
-- d188-demo-merchant
--
-- D188: the parent merchant is demo-tagged. The ledger row itself carries
-- nothing about its merchant, which is why this is a join and not a column
-- read.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_d188-demo-merchant_m1', 'fee.case.m1', '+254710000013',
            'BBS Mall', 'active', TRUE, 1000, TRUE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_d188-demo-merchant_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_d188-demo-merchant_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('d188-demo-merchant: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-merchant: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-merchant: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-merchant: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('d188-demo-merchant: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('d188-demo-merchant: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: d188-demo-merchant';
END $case$;

-- ---------------------------------------------------------------------------
-- d188-demo-deal
--
-- D188, the live production shape: a non-demo merchant holding a demo deal,
-- and claim_deal never sets redemptions.is_demo.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_d188-demo-deal_m1', 'fee.case.m1', '+254710000014',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_d188-demo-deal_m1', 'x', NOW() + INTERVAL '30 days', TRUE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_d188-demo-deal_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('d188-demo-deal: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-deal: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-deal: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('d188-demo-deal: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('d188-demo-deal: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('d188-demo-deal: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: d188-demo-deal';
END $case$;

-- ---------------------------------------------------------------------------
-- boundary-movement-at-since
--
-- The window is half-open [since, until). A movement exactly at since is IN.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_boundary-movement-at-since_m1', 'fee.case.m1', '+254710000015',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_boundary-movement-at-since_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-01T00:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-01T00:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_boundary-movement-at-since_1', 'fixture', v_r_r1, '2026-08-01T00:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('boundary-movement-at-since: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('boundary-movement-at-since: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-at-since: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('boundary-movement-at-since: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('boundary-movement-at-since: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('boundary-movement-at-since: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: boundary-movement-at-since';
END $case$;

-- ---------------------------------------------------------------------------
-- boundary-movement-at-until
--
-- A movement exactly at until is OUT. Its redemption is outside the
-- candidate set too, so the period stays available.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_boundary-movement-at-until_m1', 'fee.case.m1', '+254710000016',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_boundary-movement-at-until_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-09-01T00:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-09-01T00:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_boundary-movement-at-until_1', 'fixture', v_r_r1, '2026-09-01T00:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('boundary-movement-at-until: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-at-until: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-at-until: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-at-until: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('boundary-movement-at-until: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('boundary-movement-at-until: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: boundary-movement-at-until';
END $case$;

-- ---------------------------------------------------------------------------
-- boundary-movement-before-since
--
-- A movement before the window contributes nothing.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_boundary-movement-before-since_m1', 'fee.case.m1', '+254710000017',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_boundary-movement-before-since_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-07-15T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-07-15T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_boundary-movement-before-since_1', 'fixture', v_r_r1, '2026-07-15T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('boundary-movement-before-since: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-before-since: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-before-since: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('boundary-movement-before-since: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('boundary-movement-before-since: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('boundary-movement-before-since: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: boundary-movement-before-since';
END $case$;

-- ---------------------------------------------------------------------------
-- reversal-in-window-older-redemption
--
-- THE reason the window follows the movement. A reversal posted this period
-- against a redemption verified last period is this period's money movement,
-- and the period can end net negative.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_reversal-in-window-older-redemption_m1', 'fee.case.m1', '+254710000018',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_reversal-in-window-older-redemption_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-07-15T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-07-15T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_reversal-in-window-older-redemption_1', 'fixture', v_r_r1, '2026-07-15T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_reversal-in-window-older-redemption_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('reversal-in-window-older-redemption: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('reversal-in-window-older-redemption: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 30,
    format('reversal-in-window-older-redemption: reversals_kes = %s, expected 30', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM -30,
    format('reversal-in-window-older-redemption: net_kes = %s, expected -30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('reversal-in-window-older-redemption: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('reversal-in-window-older-redemption: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: reversal-in-window-older-redemption';
END $case$;

-- ---------------------------------------------------------------------------
-- fee-outside-window-proves-completeness
--
-- The midnight case. A redemption verified inside the window whose fee row
-- posted just after it: the fee row proves completeness across ALL dates
-- while contributing nothing to this window's gross. Windowing the
-- completeness SEARCH would manufacture an unavailable here.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_fee-outside-window-proves-completeness_m1', 'fee.case.m1', '+254710000019',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_fee-outside-window-proves-completeness_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-31T23:59:59Z'::timestamptz + INTERVAL '1 hour', '2026-08-31T23:59:59Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_fee-outside-window-proves-completeness_1', 'fixture', v_r_r1, '2026-09-01T00:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('fee-outside-window-proves-completeness: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('fee-outside-window-proves-completeness: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('fee-outside-window-proves-completeness: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('fee-outside-window-proves-completeness: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('fee-outside-window-proves-completeness: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('fee-outside-window-proves-completeness: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: fee-outside-window-proves-completeness';
END $case$;

-- ---------------------------------------------------------------------------
-- missing-fee-outside-window-does-not-poison
--
-- A genuine success verified BEFORE the window with no fee row at all. It is
-- a real gap, and it is not this period's gap: windowing the CANDIDATE SET
-- on redeemed_at is what keeps one old failure from blanking every report
-- forever.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_old UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_missing-fee-outside-window-does-not-poison_m1', 'fee.case.m1', '+254710000020',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_missing-fee-outside-window-does-not-poison_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-07-15T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-07-15T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_old;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100002', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_missing-fee-outside-window-does-not-poison_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('missing-fee-outside-window-does-not-poison: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('missing-fee-outside-window-does-not-poison: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('missing-fee-outside-window-does-not-poison: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('missing-fee-outside-window-does-not-poison: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('missing-fee-outside-window-does-not-poison: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('missing-fee-outside-window-does-not-poison: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: missing-fee-outside-window-does-not-poison';
END $case$;

-- ---------------------------------------------------------------------------
-- scoped-excludes-other-merchants
--
-- A scoped call must match the operator's actual scope. The out-of-scope
-- merchant's fee and its missing fee are both invisible.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_m_m2 UUID;
  v_d_m2 UUID;
  v_r_r1 UUID;
  v_r_r2 UUID;
  v_r_r3 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_scoped-excludes-other-merchants_m1', 'fee.case.m1', '+254710000021',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_scoped-excludes-other-merchants_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_scoped-excludes-other-merchants_m2', 'fee.case.m2', '+254710000022',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m2;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m2, '__fee_case_scoped-excludes-other-merchants_m2', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m2, v_m_m2, v_uid, '100002', 'success',
            '2026-08-11T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-11T09:00:00Z', 70,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m2, v_m_m2, v_uid, '100003', 'success',
            '2026-08-12T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-12T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r3;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_scoped-excludes-other-merchants_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m2, -70, 'success_fee', 'manual',
            '__fee_case_scoped-excludes-other-merchants_2', 'fixture', v_r_r2, '2026-08-11T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('scoped-excludes-other-merchants: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('scoped-excludes-other-merchants: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('scoped-excludes-other-merchants: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('scoped-excludes-other-merchants: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('scoped-excludes-other-merchants: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('scoped-excludes-other-merchants: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m2;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m2;
  DELETE FROM public.deals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchants WHERE id = v_m_m2;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: scoped-excludes-other-merchants';
END $case$;

-- ---------------------------------------------------------------------------
-- scoped-empty-is-available-zero
--
-- A live node with no merchants is a real state, not a reason to widen.
-- Empty scope is available zeros — and must never fall back to global.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_scoped-empty-is-available-zero_m1', 'fee.case.m1', '+254710000023',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_scoped-empty-is-available-zero_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_scoped-empty-is-available-zero_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('scoped-empty-is-available-zero: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 0,
    format('scoped-empty-is-available-zero: gross_kes = %s, expected 0', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('scoped-empty-is-available-zero: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('scoped-empty-is-available-zero: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('scoped-empty-is-available-zero: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('scoped-empty-is-available-zero: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: scoped-empty-is-available-zero';
END $case$;

-- ---------------------------------------------------------------------------
-- fee-against-non-success-redemption-excluded
--
-- deduct_success_fee_or_record_arrears will write a fee against a pending
-- redemption if service_role asks it to. A fee may only be counted against a
-- redemption the counter actually verified, and readLedgerFeeTotals builds
-- its genuine set with status = success.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_r_rp UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_fee-against-non-success-redemption-excluded_m1', 'fee.case.m1', '+254710000024',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_fee-against-non-success-redemption-excluded_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100002', 'pending',
            '2026-08-11T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-11T09:00:00Z', 70,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_rp;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_fee-against-non-success-redemption-excluded_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -70, 'success_fee', 'manual',
            '__fee_case_fee-against-non-success-redemption-excluded_2', 'fixture', v_r_rp, '2026-08-11T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('fee-against-non-success-redemption-excluded: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('fee-against-non-success-redemption-excluded: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('fee-against-non-success-redemption-excluded: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('fee-against-non-success-redemption-excluded: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('fee-against-non-success-redemption-excluded: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('fee-against-non-success-redemption-excluded: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: fee-against-non-success-redemption-excluded';
END $case$;

-- ---------------------------------------------------------------------------
-- nan-amount
--
-- NaN is a valid numeric. PostgreSQL orders it ABOVE every finite value, so
-- `> 0` accepts it and `<= 0` does not catch it, and SUM propagates it —
-- without an explicit rejection the figure would be NaN with invalid_rows 0
-- and available true.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_nan-amount_m1', 'fee.case.m1', '+254710000025',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_nan-amount_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 'NaN'::numeric, 'success_fee', 'manual',
            '__fee_case_nan-amount_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('nan-amount: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('nan-amount: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('nan-amount: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('nan-amount: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('nan-amount: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('nan-amount: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: nan-amount';
END $case$;

-- ---------------------------------------------------------------------------
-- infinite-created-at
--
-- `infinity` is a valid timestamptz sorting above every bound, so SQL would
-- include it while Date.parse('infinity') is NaN and TypeScript already
-- calls it unknown. Both must refuse it or the two contracts answer
-- differently on the same row.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_infinite-created-at_m1', 'fee.case.m1', '+254710000026',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_infinite-created-at_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_infinite-created-at_1', 'fixture', v_r_r1, 'infinity',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('infinite-created-at: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('infinite-created-at: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('infinite-created-at: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('infinite-created-at: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('infinite-created-at: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('infinite-created-at: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: infinite-created-at';
END $case$;

-- ---------------------------------------------------------------------------
-- malformed-later-reversal-does-not-blank-an-earlier-period
--
-- An August redemption and a valid August fee, followed by a wrong-signed
-- reversal in September. The reversal cannot enter August's totals and
-- cannot prove August's completeness, so it has no bearing on August — it is
-- invalid in its own window, not in this one. Invalidating it here would
-- blank the August report forever.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_malformed-later-reversal-does-not-blank-an-earlier-period_m1', 'fee.case.m1', '+254710000027',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_malformed-later-reversal-does-not-blank-an-earlier-period_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_malformed-later-reversal-does-not-blank-an-earlier-period_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'fee_reversal', 'manual',
            '__fee_case_malformed-later-reversal-does-not-blank-an-earlier-period_2', 'fixture', v_r_r1, '2026-09-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('malformed-later-reversal-does-not-blank-an-earlier-period: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('malformed-later-reversal-does-not-blank-an-earlier-period: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('malformed-later-reversal-does-not-blank-an-earlier-period: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('malformed-later-reversal-does-not-blank-an-earlier-period: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('malformed-later-reversal-does-not-blank-an-earlier-period: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('malformed-later-reversal-does-not-blank-an-earlier-period: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: malformed-later-reversal-does-not-blank-an-earlier-period';
END $case$;

-- ---------------------------------------------------------------------------
-- valid-and-malformed-gross-evidence
--
-- An in-window redemption with a valid in-window fee AND a second, malformed
-- gross row outside the window. The valid row already answered the
-- completeness question, so the malformed one has no bearing on this period
-- — and invalidating it would blank the period permanently, because a link
-- to a candidate never ages out.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_valid-and-malformed-gross-evidence_m1', 'fee.case.m1', '+254710000028',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_valid-and-malformed-gross-evidence_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_valid-and-malformed-gross-evidence_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 70, 'success_fee', 'manual',
            '__fee_case_valid-and-malformed-gross-evidence_2', 'fixture', v_r_r1, '2026-09-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('valid-and-malformed-gross-evidence: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('valid-and-malformed-gross-evidence: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('valid-and-malformed-gross-evidence: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('valid-and-malformed-gross-evidence: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('valid-and-malformed-gross-evidence: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('valid-and-malformed-gross-evidence: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: valid-and-malformed-gross-evidence';
END $case$;

-- ---------------------------------------------------------------------------
-- demo-tagged-movement-excluded
--
-- A synthetic movement sitting BESIDE a real one on the same genuine
-- redemption. The demo row is well-formed and correctly signed, so nothing
-- but its own is_demo tag distinguishes it — without that filter it adds KES
-- 70 of invented revenue to a real figure. D188's lesson is that
-- redemptions.is_demo is not a discriminator because claim_deal never sets
-- it, which is a reason to add the parent join, not a reason to ignore a tag
-- the seed scripts do set deliberately.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_demo-tagged-movement-excluded_m1', 'fee.case.m1', '+254710000029',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_demo-tagged-movement-excluded_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_demo-tagged-movement-excluded_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 70, 'success_fee_arrears', 'manual',
            '__fee_case_demo-tagged-movement-excluded_2', 'fixture', v_r_r1, '2026-08-11T09:00:01Z',
            TRUE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('demo-tagged-movement-excluded: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('demo-tagged-movement-excluded: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('demo-tagged-movement-excluded: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('demo-tagged-movement-excluded: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('demo-tagged-movement-excluded: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('demo-tagged-movement-excluded: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: demo-tagged-movement-excluded';
END $case$;

-- ---------------------------------------------------------------------------
-- orphan-reversal-without-audit-row
--
-- A correctly-signed fee_reversal inserted straight into the ledger, with no
-- fee_reversals audit row behind it. No wallet was credited and no admin
-- approved anything, yet every other test passes it — so it would subtract
-- from net and read as money returned.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_orphan-reversal-without-audit-row_m1', 'fee.case.m1', '+254710000030',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_orphan-reversal-without-audit-row_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_orphan-reversal-without-audit-row_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_orphan-reversal-without-audit-row_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('orphan-reversal-without-audit-row: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('orphan-reversal-without-audit-row: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('orphan-reversal-without-audit-row: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('orphan-reversal-without-audit-row: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('orphan-reversal-without-audit-row: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('orphan-reversal-without-audit-row: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: orphan-reversal-without-audit-row';
END $case$;

-- ---------------------------------------------------------------------------
-- second-reversal-riding-on-an-existing-audit-row
--
-- A genuine reversal with its audit row, plus a SECOND fee_reversal ledger
-- row on the same redemption and no audit row of its own. Corroborating by
-- redemption alone would let the second row borrow the first row's audit
-- trail and double the money returned.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_second-reversal-riding-on-an-existing-audit-row_m1', 'fee.case.m1', '+254710000031',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_second-reversal-riding-on-an-existing-audit-row_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_second-reversal-riding-on-an-existing-audit-row_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_second-reversal-riding-on-an-existing-audit-row_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_second-reversal-riding-on-an-existing-audit-row_3', 'fixture', v_r_r1, '2026-08-16T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('second-reversal-riding-on-an-existing-audit-row: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('second-reversal-riding-on-an-existing-audit-row: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('second-reversal-riding-on-an-existing-audit-row: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('second-reversal-riding-on-an-existing-audit-row: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('second-reversal-riding-on-an-existing-audit-row: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('second-reversal-riding-on-an-existing-audit-row: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: second-reversal-riding-on-an-existing-audit-row';
END $case$;

-- ---------------------------------------------------------------------------
-- reversal-audit-row-disagrees-on-amount
--
-- The audit row points at the right ledger row but records a different
-- amount. The ledger says KES 70 was returned and the approval says KES 30 —
-- one of them is wrong and nothing here can tell which, so the figure is not
-- established.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_reversal-audit-row-disagrees-on-amount_m1', 'fee.case.m1', '+254710000032',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_reversal-audit-row-disagrees-on-amount_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 70,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -70, 'success_fee', 'manual',
            '__fee_case_reversal-audit-row-disagrees-on-amount_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 70, 'fee_reversal', 'manual',
            '__fee_case_reversal-audit-row-disagrees-on-amount_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('reversal-audit-row-disagrees-on-amount: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('reversal-audit-row-disagrees-on-amount: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('reversal-audit-row-disagrees-on-amount: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('reversal-audit-row-disagrees-on-amount: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('reversal-audit-row-disagrees-on-amount: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('reversal-audit-row-disagrees-on-amount: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: reversal-audit-row-disagrees-on-amount';
END $case$;

-- ---------------------------------------------------------------------------
-- reversal-audit-without-an-approver
--
-- A reversal and a matching audit row, but approver_user_id is NULL.
-- reverse_success_fee raises unless the approver's role is admin, so a
-- genuine audit row always names one — and the column is nullable, so an
-- approver-less row is representable and satisfies every other part of
-- corroboration.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_reversal-audit-without-an-approver_m1', 'fee.case.m1', '+254710000033',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_reversal-audit-without-an-approver_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_reversal-audit-without-an-approver_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_reversal-audit-without-an-approver_2', 'fixture', v_r_r1, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            NULL);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('reversal-audit-without-an-approver: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('reversal-audit-without-an-approver: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('reversal-audit-without-an-approver: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('reversal-audit-without-an-approver: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('reversal-audit-without-an-approver: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('reversal-audit-without-an-approver: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: reversal-audit-without-an-approver';
END $case$;

-- ---------------------------------------------------------------------------
-- fee-amount-disagrees-with-redemption-snapshot
--
-- A correctly-signed success_fee of KES 70 against a redemption whose
-- success_fee_charged is 30. deduct_success_fee_or_record_arrears writes the
-- redemption's own snapshot and pins it to the canonical config fee, and
-- nothing updates that snapshot afterwards — so this row was not written by
-- the money path, and counting it reports revenue nobody billed.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_fee-amount-disagrees-with-redemption-snapshot_m1', 'fee.case.m1', '+254710000034',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_fee-amount-disagrees-with-redemption-snapshot_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -70, 'success_fee', 'manual',
            '__fee_case_fee-amount-disagrees-with-redemption-snapshot_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('fee-amount-disagrees-with-redemption-snapshot: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('fee-amount-disagrees-with-redemption-snapshot: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('fee-amount-disagrees-with-redemption-snapshot: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('fee-amount-disagrees-with-redemption-snapshot: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('fee-amount-disagrees-with-redemption-snapshot: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('fee-amount-disagrees-with-redemption-snapshot: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: fee-amount-disagrees-with-redemption-snapshot';
END $case$;

-- ---------------------------------------------------------------------------
-- redemption-linked-to-another-merchants-deal
--
-- A redemption naming merchant m1 against merchant m2's deal. claim_deal
-- always copies the deal's merchant into the redemption, so the two parents
-- disagreeing is the cross-merchant corruption one level up — and it would
-- attribute m2's supply to m1.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_m_m2 UUID;
  v_d_m2 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_redemption-linked-to-another-merchants-deal_m1', 'fee.case.m1', '+254710000035',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_redemption-linked-to-another-merchants-deal_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_redemption-linked-to-another-merchants-deal_m2', 'fee.case.m2', '+254710000036',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m2;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m2, '__fee_case_redemption-linked-to-another-merchants-deal_m2', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m2, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_redemption-linked-to-another-merchants-deal_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1, v_m_m2]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('redemption-linked-to-another-merchants-deal: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('redemption-linked-to-another-merchants-deal: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('redemption-linked-to-another-merchants-deal: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('redemption-linked-to-another-merchants-deal: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('redemption-linked-to-another-merchants-deal: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('redemption-linked-to-another-merchants-deal: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m2;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m2;
  DELETE FROM public.deals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchants WHERE id = v_m_m2;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: redemption-linked-to-another-merchants-deal';
END $case$;

-- ---------------------------------------------------------------------------
-- gross-posted-before-verification
--
-- A fee written while the redemption was still pending, which later became
-- successful. verify_redemption sets redeemed_at and writes the fee in one
-- transaction, so a fee can never predate its own verification — without
-- this rule the later status transition retroactively legitimises the
-- earlier row.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_gross-posted-before-verification_m1', 'fee.case.m1', '+254710000037',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_gross-posted-before-verification_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-20T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-20T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_gross-posted-before-verification_1', 'fixture', v_r_r1, '2026-08-10T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('gross-posted-before-verification: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('gross-posted-before-verification: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('gross-posted-before-verification: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('gross-posted-before-verification: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('gross-posted-before-verification: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('gross-posted-before-verification: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: gross-posted-before-verification';
END $case$;

-- ---------------------------------------------------------------------------
-- duplicate-gross-rows-for-one-redemption
--
-- Two well-formed success_fee rows against one redemption: same merchant,
-- same snapshot, both after verification. Every row is individually valid
-- and the sum reports KES 60 for a KES 30 fee. verify_redemption writes
-- exactly one, but deduct_success_fee_or_record_arrears takes a
-- caller-supplied reference id, so a retry or a direct call produces this.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_duplicate-gross-rows-for-one-redemption_m1', 'fee.case.m1', '+254710000038',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_duplicate-gross-rows-for-one-redemption_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_duplicate-gross-rows-for-one-redemption_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_duplicate-gross-rows-for-one-redemption_2', 'fixture', v_r_r1, '2026-08-10T09:00:02Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('duplicate-gross-rows-for-one-redemption: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('duplicate-gross-rows-for-one-redemption: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('duplicate-gross-rows-for-one-redemption: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('duplicate-gross-rows-for-one-redemption: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('duplicate-gross-rows-for-one-redemption: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 2,
    format('duplicate-gross-rows-for-one-redemption: invalid_rows = %s, expected 2', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: duplicate-gross-rows-for-one-redemption';
END $case$;

-- ---------------------------------------------------------------------------
-- reversal-posted-before-verification
--
-- A corroborated reversal dated before its redemption was verified.
-- reverse_success_fee refuses a redemption that is not already success, so a
-- reversal cannot predate verification any more than a fee can.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_reversal-posted-before-verification_m1', 'fee.case.m1', '+254710000039',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_reversal-posted-before-verification_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-20T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-20T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_reversal-posted-before-verification_1', 'fixture', v_r_r1, '2026-08-20T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_reversal-posted-before-verification_2', 'fixture', v_r_r1, '2026-08-10T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('reversal-posted-before-verification: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('reversal-posted-before-verification: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('reversal-posted-before-verification: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('reversal-posted-before-verification: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('reversal-posted-before-verification: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('reversal-posted-before-verification: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: reversal-posted-before-verification';
END $case$;

-- ---------------------------------------------------------------------------
-- reversal-without-an-original-fee
--
-- An in-window reversal, fully corroborated, against an older redemption
-- that was never billed at all. reverse_success_fee raises no_fee_to_reverse
-- for exactly this, so the shape is fabricated — and because the redemption
-- is outside the candidate window, nothing else here would have noticed. It
-- would report money returned for a fee that was never charged.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_old UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_reversal-without-an-original-fee_m1', 'fee.case.m1', '+254710000040',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_reversal-without-an-original-fee_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-07-15T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-07-15T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_old;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_reversal-without-an-original-fee_1', 'fixture', v_r_old, '2026-08-15T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_old, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('reversal-without-an-original-fee: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('reversal-without-an-original-fee: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('reversal-without-an-original-fee: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('reversal-without-an-original-fee: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('reversal-without-an-original-fee: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('reversal-without-an-original-fee: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: reversal-without-an-original-fee';
END $case$;

-- ---------------------------------------------------------------------------
-- fee-row-with-no-redemption-parent
--
-- deduct_success_fee_or_record_arrears takes p_reference_id DEFAULT NULL and
-- merchant_transactions.reference_id has no foreign key, so an authorized
-- caller can move a merchant's wallet and leave the fee row pointing at
-- nothing. Every other rule is about a row that joins and then contradicts
-- something; this is the row that never joins, and the inner join discarded
-- it silently while the report said zero and called itself available.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_fee-row-with-no-redemption-parent_m1', 'fee.case.m1', '+254710000041',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_fee-row-with-no-redemption-parent_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_fee-row-with-no-redemption-parent_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_fee-row-with-no-redemption-parent_2', 'fixture', NULL, '2026-08-12T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('fee-row-with-no-redemption-parent: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('fee-row-with-no-redemption-parent: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('fee-row-with-no-redemption-parent: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('fee-row-with-no-redemption-parent: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('fee-row-with-no-redemption-parent: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('fee-row-with-no-redemption-parent: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: fee-row-with-no-redemption-parent';
END $case$;

-- ---------------------------------------------------------------------------
-- flagged-success-still-counts-and-its-reversal-reduces-net
--
-- Founder ruling 2026-08-29: status = success is the authoritative financial
-- event. fraud_flags and review_required are mutable review metadata and do
-- not independently remove an otherwise successful redemption from
-- earned-fee totals. Adjudication that invalidates the fee corrects it
-- through an explicit fee_reversal, which reduces net in the window its own
-- movement falls in.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_flagged-success-still-counts-and-its-reversal-reduces-net_m1', 'fee.case.m1', '+254710000042',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_flagged-success-still-counts-and-its-reversal-reduces-net_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            ARRAY['velocity', 'distance']::text[], TRUE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_flagged-success-still-counts-and-its-reversal-reduces-net_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_flagged-success-still-counts-and-its-reversal-reduces-net_2', 'fixture', v_r_r1, '2026-08-20T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('flagged-success-still-counts-and-its-reversal-reduces-net: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('flagged-success-still-counts-and-its-reversal-reduces-net: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 30,
    format('flagged-success-still-counts-and-its-reversal-reduces-net: reversals_kes = %s, expected 30', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 0,
    format('flagged-success-still-counts-and-its-reversal-reduces-net: net_kes = %s, expected 0', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('flagged-success-still-counts-and-its-reversal-reduces-net: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('flagged-success-still-counts-and-its-reversal-reduces-net: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: flagged-success-still-counts-and-its-reversal-reduces-net';
END $case$;

-- ---------------------------------------------------------------------------
-- flagged-success-counts-before-its-reversal-lands
--
-- The same flagged redemption and the same reversal, read over the window
-- BEFORE the reversal posted. The fee counts in full and net is 30 — the
-- correction has not happened yet. This is what auditability buys: last
-- month's figure is what last month's ledger said, and it moves only when a
-- movement moves it, never because a review flag was toggled afterwards.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_flagged-success-counts-before-its-reversal-lands_m1', 'fee.case.m1', '+254710000043',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_flagged-success-counts-before-its-reversal-lands_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            ARRAY['velocity']::text[], TRUE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_flagged-success-counts-before-its-reversal-lands_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'fee_reversal', 'manual',
            '__fee_case_flagged-success-counts-before-its-reversal-lands_2', 'fixture', v_r_r1, '2026-08-20T09:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;
  INSERT INTO public.fee_reversals
    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)
    VALUES (v_r_r1, v_m_m1,
            v_tx, 30, 'fixture reversal',
            v_uid);

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-08-15T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM TRUE,
    format('flagged-success-counts-before-its-reversal-lands: available = %s, expected true', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM 30,
    format('flagged-success-counts-before-its-reversal-lands: gross_kes = %s, expected 30', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM 0,
    format('flagged-success-counts-before-its-reversal-lands: reversals_kes = %s, expected 0', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM 30,
    format('flagged-success-counts-before-its-reversal-lands: net_kes = %s, expected 30', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('flagged-success-counts-before-its-reversal-lands: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 0,
    format('flagged-success-counts-before-its-reversal-lands: invalid_rows = %s, expected 0', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: flagged-success-counts-before-its-reversal-lands';
END $case$;

-- ---------------------------------------------------------------------------
-- unplaceable-fee-on-an-older-redemption-still-surfaces
--
-- A fee row with created_at = infinity on a redemption verified BEFORE the
-- window. It belongs to no window, so no window can exclude it on date
-- grounds — and if the subject set skips it, it is never classified, never
-- flagged, and the report returns an available zero over money that moved.
-- The existing infinity case only passes because its redemption is itself
-- in-window.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_old UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_unplaceable-fee-on-an-older-redemption-still-surfaces_m1', 'fee.case.m1', '+254710000044',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_unplaceable-fee-on-an-older-redemption-still-surfaces_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-07-15T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-07-15T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_old;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_unplaceable-fee-on-an-older-redemption-still-surfaces_1', 'fixture', v_r_old, 'infinity',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('unplaceable-fee-on-an-older-redemption-still-surfaces: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('unplaceable-fee-on-an-older-redemption-still-surfaces: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('unplaceable-fee-on-an-older-redemption-still-surfaces: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('unplaceable-fee-on-an-older-redemption-still-surfaces: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('unplaceable-fee-on-an-older-redemption-still-surfaces: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('unplaceable-fee-on-an-older-redemption-still-surfaces: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: unplaceable-fee-on-an-older-redemption-still-surfaces';
END $case$;

-- ---------------------------------------------------------------------------
-- deal-owner-sees-corruption-on-its-own-deal
--
-- A deal owned by m2 whose redemption and fee movement both name m1. Scoping
-- only on the redemption's and movement's merchants leaves m2 reading an
-- available zero while the corruption sits on m2's own deal — the same
-- one-sided blindness already fixed for the transaction/redemption mismatch,
-- one parent over.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_m_m2 UUID;
  v_d_m2 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_deal-owner-sees-corruption-on-its-own-deal_m1', 'fee.case.m1', '+254710000045',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_deal-owner-sees-corruption-on-its-own-deal_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_deal-owner-sees-corruption-on-its-own-deal_m2', 'fee.case.m2', '+254710000046',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m2;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m2, '__fee_case_deal-owner-sees-corruption-on-its-own-deal_m2', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m2, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, -30, 'success_fee', 'manual',
            '__fee_case_deal-owner-sees-corruption-on-its-own-deal_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m2]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('deal-owner-sees-corruption-on-its-own-deal: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('deal-owner-sees-corruption-on-its-own-deal: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('deal-owner-sees-corruption-on-its-own-deal: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('deal-owner-sees-corruption-on-its-own-deal: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('deal-owner-sees-corruption-on-its-own-deal: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('deal-owner-sees-corruption-on-its-own-deal: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m2;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m2;
  DELETE FROM public.deals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchants WHERE id = v_m_m2;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: deal-owner-sees-corruption-on-its-own-deal';
END $case$;

-- ---------------------------------------------------------------------------
-- cross-merchant-reference
--
-- One merchant's wallet debit pointing at another merchant's redemption.
-- Nothing in the schema enforces equality and the fee RPC takes a
-- caller-supplied reference id, so it is representable. Attributing it to
-- either merchant is a guess, so it is surfaced instead — and it is visible
-- from BOTH scopes rather than invisible from one.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_m_m2 UUID;
  v_d_m2 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_cross-merchant-reference_m1', 'fee.case.m1', '+254710000047',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_cross-merchant-reference_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_cross-merchant-reference_m2', 'fee.case.m2', '+254710000048',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m2;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m2, '__fee_case_cross-merchant-reference_m2', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m2, -30, 'success_fee', 'manual',
            '__fee_case_cross-merchant-reference_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('cross-merchant-reference: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('cross-merchant-reference: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('cross-merchant-reference: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('cross-merchant-reference: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('cross-merchant-reference: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('cross-merchant-reference: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m2;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m2;
  DELETE FROM public.deals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchants WHERE id = v_m_m2;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: cross-merchant-reference';
END $case$;

-- ---------------------------------------------------------------------------
-- cross-merchant-reference-from-debited-scope
--
-- The same corrupt row seen from the OTHER side: the merchant whose wallet
-- was actually debited. Scoping only on the redemption's merchant would make
-- this row invisible here, so the debited merchant's report would read
-- available and complete while its wallet moved.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_m_m2 UUID;
  v_d_m2 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_cross-merchant-reference-from-debited-scope_m1', 'fee.case.m1', '+254710000049',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_cross-merchant-reference-from-debited-scope_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_cross-merchant-reference-from-debited-scope_m2', 'fee.case.m2', '+254710000050',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m2;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m2, '__fee_case_cross-merchant-reference-from-debited-scope_m2', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-10T09:00:00Z'::timestamptz + INTERVAL '1 hour', '2026-08-10T09:00:00Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m2, -30, 'success_fee', 'manual',
            '__fee_case_cross-merchant-reference-from-debited-scope_1', 'fixture', v_r_r1, '2026-08-10T09:00:01Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m2]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('cross-merchant-reference-from-debited-scope: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('cross-merchant-reference-from-debited-scope: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('cross-merchant-reference-from-debited-scope: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('cross-merchant-reference-from-debited-scope: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 0,
    format('cross-merchant-reference-from-debited-scope: missing_fee_rows = %s, expected 0', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('cross-merchant-reference-from-debited-scope: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m2;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m2;
  DELETE FROM public.deals WHERE merchant_id = v_m_m2;
  DELETE FROM public.merchants WHERE id = v_m_m2;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: cross-merchant-reference-from-debited-scope';
END $case$;

-- ---------------------------------------------------------------------------
-- malformed-fee-outside-window-does-not-prove-completeness
--
-- The completeness search spans all dates, so a malformed row would
-- otherwise buy an available:true with nothing behind it. A zero,
-- wrong-signed or cross-merchant row is not a fee, whatever its date.
-- ---------------------------------------------------------------------------
DO $case$
DECLARE
  v_uid UUID;
  v_m_m1 UUID;
  v_d_m1 UUID;
  v_r_r1 UUID;
  v_tx UUID;
  v_row RECORD;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)
    VALUES ('__fee_case_malformed-fee-outside-window-does-not-prove-completeness_m1', 'fee.case.m1', '+254710000051',
            'BBS Mall', 'active', TRUE, 1000, FALSE)
    RETURNING id INTO v_m_m1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)
    VALUES (v_m_m1, '__fee_case_malformed-fee-outside-window-does-not-prove-completeness_m1', 'x', NOW() + INTERVAL '30 days', FALSE)
    RETURNING id INTO v_d_m1;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo, fraud_flags, review_required)
    VALUES (v_d_m1, v_m_m1, v_uid, '100001', 'success',
            '2026-08-31T23:59:59Z'::timestamptz + INTERVAL '1 hour', '2026-08-31T23:59:59Z', 30,
            FALSE,
            NULL, FALSE)
    RETURNING id INTO v_r_r1;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)
    VALUES (v_m_m1, 30, 'success_fee', 'manual',
            '__fee_case_malformed-fee-outside-window-does-not-prove-completeness_1', 'fixture', v_r_r1, '2026-09-01T00:00:00Z',
            FALSE)
    RETURNING id INTO v_tx;

  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', ARRAY[v_m_m1]::uuid[]);

  ASSERT v_row.available IS NOT DISTINCT FROM FALSE,
    format('malformed-fee-outside-window-does-not-prove-completeness: available = %s, expected false', v_row.available);
  ASSERT v_row.gross_kes IS NOT DISTINCT FROM NULL,
    format('malformed-fee-outside-window-does-not-prove-completeness: gross_kes = %s, expected NULL', v_row.gross_kes);
  ASSERT v_row.reversals_kes IS NOT DISTINCT FROM NULL,
    format('malformed-fee-outside-window-does-not-prove-completeness: reversals_kes = %s, expected NULL', v_row.reversals_kes);
  ASSERT v_row.net_kes IS NOT DISTINCT FROM NULL,
    format('malformed-fee-outside-window-does-not-prove-completeness: net_kes = %s, expected NULL', v_row.net_kes);
  ASSERT v_row.missing_fee_rows = 1,
    format('malformed-fee-outside-window-does-not-prove-completeness: missing_fee_rows = %s, expected 1', v_row.missing_fee_rows);
  ASSERT v_row.invalid_rows = 1,
    format('malformed-fee-outside-window-does-not-prove-completeness: invalid_rows = %s, expected 1', v_row.invalid_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_m1;
  DELETE FROM public.redemptions WHERE merchant_id = v_m_m1;
  DELETE FROM public.deals WHERE merchant_id = v_m_m1;
  DELETE FROM public.merchants WHERE id = v_m_m1;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'fee contract case passed: malformed-fee-outside-window-does-not-prove-completeness';
END $case$;
