-- ============================================================
-- Test: Node 0 opening credit wired into activate_merchant
--   (migration 20260716120000_node0_opening_credit_on_activation.sql)
--
-- Self-contained and self-cleaning. Run against a database that has the
-- migration applied, e.g.:
--   psql "$DATABASE_URL" -f supabase/tests/node0_opening_credit_test.sql
--
-- Each scenario runs inside a DO block. ASSERT raises (aborting the whole
-- run) on failure; on success the block explicitly deletes the rows it made.
-- Test merchants use user_id = NULL and a recognizable name prefix.
--
-- activate_merchant is admin/service_role-gated. In production the /approve
-- route calls it with the service-role key (auth.role() = 'service_role',
-- which the function's auth check bypasses). We reproduce that context for the
-- whole run below; without it the function would raise 'unauthorized: admin only'.
-- ============================================================

-- Reproduce the service-role context the /approve route runs under
-- (transaction-local so it never leaks to another session on a pooled conn).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: Node 0 merchant, within window, under cap  → credited KES 300.
DO $$
DECLARE
  v_mid UUID;
  v_balance NUMERIC;
  v_tx RECORD;
  v_credit NUMERIC := (SELECT value::NUMERIC FROM public.app_config WHERE key = 'node0_opening_credit_kes');
  v_node   TEXT    := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_A', 'test.launch.node', '+254700000001', v_node, 'pending', 0)
  RETURNING id INTO v_mid;

  PERFORM public.activate_merchant(v_mid, gen_random_uuid(), FALSE);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = v_credit,
    format('A: expected balance %s, got %s', v_credit, v_balance);

  SELECT * INTO v_tx FROM public.merchant_transactions
    WHERE merchant_id = v_mid
      AND provider_reference = 'node0_opening_credit:' || v_mid;
  ASSERT FOUND, 'A: no node0_opening_credit ledger row written';
  ASSERT v_tx.amount = v_credit,           format('A: ledger amount = %s', v_tx.amount);
  ASSERT v_tx.transaction_type = 'topup',  format('A: transaction_type = %s', v_tx.transaction_type);
  ASSERT v_tx.payment_provider = 'manual', format('A: payment_provider = %s', v_tx.payment_provider);
  ASSERT v_tx.currency = 'KES',            format('A: currency = %s', v_tx.currency);
  ASSERT v_tx.charged_amount = 0,          format('A: charged_amount = %s', v_tx.charged_amount);
  ASSERT v_tx.description LIKE '%node0_opening_credit%', 'A: description missing node0_opening_credit tag';

  -- status still flipped to active (no regression)
  ASSERT (SELECT status FROM public.merchants WHERE id = v_mid) = 'active', 'A: merchant not activated';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario A passed: Node 0 in-window under-cap merchant credited KES %', v_credit;
END $$;

-- Scenario B: non-launch node (e.g. Node 1) → NO credit, still activates.
DO $$
DECLARE
  v_mid UUID;
  v_balance NUMERIC;
  v_count INT;
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_B', 'test.other.node', '+254700000002', 'Two Rivers Mall', 'pending', 0)
  RETURNING id INTO v_mid;

  PERFORM public.activate_merchant(v_mid, gen_random_uuid(), FALSE);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 0, format('B: expected balance 0 for non-launch node, got %s', v_balance);

  SELECT COUNT(*) INTO v_count FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND provider_reference LIKE 'node0_opening_credit:%';
  ASSERT v_count = 0, 'B: opening-credit ledger row written for non-launch node';

  ASSERT (SELECT status FROM public.merchants WHERE id = v_mid) = 'active', 'B: merchant not activated';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario B passed: non-launch-node merchant activated with no credit';
END $$;

-- Scenario C: launch node but AFTER the launch window → NO credit, still activates.
DO $$
DECLARE
  v_mid UUID;
  v_balance NUMERIC;
  v_count INT;
  v_node TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
  v_saved_window TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_launch_period_ends_at');
BEGIN
  -- Move the window into the past for the duration of this block.
  UPDATE public.app_config SET value = '2000-01-01T00:00:00Z' WHERE key = 'node0_launch_period_ends_at';

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_C', 'test.expired.window', '+254700000003', v_node, 'pending', 0)
  RETURNING id INTO v_mid;

  PERFORM public.activate_merchant(v_mid, gen_random_uuid(), FALSE);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 0, format('C: expected balance 0 after window close, got %s', v_balance);

  SELECT COUNT(*) INTO v_count FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND provider_reference LIKE 'node0_opening_credit:%';
  ASSERT v_count = 0, 'C: opening-credit ledger row written after window close';

  ASSERT (SELECT status FROM public.merchants WHERE id = v_mid) = 'active', 'C: merchant not activated';

  -- restore config + clean up
  UPDATE public.app_config SET value = v_saved_window WHERE key = 'node0_launch_period_ends_at';
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario C passed: post-window activation received no credit';
END $$;

-- Scenario D: launch node, in-window, but cap already reached → NO credit.
DO $$
DECLARE
  v_mid UUID;
  v_balance NUMERIC;
  v_count INT;
  v_node TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
  v_saved_cap TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap');
BEGIN
  -- Force the cap to zero so no further credits may be granted.
  UPDATE public.app_config SET value = '0' WHERE key = 'node0_opening_credit_merchant_cap';

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_D', 'test.cap.reached', '+254700000004', v_node, 'pending', 0)
  RETURNING id INTO v_mid;

  PERFORM public.activate_merchant(v_mid, gen_random_uuid(), FALSE);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid;
  ASSERT v_balance = 0, format('D: expected balance 0 at/over cap, got %s', v_balance);

  SELECT COUNT(*) INTO v_count FROM public.merchant_transactions
    WHERE merchant_id = v_mid AND provider_reference LIKE 'node0_opening_credit:%';
  ASSERT v_count = 0, 'D: opening-credit ledger row written despite cap reached';

  ASSERT (SELECT status FROM public.merchants WHERE id = v_mid) = 'active', 'D: merchant not activated';

  UPDATE public.app_config SET value = v_saved_cap WHERE key = 'node0_opening_credit_merchant_cap';
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario D passed: at-cap activation received no credit';
END $$;

-- If we got here, every ASSERT held.
DO $$ BEGIN RAISE NOTICE 'ALL node0_opening_credit scenarios passed.'; END $$;
