-- ============================================================
-- Test: Guardian v1 hard-block appeals (docs/maanta-guardian-v1.md §3)
--
-- Drives an AUTHENTIC hard-block (geofence > 2 km → verify declines, no fee),
-- then exercises admin_appeal_hard_block:
--   A. approve  → failed→success + KES 30 fee via the frozen money path.
--   B. reject   → stays failed, no fee; a second appeal is refused.
--   C. guard    → a plain 'failed' redemption (no guardian_hard_block) is not
--                 appealable and no money moves.
--   D. authz    → a non-admin caller is refused.
--
-- Self-contained and self-cleaning, same shape as guardian_v1_test.sql.
--   psql "$DATABASE_URL" -f supabase/tests/guardian_hard_block_appeal_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: appeal APPROVE → complete + charge the fee.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID;
  v_status TEXT; v_rec TEXT; v_row_status TEXT; v_balance NUMERIC; v_fee_rows INT;
  v_ap_status TEXT; v_ap_fee TEXT; v_ap_balance NUMERIC; v_flags TEXT[];
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_ap_ok', 'test.ap.ok', '+254700000601', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__ap ok', 'x') RETURNING id INTO v_did;
  -- 3000 m > 2 km hard threshold → verify hard-blocks (declines, no fee).
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, distance_from_shop)
    VALUES (v_did, v_mid, v_uid, '610001', 'pending', NOW() + INTERVAL '1 hour', 30, 3000) RETURNING id INTO v_rid;

  SELECT redemption_status, guardian_recommendation INTO v_status, v_rec
    FROM public.verify_redemption(v_mid, '610001');
  ASSERT v_status = 'blocked',   format('A: verify status = %s (expected blocked)', v_status);
  ASSERT v_rec = 'hard_block',   format('A: recommendation = %s', v_rec);

  SELECT status, fraud_flags INTO v_row_status, v_flags FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'failed', format('A: declined row status = %s', v_row_status);
  ASSERT v_flags @> ARRAY['guardian_hard_block'], 'A: hard-block flag missing';
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('A: balance moved on hard-block — got %s', v_balance);

  -- Appeal APPROVE → success + fee charged.
  SELECT redemption_status, fee_charge_status, new_balance
    INTO v_ap_status, v_ap_fee, v_ap_balance
    FROM public.admin_appeal_hard_block(v_rid, true);
  ASSERT v_ap_status = 'success', format('A: appeal status = %s', v_ap_status);
  ASSERT v_ap_fee = 'charged',    format('A: appeal fee = %s', v_ap_fee);
  ASSERT v_ap_balance = 70,       format('A: appeal balance = %s (fee applied)', v_ap_balance);

  SELECT status, fraud_flags INTO v_row_status, v_flags FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'success', format('A: completed row status = %s', v_row_status);
  ASSERT v_flags @> ARRAY['guardian_appeal_approved'], 'A: appeal-approved flag missing';
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT v_fee_rows = 1, format('A: expected exactly 1 success_fee row, got %s', v_fee_rows);

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;   -- cascades guardian_events
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: hard-block appeal approve → success + KES 30 fee';
END $$;

-- Scenario B: appeal REJECT → stays failed, no fee; second appeal refused.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID;
  v_ap_status TEXT; v_ap_fee TEXT; v_row_status TEXT; v_balance NUMERIC; v_fee_rows INT;
  v_flags TEXT[]; v_raised BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_ap_no', 'test.ap.no', '+254700000602', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__ap no', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, distance_from_shop)
    VALUES (v_did, v_mid, v_uid, '620002', 'pending', NOW() + INTERVAL '1 hour', 30, 3000) RETURNING id INTO v_rid;
  PERFORM public.verify_redemption(v_mid, '620002');

  SELECT redemption_status, fee_charge_status INTO v_ap_status, v_ap_fee
    FROM public.admin_appeal_hard_block(v_rid, false);
  ASSERT v_ap_status = 'failed', format('B: reject status = %s', v_ap_status);
  ASSERT v_ap_fee IS NULL,       format('B: reject fee = %s (must be NULL)', v_ap_fee);

  SELECT status, fraud_flags INTO v_row_status, v_flags FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'failed', format('B: row status = %s (must stay failed)', v_row_status);
  ASSERT v_flags @> ARRAY['guardian_appeal_rejected'], 'B: appeal-rejected flag missing';
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('B: balance moved on a rejected appeal — got %s', v_balance);
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type IN ('success_fee','success_fee_arrears');
  ASSERT v_fee_rows = 0, format('B: a fee row was written on a rejected appeal, got %s', v_fee_rows);

  -- A second appeal on an already-rejected redemption is refused.
  BEGIN
    PERFORM public.admin_appeal_hard_block(v_rid, true);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%not_appealable%', format('B: wrong error on re-appeal: %s', SQLERRM);
  END;
  ASSERT v_raised, 'B: re-appealing an upheld block did NOT raise';

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario B passed: reject keeps it declined, no fee; re-appeal refused';
END $$;

-- Scenario C: a plain failed redemption (no guardian_hard_block) is NOT appealable.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID;
  v_balance NUMERIC; v_row_status TEXT; v_raised BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_ap_guard', 'test.ap.guard', '+254700000603', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__ap guard', 'x') RETURNING id INTO v_did;
  -- A redemption that failed for an ordinary reason (expired/rejected), no flag.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '630003', 'failed', NOW() + INTERVAL '1 hour', 30) RETURNING id INTO v_rid;

  BEGIN
    PERFORM public.admin_appeal_hard_block(v_rid, true);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%not_appealable%', format('C: wrong error: %s', SQLERRM);
  END;
  ASSERT v_raised, 'C: appealing a non-hard-blocked failure did NOT raise';

  SELECT status INTO v_row_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'failed', format('C: row status changed to %s', v_row_status);
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('C: balance moved — got %s', v_balance);

  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario C passed: a non-hard-blocked failure is not appealable';
END $$;

-- Scenario D: a non-admin caller is refused.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID; v_raised BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_ap_authz', 'test.ap.authz', '+254700000604', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__ap authz', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, distance_from_shop)
    VALUES (v_did, v_mid, v_uid, '640004', 'pending', NOW() + INTERVAL '1 hour', 30, 3000) RETURNING id INTO v_rid;
  PERFORM public.verify_redemption(v_mid, '640004');

  -- Drop to a non-service, non-admin caller.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_appeal_hard_block(v_rid, true);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%unauthorized%', format('D: wrong error: %s', SQLERRM);
  END;
  ASSERT v_raised, 'D: non-admin appeal did NOT raise unauthorized';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario D passed: non-admin caller refused';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL Guardian hard-block appeal scenarios passed.'; END $$;
