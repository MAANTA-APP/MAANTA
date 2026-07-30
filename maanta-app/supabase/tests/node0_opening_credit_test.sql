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

-- Reproduce the service-role context the /approve route runs under.
-- Session-level (is_local = false) on purpose: `psql -f` runs each statement
-- in its own autocommit transaction, so a transaction-local (true) setting
-- would be discarded the instant this SELECT commits — before the DO blocks
-- below run — and activate_merchant would then raise 'unauthorized: admin
-- only'. Session scope persists across the file's statements. Each test file
-- gets its own dedicated psql connection that ends when psql exits, so this
-- never leaks to another session.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

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

-- Scenario E: the cap is PER NODE (migration 20260730170000, originally #131's
-- 20260730120000 before 20260730130000 overwrote it).
-- One node filling its allowance must not exhaust the next node's. With a global
-- count, moving node0_launch_node to a new mall after the first node filled up
-- left the new node's promo dead on arrival — activations there silently granted
-- nothing while /for-merchants still advertised the credit.
DO $$
DECLARE
  v_a UUID; v_b UUID;
  v_bal_a NUMERIC; v_bal_b NUMERIC;
  v_credit NUMERIC := (SELECT value::NUMERIC FROM public.app_config WHERE key = 'node0_opening_credit_kes');
  v_node   TEXT    := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
  v_saved_cap TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap');
  v_next_node TEXT := '__test_next_node';
BEGIN
  -- A cap of 1 makes the boundary observable in two activations.
  UPDATE public.app_config SET value = '1' WHERE key = 'node0_opening_credit_merchant_cap';

  -- Fill the launch node's single slot.
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_E_a', 'test.per.node.a', '+254700000005', v_node, 'pending', 0)
  RETURNING id INTO v_a;
  PERFORM public.activate_merchant(v_a, gen_random_uuid(), FALSE);
  SELECT account_balance INTO v_bal_a FROM public.merchants WHERE id = v_a;
  ASSERT v_bal_a = v_credit, format('E: first node expected %s, got %s', v_credit, v_bal_a);

  -- Ops opens the promo at the next node. Its own slot is untouched.
  UPDATE public.app_config SET value = v_next_node WHERE key = 'node0_launch_node';

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_E_b', 'test.per.node.b', '+254700000006', v_next_node, 'pending', 0)
  RETURNING id INTO v_b;
  PERFORM public.activate_merchant(v_b, gen_random_uuid(), FALSE);
  SELECT account_balance INTO v_bal_b FROM public.merchants WHERE id = v_b;
  ASSERT v_bal_b = v_credit,
    format('E: new node expected %s, got %s — a filled node is exhausting the next node''s cap', v_credit, v_bal_b);

  UPDATE public.app_config SET value = v_node       WHERE key = 'node0_launch_node';
  UPDATE public.app_config SET value = v_saved_cap  WHERE key = 'node0_opening_credit_merchant_cap';
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_a, v_b);
  DELETE FROM public.merchants WHERE id IN (v_a, v_b);
  RAISE NOTICE 'Scenario E passed: each node gets its own first-N allowance';
END $$;

-- Scenario F: the cap STILL binds inside a node.
-- The guard against "fixing" scenario E by simply not enforcing the cap.
DO $$
DECLARE
  v_first UUID; v_second UUID;
  v_bal_first NUMERIC; v_bal_second NUMERIC; v_count INT;
  v_credit NUMERIC := (SELECT value::NUMERIC FROM public.app_config WHERE key = 'node0_opening_credit_kes');
  v_node   TEXT    := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
  v_saved_cap TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap');
BEGIN
  UPDATE public.app_config SET value = '1' WHERE key = 'node0_opening_credit_merchant_cap';

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_F_1', 'test.same.node.1', '+254700000007', v_node, 'pending', 0)
  RETURNING id INTO v_first;
  PERFORM public.activate_merchant(v_first, gen_random_uuid(), FALSE);
  SELECT account_balance INTO v_bal_first FROM public.merchants WHERE id = v_first;
  ASSERT v_bal_first = v_credit, format('F: first expected %s, got %s', v_credit, v_bal_first);

  -- Second merchant at the SAME node, cap already filled → no credit.
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_F_2', 'test.same.node.2', '+254700000008', v_node, 'pending', 0)
  RETURNING id INTO v_second;
  PERFORM public.activate_merchant(v_second, gen_random_uuid(), FALSE);
  SELECT account_balance INTO v_bal_second FROM public.merchants WHERE id = v_second;
  ASSERT v_bal_second = 0,
    format('F: second merchant at a filled node got %s — the per-node cap is not binding', v_bal_second);

  SELECT COUNT(*) INTO v_count FROM public.merchant_transactions
    WHERE merchant_id = v_second AND provider_reference LIKE 'node0_opening_credit:%';
  ASSERT v_count = 0, 'F: ledger row written past the per-node cap';

  ASSERT (SELECT status FROM public.merchants WHERE id = v_second) = 'active', 'F: merchant not activated';

  UPDATE public.app_config SET value = v_saved_cap WHERE key = 'node0_opening_credit_merchant_cap';
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_first, v_second);
  DELETE FROM public.merchants WHERE id IN (v_first, v_second);
  RAISE NOTICE 'Scenario F passed: the per-node cap still binds within a node';
END $$;

-- NOTE on the Elite-cap side of activate_merchant: this migration recreates the
-- whole function, so it could in principle revert the first-100 Elite trial cap
-- from 20260730130000. That regression is already covered — elite_trial_cap_test.sql
-- scenarios B and C drive activate_merchant directly and assert both the grant
-- and the at-cap skip. Both suites must pass together; neither alone is enough.

-- If we got here, every ASSERT held.
DO $$ BEGIN RAISE NOTICE 'ALL node0_opening_credit scenarios passed.'; END $$;
