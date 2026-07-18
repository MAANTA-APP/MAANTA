-- ============================================================
-- Test: success-fee ledger row carries its redemption id
--   (migration 20260718130000_link_success_fee_ledger_to_redemption.sql)
--
-- Self-contained and self-cleaning. Run against a database that has the
-- migration applied, e.g.:
--   psql "$DATABASE_URL" -f supabase/tests/success_fee_reference_link_test.sql
--
-- Each scenario runs inside a DO block. ASSERT raises (aborting the whole
-- run) on failure; on success the block explicitly deletes the rows it made.
-- Test rows use a recognizable name prefix / OTP.
--
-- verify_redemption and deduct_success_fee_or_record_arrears are
-- service_role/owner/admin-gated via auth.role(). In production the
-- /api/redemptions/verify route calls with the service-role key
-- (auth.role() = 'service_role', which the auth check bypasses). We reproduce
-- that context for the whole run below.
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: wallet covers the fee → charged, and the success_fee ledger row
-- stores reference_id = the redemption id (matches the redeem success takeover).
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_fee_status TEXT;
  v_new_balance NUMERIC;
  v_balance NUMERIC;
  v_tx RECORD;
BEGIN
  -- Reproduce the service-role context inside the block (transaction-local),
  -- so it holds during verify_redemption regardless of how the file is run.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fee_ref_A', 'test.fee.ref.a', '+254700000101', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal A', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '482091', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  -- Verify exactly once (a second call would find no pending row).
  SELECT fee_charge_status, new_balance
    INTO v_fee_status, v_new_balance
    FROM public.verify_redemption(v_mid, '482091');

  ASSERT v_fee_status = 'charged', format('A: fee_charge_status = %s', v_fee_status);
  ASSERT v_new_balance = 70,       format('A: verify() new_balance = %s', v_new_balance);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 70, format('A: expected balance 70 after KES 30 fee, got %s', v_balance);

  SELECT * INTO v_tx FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT FOUND, 'A: no success_fee ledger row written';
  ASSERT v_tx.amount = -30,                 format('A: fee amount = %s', v_tx.amount);
  ASSERT v_tx.reference_id = v_rid,
    format('A: ledger reference_id (%s) does not match redemption id (%s)', v_tx.reference_id, v_rid);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: charged fee row carries the redemption id';
END $$;

-- Scenario B: wallet cannot cover the fee → arrears, and the
-- success_fee_arrears ledger row ALSO stores reference_id = the redemption id.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_arrears NUMERIC;
  v_tx RECORD;
BEGIN
  -- Reproduce the service-role context inside the block (transaction-local),
  -- so it holds during verify_redemption regardless of how the file is run.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fee_ref_B', 'test.fee.ref.b', '+254700000102', 'BBS Mall', 'active', 10)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal B', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '771204', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  PERFORM public.verify_redemption(v_mid, '771204');

  SELECT outstanding_arrears INTO v_arrears FROM public.merchants WHERE id = v_mid;
  ASSERT v_arrears = 30, format('B: expected arrears 30, got %s', v_arrears);

  SELECT * INTO v_tx FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee_arrears';
  ASSERT FOUND, 'B: no success_fee_arrears ledger row written';
  ASSERT v_tx.reference_id = v_rid,
    format('B: arrears ledger reference_id (%s) does not match redemption id (%s)', v_tx.reference_id, v_rid);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario B passed: arrears fee row carries the redemption id';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL success_fee_reference_link scenarios passed.'; END $$;
