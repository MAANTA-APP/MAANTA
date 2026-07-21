-- ============================================================
-- Test: Guardian v1 redemption-time checks (docs/maanta-guardian-v1.md)
--
-- Drives verify_redemption through every Guardian outcome and asserts:
--   * the resulting redemption status,
--   * the guardian_events audit rows + overall recommendation,
--   * the money-path records for each outcome (frozen 3-state fee model on
--     clear/flag and on admin release; NO fee movement on held/blocked).
--
-- Deterministic: histories use intervals relative to NOW() (no absolute
-- wall-clock dependence), and guardian_evaluate takes an injectable clock.
-- Self-contained and self-cleaning, same shape as
-- verify_redemption_money_path_test.sql. verify_redemption is
-- service_role/owner/admin-gated; production calls it with the service-role
-- key, reproduced here.
--   psql "$DATABASE_URL" -f supabase/tests/guardian_v1_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario 1: CLEAR — a single normal redemption proceeds exactly as today.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID;
  v_status TEXT; v_fee_status TEXT; v_new_balance NUMERIC; v_rec TEXT; v_sev TEXT;
  v_overall TEXT; v_block_rows INT; v_balance NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_g_clear', 'test.g.clear', '+254700000501', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__g clear', 'x') RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '510001', 'pending', NOW() + INTERVAL '1 hour', 30) RETURNING id INTO v_rid;

  SELECT redemption_status, fee_charge_status, new_balance, guardian_recommendation, guardian_severity
    INTO v_status, v_fee_status, v_new_balance, v_rec, v_sev
    FROM public.verify_redemption(v_mid, '510001');

  ASSERT v_status = 'success',     format('1: status = %s', v_status);
  ASSERT v_fee_status = 'charged', format('1: fee = %s', v_fee_status);
  ASSERT v_new_balance = 70,       format('1: balance = %s', v_new_balance);
  ASSERT v_rec = 'clear',          format('1: recommendation = %s', v_rec);
  ASSERT v_sev = 'info',           format('1: severity = %s', v_sev);

  -- Guardian overall row logged 'clear'; no block/warn check rows.
  SELECT recommendation INTO v_overall FROM public.guardian_events
    WHERE redemption_id = v_rid AND check_type = 'overall';
  ASSERT v_overall = 'clear', format('1: overall guardian_events row = %s', v_overall);
  SELECT count(*) INTO v_block_rows FROM public.guardian_events
    WHERE redemption_id = v_rid AND severity IN ('warn','block');
  ASSERT v_block_rows = 0, format('1: expected no warn/block rows, got %s', v_block_rows);

  -- Money moved exactly once.
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 70, format('1: persisted balance = %s', v_balance);

  DELETE FROM public.guardian_events WHERE redemption_id = v_rid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 1 passed: CLEAR → success, fee charged, guardian clear';
END $$;

-- Scenario 2: ALLOW + FLAG (geofence warn) — verify-anyway preserved. The
-- redemption STILL succeeds and the KES 30 fee STILL moves (frozen rule); a
-- guardian warn row + dispute are logged.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID;
  v_status TEXT; v_fee_status TEXT; v_new_balance NUMERIC; v_rec TEXT; v_disputed BOOLEAN;
  v_warn INT; v_fee_rows INT; v_row_status TEXT; v_review BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_g_flag', 'test.g.flag', '+254700000502', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__g flag', 'x') RETURNING id INTO v_did;
  -- distance 300m > 250m warn threshold, < 2000m hard threshold → geofence warn.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, distance_from_shop)
    VALUES (v_did, v_mid, v_uid, '520002', 'pending', NOW() + INTERVAL '1 hour', 30, 300) RETURNING id INTO v_rid;

  SELECT redemption_status, fee_charge_status, new_balance, guardian_recommendation, disputed
    INTO v_status, v_fee_status, v_new_balance, v_rec, v_disputed
    FROM public.verify_redemption(v_mid, '520002');

  ASSERT v_status = 'success',     format('2: status = %s (verify-anyway must still succeed)', v_status);
  ASSERT v_fee_status = 'charged', format('2: fee = %s (flag must NOT stop the fee)', v_fee_status);
  ASSERT v_new_balance = 70,       format('2: balance = %s (fee still moved)', v_new_balance);
  ASSERT v_rec = 'flag',           format('2: recommendation = %s', v_rec);
  ASSERT v_disputed = true,        '2: flagged redemption must report disputed = true';

  -- A geofence warn guardian_event exists; redemption row carries review_required.
  SELECT count(*) INTO v_warn FROM public.guardian_events
    WHERE redemption_id = v_rid AND check_type = 'geofence' AND severity = 'warn';
  ASSERT v_warn = 1, format('2: expected 1 geofence warn row, got %s', v_warn);
  SELECT status, review_required INTO v_row_status, v_review FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'success', format('2: row status = %s', v_row_status);
  ASSERT v_review = true, '2: review_required must be set on a flagged verify';

  -- Money-path: exactly one charged success_fee row (frozen model intact).
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT v_fee_rows = 1, format('2: expected 1 success_fee row, got %s', v_fee_rows);

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE redemption_id = v_rid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 2 passed: ALLOW+FLAG → success + fee moves + guardian warn + dispute';
END $$;

-- Scenario 3: HARD-BLOCK (geofence > 2 km) — declined. NO money moves.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID;
  v_status TEXT; v_fee_status TEXT; v_rec TEXT; v_disputed BOOLEAN;
  v_block INT; v_fee_rows INT; v_row_status TEXT; v_balance NUMERIC; v_overall TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_g_hard', 'test.g.hard', '+254700000503', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__g hard', 'x') RETURNING id INTO v_did;
  -- distance 3000m > 2000m hard threshold → geofence hard block.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, distance_from_shop)
    VALUES (v_did, v_mid, v_uid, '530003', 'pending', NOW() + INTERVAL '1 hour', 30, 3000) RETURNING id INTO v_rid;

  SELECT redemption_status, fee_charge_status, guardian_recommendation, disputed
    INTO v_status, v_fee_status, v_rec, v_disputed
    FROM public.verify_redemption(v_mid, '530003');

  ASSERT v_status = 'blocked',     format('3: status = %s (hard block must be declined)', v_status);
  ASSERT v_fee_status IS NULL,     format('3: fee_charge_status = %s (must be NULL — no fee decision)', v_fee_status);
  ASSERT v_rec = 'hard_block',     format('3: recommendation = %s', v_rec);
  ASSERT v_disputed = true,        '3: hard block must report disputed = true';

  -- Persisted redemption row is FAILED; balance untouched; no fee ledger row.
  SELECT status INTO v_row_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'failed', format('3: persisted row status = %s (declined)', v_row_status);
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('3: balance moved on a hard block — got %s, expected 100', v_balance);
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type IN ('success_fee','success_fee_arrears');
  ASSERT v_fee_rows = 0, format('3: a fee ledger row was written on a hard block, got %s', v_fee_rows);

  -- Guardian audit: geofence block row + overall hard_block.
  SELECT count(*) INTO v_block FROM public.guardian_events
    WHERE redemption_id = v_rid AND check_type = 'geofence' AND severity = 'block';
  ASSERT v_block = 1, format('3: expected 1 geofence block row, got %s', v_block);
  SELECT recommendation INTO v_overall FROM public.guardian_events
    WHERE redemption_id = v_rid AND check_type = 'overall';
  ASSERT v_overall = 'hard_block', format('3: overall = %s', v_overall);

  -- Admin detail hook surfaces the recommendation + events.
  PERFORM 1 FROM public.admin_redemption_detail(v_rid)
    WHERE guardian_recommendation = 'hard_block' AND jsonb_array_length(guardian_events) >= 2;
  ASSERT FOUND, '3: admin_redemption_detail did not surface guardian recommendation/events';

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE redemption_id = v_rid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 3 passed: HARD-BLOCK → declined, no money, guardian block + admin detail';
END $$;

-- Scenario 4: HARD-BLOCK via shopper velocity (≥8 successful redemptions in
-- 10 min). Isolated to velocity_shopper by spreading priors across deals (all
-- inactive, so the same-deal and deal-limit gates stay out of the way).
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_od UUID; v_rid UUID; i INT;
  v_status TEXT; v_rec TEXT; v_vs INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_g_vs', 'test.g.vs', '+254700000504', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active) VALUES (v_mid, '__g vs current', 'x', false) RETURNING id INTO v_did;

  -- 7 prior SUCCESS redemptions for the same shopper, each on its own deal,
  -- all within the 10-minute shopper window. count = 7 + current = 8 → hard.
  FOR i IN 1..7 LOOP
    INSERT INTO public.deals (merchant_id, title, image_url, is_active) VALUES (v_mid, '__g vs prior '||i, 'x', false) RETURNING id INTO v_od;
    INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, redeemed_at)
      VALUES (v_od, v_mid, v_uid, '54000'||i, 'success', NOW() + INTERVAL '1 hour', 30, NOW() - INTERVAL '2 minutes');
  END LOOP;

  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '540008', 'pending', NOW() + INTERVAL '1 hour', 30) RETURNING id INTO v_rid;

  SELECT redemption_status, guardian_recommendation
    INTO v_status, v_rec FROM public.verify_redemption(v_mid, '540008');

  ASSERT v_status = 'blocked',  format('4: status = %s', v_status);
  ASSERT v_rec = 'hard_block',  format('4: recommendation = %s', v_rec);
  SELECT (metadata->>'count')::int INTO v_vs FROM public.guardian_events
    WHERE redemption_id = v_rid AND check_type = 'velocity_shopper' AND severity = 'block';
  ASSERT v_vs = 8, format('4: velocity_shopper block count = %s (expected 8)', v_vs);

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 4 passed: HARD-BLOCK via shopper velocity (8/10min)';
END $$;

-- Scenario 5: SOFT-BLOCK (deal velocity) → held, no fee. Then admin release
-- (approve) completes it and applies the fee through the frozen money path.
DO $$
DECLARE
  v_uid UUID; v_mid UUID; v_did UUID; v_rid UUID; i INT;
  v_status TEXT; v_fee_status TEXT; v_rec TEXT;
  v_row_status TEXT; v_balance NUMERIC; v_fee_rows INT;
  v_rel_status TEXT; v_rel_fee TEXT; v_rel_balance NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_g_soft', 'test.g.soft', '+254700000505', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__g soft', 'x') RETURNING id INTO v_did;

  -- 5 prior SUCCESS redemptions by the SAME shopper on the SAME deal within the
  -- 60-min deal window. count = 5 + current = 6 → velocity_deal SOFT block
  -- (shopper velocity is only 6 < the hard threshold of 8, so this holds, not
  -- declines — exactly the soft-block intent).
  FOR i IN 1..5 LOOP
    INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, redeemed_at)
      VALUES (v_did, v_mid, v_uid, '55000'||i, 'success', NOW() + INTERVAL '1 hour', 30, NOW() - INTERVAL '5 minutes');
  END LOOP;

  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '550006', 'pending', NOW() + INTERVAL '1 hour', 30) RETURNING id INTO v_rid;

  SELECT redemption_status, fee_charge_status, guardian_recommendation
    INTO v_status, v_fee_status, v_rec FROM public.verify_redemption(v_mid, '550006');

  ASSERT v_status = 'held',      format('5: status = %s (soft block must be held)', v_status);
  ASSERT v_fee_status IS NULL,   format('5: fee = %s (held → no fee decision)', v_fee_status);
  ASSERT v_rec = 'soft_block',   format('5: recommendation = %s', v_rec);

  -- Persisted row is 'flagged'; no fee moved yet.
  SELECT status INTO v_row_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'flagged', format('5: held row status = %s', v_row_status);
  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 100, format('5: balance moved before release — got %s', v_balance);
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type IN ('success_fee','success_fee_arrears');
  ASSERT v_fee_rows = 0, format('5: fee row written before release, got %s', v_fee_rows);

  -- Admin override path: approve the release → success + fee charged.
  SELECT redemption_status, fee_charge_status, new_balance
    INTO v_rel_status, v_rel_fee, v_rel_balance
    FROM public.admin_release_redemption(v_rid, true);

  ASSERT v_rel_status = 'success', format('5: release status = %s', v_rel_status);
  ASSERT v_rel_fee = 'charged',    format('5: release fee = %s', v_rel_fee);
  ASSERT v_rel_balance = 70,       format('5: release balance = %s (fee applied on release)', v_rel_balance);
  SELECT status INTO v_row_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_row_status = 'success', format('5: released row status = %s', v_row_status);
  SELECT count(*) INTO v_fee_rows FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND transaction_type = 'success_fee';
  ASSERT v_fee_rows = 1, format('5: expected exactly 1 success_fee row after release, got %s', v_fee_rows);

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario 5 passed: SOFT-BLOCK → held, no fee; admin release → success + fee';
END $$;

-- Scenario 6: COLLUSION — a tiny distinct-user set (2) cycling one deal at one
-- merchant in the collusion window trips a collusion block → soft-block held.
DO $$
DECLARE
  v_ua UUID; v_ub UUID; v_mid UUID; v_did UUID; v_rid UUID; i INT;
  v_status TEXT; v_rec TEXT; v_col INT; v_t INT; v_d INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_ua;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_ub;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_g_col', 'test.g.col', '+254700000506', 'BBS Mall', 'active', 100) RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url) VALUES (v_mid, '__g col', 'x') RETURNING id INTO v_did;

  -- 7 prior SUCCESS redemptions on the same deal/merchant, only 2 distinct
  -- users, set OUTSIDE the 10-min shopper window but INSIDE the 30-min
  -- collusion window. total = 7 + current = 8, distinct = 2 → collusion SOFT.
  FOR i IN 1..7 LOOP
    INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, redeemed_at)
      VALUES (v_did, v_mid, CASE WHEN i % 2 = 0 THEN v_ua ELSE v_ub END,
              '56000'||i, 'success', NOW() + INTERVAL '1 hour', 30, NOW() - INTERVAL '20 minutes');
  END LOOP;

  -- current redemption by user A.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_ua, '560008', 'pending', NOW() + INTERVAL '1 hour', 30) RETURNING id INTO v_rid;

  SELECT redemption_status, guardian_recommendation
    INTO v_status, v_rec FROM public.verify_redemption(v_mid, '560008');

  ASSERT v_status = 'held',    format('6: status = %s (collusion soft block → held)', v_status);
  ASSERT v_rec = 'soft_block', format('6: recommendation = %s', v_rec);

  -- A collusion block guardian_event is present with the expected counts.
  SELECT count(*), max((metadata->>'total')::int), max((metadata->>'distinct_users')::int)
    INTO v_col, v_t, v_d
    FROM public.guardian_events
    WHERE redemption_id = v_rid AND check_type = 'collusion' AND severity = 'block';
  ASSERT v_col = 1, format('6: expected 1 collusion block row, got %s', v_col);
  ASSERT v_t = 8, format('6: collusion total = %s (expected 8)', v_t);
  ASSERT v_d = 2, format('6: collusion distinct_users = %s (expected 2)', v_d);

  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_ua, v_ub);
  RAISE NOTICE 'Scenario 6 passed: COLLUSION → soft-block held, collusion block event (T=8, D=2)';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL Guardian v1 scenarios passed.'; END $$;
