-- ============================================================
-- Test: golden path end-to-end at the RPC layer (ENGINEERING_NOTES §8.3).
--
-- The §8.3 golden path is a browser flow (browse → sign in at claim → claim →
-- code ticks → merchant verifies → green takeover → ledger row → shopper sees
-- REDEEMED with the same reference). Its correctness-critical, money-bearing
-- core is the server chain claim_deal → verify_redemption → ledger, which this
-- test exercises directly and deterministically (the UI only renders what the
-- server returns — codes/expiry/totals are server-issued, §1). A browser E2E
-- (Playwright) over the same chain needs a live Supabase + Clerk OTP and is the
-- remaining live-env task.
--
-- Reproduces the service-role context both RPCs run under in production.
--   psql "$DATABASE_URL" -f supabase/tests/golden_path_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  -- claim_deal returns
  v_claim RECORD;
  v_otp TEXT;
  v_claim_rid UUID;
  v_deal_end TIMESTAMPTZ;
  -- verify_redemption returns
  v_verify RECORD;
  -- assertions
  v_redemption RECORD;
  v_tx RECORD;
  v_fee_rows INT;
  v_balance NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Seed: shopper, funded active BBS Mall merchant, live deal.
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number)
    VALUES ('__test_golden', 'test.golden.path', '+254700000401', 'BBS Mall', 'active', 100, '1st Floor', 'B-14')
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, max_claims, claims_count, success_fee)
    VALUES (v_mid, 'Nyama choma platter for two', 'https://img/x', true, NOW() + INTERVAL '6 hours', 50, 0, 30)
    RETURNING id INTO v_did;
  -- Read the PERSISTED expiry: a set_deal_expiry trigger may override the
  -- inserted value (standard deals → starts_at + 24h), so the grace-window
  -- assertion below must anchor to what the row actually holds, not our input.
  SELECT expires_at INTO v_deal_end FROM public.deals WHERE id = v_did;

  -- 1) Shopper claims → server issues the 6-digit code and the expiry.
  SELECT * INTO v_claim FROM public.claim_deal(v_uid, v_did);
  v_otp := v_claim.otp_code;
  v_claim_rid := v_claim.redemption_id;

  ASSERT v_otp ~ '^[0-9]{6}$', format('claim: otp is not a server-issued 6-digit code: %s', v_otp);
  ASSERT v_claim.redemption_expires_at = v_deal_end + INTERVAL '15 minutes',
    format('claim: code expiry must be deal end + 15 min grace, got %s', v_claim.redemption_expires_at);

  SELECT * INTO v_redemption FROM public.redemptions WHERE id = v_claim_rid;
  ASSERT v_redemption.status = 'pending', format('claim: redemption should be pending, got %s', v_redemption.status);
  ASSERT v_redemption.merchant_id = v_mid, 'claim: redemption bound to the wrong merchant';

  -- 2) Merchant verifies the code → green-takeover data (server-computed).
  SELECT * INTO v_verify FROM public.verify_redemption(v_mid, v_otp);
  ASSERT v_verify.redemption_status = 'success', format('verify: status = %s', v_verify.redemption_status);
  ASSERT v_verify.fee_charge_status = 'charged', format('verify: fee = %s', v_verify.fee_charge_status);
  ASSERT v_verify.new_balance = 70, format('verify: wallet after should be 70, got %s', v_verify.new_balance);
  ASSERT v_verify.redemption_id = v_claim_rid, 'verify: returned a different redemption than was claimed';
  ASSERT v_verify.deal_claims_count = 1, format('verify: deal claims count should be 1, got %s', v_verify.deal_claims_count);

  -- 3) Ledger row present, and its reference == the redemption reference
  --    (the "one movement, one ID, findable in two places" invariant §12).
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT v_fee_rows = 1, format('ledger: expected exactly one success_fee row, got %s', v_fee_rows);

  SELECT * INTO v_tx FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT v_tx.amount = -30, format('ledger: fee amount = %s', v_tx.amount);
  ASSERT v_tx.reference_id = v_claim_rid,
    format('ledger: reference_id (%s) must match the redemption id (%s)', v_tx.reference_id, v_claim_rid);

  -- 4) Wallet math persisted; shopper now sees REDEEMED (same reference).
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 70, format('wallet: persisted balance = %s (100 - 30)', v_balance);

  SELECT * INTO v_redemption FROM public.redemptions WHERE id = v_claim_rid;
  ASSERT v_redemption.status = 'success', format('shopper: redemption should read success/REDEEMED, got %s', v_redemption.status);
  ASSERT v_redemption.redeemed_at IS NOT NULL, 'shopper: redeemed_at not stamped';

  -- Cleanup.
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Golden path passed: claim → verify → ledger, one reference across redemption and ledger, wallet math correct.';
END $$;
