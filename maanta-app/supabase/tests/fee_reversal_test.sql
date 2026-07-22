-- ============================================================
-- Test: admin fee-reversal wallet credit (frozen policy 2026-07-22).
--
-- Covers reverse_success_fee end to end:
--   1. Charged → reversal credits the wallet by the fee, writes a fee_reversal
--      ledger row + an audit row, and leaves the ORIGINAL success_fee row and
--      the redemption row untouched.
--   2. Idempotency → a second reversal of the same redemption raises
--      already_reversed and writes no second credit.
--   3. Arrears → reversal settles standing arrears first (arrears 30 → 0),
--      balance untouched, and an arrears_settlement leg is written.
--   4. No fee to reverse → an unknown-fee redemption (no fee ledger row) is
--      rejected with no_fee_to_reverse; no credit is written.
--   5. Approver must be an admin → a non-admin approver id is rejected.
--
-- reverse_success_fee is service_role/admin-gated; production calls it with the
-- service-role key (from the admin route, after requireAdminApi), passing the
-- authenticated admin's id as the approver. We reproduce that here.
--   psql "$DATABASE_URL" -f supabase/tests/fee_reversal_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario 1: charged → wallet credited, originals intact.
DO $$
DECLARE
  v_uid   UUID;
  v_admin UUID;
  v_mid   UUID;
  v_did   UUID;
  v_rid   UUID;
  v_rev   RECORD;
  v_balance NUMERIC;
  v_fee_rows INT;
  v_credit_rows INT;
  v_audit RECORD;
  v_red_status TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.users (role, full_name) VALUES ('admin', '__test admin') RETURNING id INTO v_admin;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fr_charged', 'test.fr.charged', '+254700000301', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal fr charged', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '400001', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  -- Verify to create the real success_fee ledger row (balance 100 → 70).
  PERFORM public.verify_redemption(v_mid, '400001');
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 70, format('1: post-verify balance = %s (expected 70)', v_balance);

  -- Reverse.
  SELECT * INTO v_rev FROM public.reverse_success_fee(v_rid, v_admin, '7', 'shopper redeemed, merchant honoured deal');

  ASSERT v_rev.amount = 30,       format('1: reversal amount = %s', v_rev.amount);
  ASSERT v_rev.new_balance = 100, format('1: post-reversal balance = %s (expected 100)', v_rev.new_balance);
  ASSERT v_rev.new_arrears = 0,   format('1: post-reversal arrears = %s (expected 0)', v_rev.new_arrears);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('1: persisted balance = %s (fee credited back)', v_balance);

  -- Original success_fee row STILL there and unchanged (exactly one, -30).
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee' AND amount = -30;
  ASSERT v_fee_rows = 1, format('1: original success_fee row altered/removed (got %s)', v_fee_rows);

  -- Exactly one fee_reversal credit (+30), linked to the redemption.
  SELECT count(*) INTO v_credit_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'fee_reversal'
      AND amount = 30 AND reference_id = v_rid;
  ASSERT v_credit_rows = 1, format('1: expected 1 fee_reversal credit linked to redemption, got %s', v_credit_rows);

  -- Audit row written with the right fields.
  SELECT * INTO v_audit FROM public.fee_reversals WHERE redemption_id = v_rid;
  ASSERT FOUND, '1: no fee_reversals audit row written';
  ASSERT v_audit.amount = 30,               format('1: audit amount = %s', v_audit.amount);
  ASSERT v_audit.approver_user_id = v_admin, '1: audit approver mismatch';
  ASSERT v_audit.incident_ref = '7',        format('1: audit incident_ref = %s', v_audit.incident_ref);
  ASSERT v_audit.redemption_code = '400001', format('1: audit code = %s', v_audit.redemption_code);

  -- Redemption row itself untouched (still success).
  SELECT status INTO v_red_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_red_status = 'success', format('1: redemption status changed to %s', v_red_status);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_admin);
  RAISE NOTICE 'Scenario 1 passed: charged → wallet credited, originals intact';
END $$;

-- Scenario 2: idempotency — a redemption's fee reverses at most once.
DO $$
DECLARE
  v_uid   UUID;
  v_admin UUID;
  v_mid   UUID;
  v_did   UUID;
  v_rid   UUID;
  v_raised BOOLEAN := false;
  v_credit_rows INT;
  v_balance NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.users (role) VALUES ('admin') RETURNING id INTO v_admin;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fr_idem', 'test.fr.idem', '+254700000302', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal fr idem', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '400002', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  PERFORM public.verify_redemption(v_mid, '400002');
  PERFORM public.reverse_success_fee(v_rid, v_admin);   -- first reversal wins

  BEGIN
    PERFORM public.reverse_success_fee(v_rid, v_admin);  -- second must fail
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%already_reversed%', format('2: wrong error: %s', SQLERRM);
  END;
  ASSERT v_raised, '2: second reversal did NOT raise — double credit possible!';

  -- Only ONE fee_reversal credit, balance credited exactly once (70 → 100).
  SELECT count(*) INTO v_credit_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'fee_reversal';
  ASSERT v_credit_rows = 1, format('2: expected exactly 1 credit, got %s', v_credit_rows);
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('2: balance credited twice — got %s, expected 100', v_balance);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_admin);
  RAISE NOTICE 'Scenario 2 passed: one reversal per redemption, no double credit';
END $$;

-- Scenario 3: arrears → reversal settles arrears first, balance untouched.
DO $$
DECLARE
  v_uid   UUID;
  v_admin UUID;
  v_mid   UUID;
  v_did   UUID;
  v_rid   UUID;
  v_rev   RECORD;
  v_settle_rows INT;
  v_balance NUMERIC;
  v_arrears NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.users (role) VALUES ('admin') RETURNING id INTO v_admin;
  -- Balance 20 < KES 30 fee → verify records 30 arrears, balance stays 20.
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fr_arrears', 'test.fr.arrears', '+254700000303', 'BBS Mall', 'active', 20)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal fr arrears', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '400003', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  PERFORM public.verify_redemption(v_mid, '400003');
  SELECT account_balance, outstanding_arrears INTO v_balance, v_arrears
    FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 20 AND v_arrears = 30,
    format('3: pre-reversal state balance=%s arrears=%s (expected 20/30)', v_balance, v_arrears);

  SELECT * INTO v_rev FROM public.reverse_success_fee(v_rid, v_admin, 'A2');

  ASSERT v_rev.new_arrears = 0,  format('3: arrears not settled — got %s', v_rev.new_arrears);
  ASSERT v_rev.new_balance = 20, format('3: balance moved — got %s (expected 20, credit clears arrears)', v_rev.new_balance);

  SELECT account_balance, outstanding_arrears INTO v_balance, v_arrears
    FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 20, format('3: persisted balance = %s', v_balance);
  ASSERT v_arrears = 0,  format('3: persisted arrears = %s', v_arrears);

  -- The settlement leg is written (mirrors the top-up settle-first row).
  SELECT count(*) INTO v_settle_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'arrears_settlement' AND amount = -30;
  ASSERT v_settle_rows = 1, format('3: expected 1 arrears_settlement row, got %s', v_settle_rows);

  DELETE FROM public.fee_reversals WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_admin);
  RAISE NOTICE 'Scenario 3 passed: arrears settled first, balance untouched';
END $$;

-- Scenario 4: no fee to reverse — unknown-fee redemption is rejected.
DO $$
DECLARE
  v_uid   UUID;
  v_admin UUID;
  v_mid   UUID;
  v_did   UUID;
  v_rid   UUID;
  v_raised BOOLEAN := false;
  v_credit_rows INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.users (role) VALUES ('admin') RETURNING id INTO v_admin;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fr_nofee', 'test.fr.nofee', '+254700000304', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal fr nofee', 'x') RETURNING id INTO v_did;
  -- Fee 25 ≠ canonical 30 → the fee RPC rejects it → verify reports 'unknown'
  -- and writes NO fee ledger row.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '400004', 'pending', NOW() + INTERVAL '1 hour', 25)
    RETURNING id INTO v_rid;

  PERFORM public.verify_redemption(v_mid, '400004');

  BEGIN
    PERFORM public.reverse_success_fee(v_rid, v_admin);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%no_fee_to_reverse%', format('4: wrong error: %s', SQLERRM);
  END;
  ASSERT v_raised, '4: reversal of an unknown-fee redemption did NOT raise';

  SELECT count(*) INTO v_credit_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'fee_reversal';
  ASSERT v_credit_rows = 0, format('4: a credit was written for an unknown fee (got %s)', v_credit_rows);

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fee_reversals WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_admin);
  RAISE NOTICE 'Scenario 4 passed: unknown fee → no_fee_to_reverse, no credit';
END $$;

-- Scenario 5: approver must be an admin.
DO $$
DECLARE
  v_uid   UUID;
  v_mid   UUID;
  v_did   UUID;
  v_rid   UUID;
  v_raised BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_fr_approver', 'test.fr.approver', '+254700000305', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal fr approver', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '400005', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;
  PERFORM public.verify_redemption(v_mid, '400005');

  -- Approver is the customer (not an admin) → rejected.
  BEGIN
    PERFORM public.reverse_success_fee(v_rid, v_uid);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%invalid_approver%', format('5: wrong error: %s', SQLERRM);
  END;
  ASSERT v_raised, '5: a non-admin approver was accepted';

  DELETE FROM public.fee_reversals WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 5 passed: non-admin approver rejected';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL fee-reversal scenarios passed.'; END $$;
