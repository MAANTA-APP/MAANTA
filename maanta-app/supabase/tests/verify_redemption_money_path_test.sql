-- ============================================================
-- Test: verify_redemption money-path invariants (ENGINEERING_NOTES §2, §8.4)
--
-- Covers the three money-path guarantees that had no dedicated coverage:
--   1. Idempotency / one-winner: a code verifies exactly once. A second
--      verify of the same code raises the typed already-used failure and
--      does NOT write a second success_fee row (no double charge). This is
--      the observable invariant behind the concurrent double-verify rule —
--      the row lock (SELECT … FOR UPDATE) + the `WHERE status = 'pending'`
--      guard mean the loser can never charge twice.
--   2. Owed: verifying at balance 20 (< the KES 30 fee) records arrears,
--      leaves the balance untouched, and reports fee_charge_status = 'owed'.
--      The redemption still succeeds (never wallet-gated).
--   3. Unknown: if the fee step itself errors (here: a redemption whose
--      stored fee does not match the canonical KES 30, which the fee RPC
--      rejects), the redemption STILL succeeds, fee_charge_status =
--      'unknown' (never silently 'owed'), and an admin-visible
--      agent_tasks fraud_review/high row is created.
--
-- Self-contained and self-cleaning, same shape as
-- success_fee_reference_link_test.sql. verify_redemption is
-- service_role/owner/admin-gated; production calls it with the service-role
-- key, which we reproduce here.
--   psql "$DATABASE_URL" -f supabase/tests/verify_redemption_money_path_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario 1: idempotency / one-winner — a code redeems exactly once.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_status TEXT;
  v_fee_status TEXT;
  v_new_balance NUMERIC;
  v_balance NUMERIC;
  v_fee_rows INT;
  v_second_raised BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_mp_idem', 'test.mp.idem', '+254700000201', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal idem', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '100001', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  -- First verify wins.
  SELECT redemption_status, fee_charge_status, new_balance
    INTO v_status, v_fee_status, v_new_balance
    FROM public.verify_redemption(v_mid, '100001');
  ASSERT v_status = 'success',    format('1: first verify status = %s', v_status);
  ASSERT v_fee_status = 'charged', format('1: first verify fee = %s', v_fee_status);
  ASSERT v_new_balance = 70,       format('1: first verify balance = %s', v_new_balance);

  -- Second verify of the SAME code must raise the typed already-used failure.
  BEGIN
    PERFORM public.verify_redemption(v_mid, '100001');
  EXCEPTION WHEN OTHERS THEN
    v_second_raised := true;
    ASSERT SQLERRM LIKE '%not_found_or_already_used%',
      format('1: second verify raised the wrong error: %s', SQLERRM);
  END;
  ASSERT v_second_raised, '1: second verify did NOT raise — double redemption possible!';

  -- No double charge: exactly one success_fee ledger row, balance still 70.
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT v_fee_rows = 1, format('1: expected exactly 1 success_fee row, got %s', v_fee_rows);
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 70, format('1: balance moved twice — got %s, expected 70', v_balance);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 1 passed: code redeems exactly once, no double charge';
END $$;

-- Scenario 2: owed — verify at balance 20 records arrears, balance untouched.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_fee_status TEXT;
  v_new_balance NUMERIC;
  v_new_arrears NUMERIC;
  v_balance NUMERIC;
  v_arrears NUMERIC;
  v_tx RECORD;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_mp_owed', 'test.mp.owed', '+254700000202', 'BBS Mall', 'active', 20)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal owed', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '200002', 'pending', NOW() + INTERVAL '1 hour', 30);

  SELECT fee_charge_status, new_balance, new_arrears
    INTO v_fee_status, v_new_balance, v_new_arrears
    FROM public.verify_redemption(v_mid, '200002');

  ASSERT v_fee_status = 'owed', format('2: fee_charge_status = %s (expected owed)', v_fee_status);
  ASSERT v_new_balance = 20,    format('2: balance should be untouched at 20, got %s', v_new_balance);
  ASSERT v_new_arrears = 30,    format('2: arrears should be 30, got %s', v_new_arrears);

  -- Persisted state matches the RPC return.
  SELECT account_balance, outstanding_arrears INTO v_balance, v_arrears
    FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 20, format('2: persisted balance = %s (never negative, never debited below fee)', v_balance);
  ASSERT v_arrears = 30, format('2: persisted arrears = %s', v_arrears);

  -- A ledger row is written in the arrears case too.
  SELECT * INTO v_tx FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee_arrears';
  ASSERT FOUND, '2: no success_fee_arrears ledger row written';

  -- And NO ordinary success_fee (charged) row exists.
  PERFORM 1 FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT NOT FOUND, '2: a charged success_fee row was written despite insufficient balance';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 2 passed: owed → arrears recorded, balance untouched, ledger row written';
END $$;

-- Scenario 3: unknown — fee step errors → redemption still succeeds, status
-- 'unknown' (never 'owed'), fraud_review/high task raised.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_status TEXT;
  v_fee_status TEXT;
  v_new_balance NUMERIC;
  v_redemption_status TEXT;
  v_task RECORD;
  v_fee_rows INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_mp_unknown', 'test.mp.unknown', '+254700000203', 'BBS Mall', 'active', 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url)
    VALUES (v_mid, '__test deal unknown', 'x') RETURNING id INTO v_did;
  -- success_fee_charged = 25 ≠ canonical KES 30 → the fee RPC rejects it,
  -- which verify_redemption catches and reports as 'unknown'.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '300003', 'pending', NOW() + INTERVAL '1 hour', 25)
    RETURNING id INTO v_rid;

  SELECT redemption_status, fee_charge_status, new_balance
    INTO v_status, v_fee_status, v_new_balance
    FROM public.verify_redemption(v_mid, '300003');

  ASSERT v_status = 'success',    format('3: redemption must still succeed, got %s', v_status);
  ASSERT v_fee_status = 'unknown', format('3: fee_charge_status = %s (must be unknown, never owed)', v_fee_status);
  ASSERT v_new_balance IS NULL,    format('3: unknown must not report a balance, got %s', v_new_balance);

  -- The redemption row is committed as success regardless of the fee failure.
  SELECT status INTO v_redemption_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_redemption_status = 'success', format('3: redemption row status = %s', v_redemption_status);

  -- Unknown is NOT arrears: no success_fee and no success_fee_arrears row.
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type IN ('success_fee', 'success_fee_arrears');
  ASSERT v_fee_rows = 0, format('3: unknown must write no fee ledger row, got %s', v_fee_rows);

  -- An admin-visible fraud_review/high task is created.
  SELECT * INTO v_task FROM public.agent_tasks
    WHERE merchant_id = v_mid AND task_type = 'fraud_review' AND priority = 'high';
  ASSERT FOUND, '3: no fraud_review/high agent_tasks row created for unknown fee status';

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 3 passed: unknown → success + fraud_review task, never treated as owed';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL verify_redemption money-path scenarios passed.'; END $$;
