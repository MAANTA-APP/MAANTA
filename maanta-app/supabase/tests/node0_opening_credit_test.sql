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

-- Scenario E (D73 reland, 20260807160000): the cap is counted PER NODE — an
-- off-node merchant holding an opening-credit ledger row must NOT consume the
-- launch node's allowance. Under the clobbered GLOBAL count this scenario
-- fails (the off-node row pushes the count to the cap and the launch-node
-- merchant gets nothing), which is exactly the regression this exists to catch.
DO $$
DECLARE
  v_mid_off UUID;
  v_mid_on  UUID;
  v_balance NUMERIC;
  v_credit NUMERIC := (SELECT value::NUMERIC FROM public.app_config WHERE key = 'node0_opening_credit_kes');
  v_node   TEXT    := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
  v_saved_cap TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap');
BEGIN
  -- Cap of exactly 1: one consumed slot anywhere-vs-per-node is the whole test.
  UPDATE public.app_config SET value = '1' WHERE key = 'node0_opening_credit_merchant_cap';

  -- An already-credited merchant at a DIFFERENT node (a future Node 1), with
  -- the ledger row the count query looks for.
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_E_off', 'test.off.node', '+254700000005', v_node || ' (test other node)', 'active', 0)
  RETURNING id INTO v_mid_off;
  INSERT INTO public.merchant_transactions (
    merchant_id, amount, transaction_type, payment_provider,
    provider_reference, description, currency, charged_amount
  ) VALUES (
    v_mid_off, COALESCE(v_credit, 300), 'topup', 'manual',
    'node0_opening_credit:' || v_mid_off,
    'Node 0 launch opening credit · node0_opening_credit', 'KES', 0
  );

  -- A fresh pending merchant at the LAUNCH node. Its node's allowance is
  -- untouched, so it must be credited even though the global count is at cap.
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_E_on', 'test.launch.node', '+254700000006', v_node, 'pending', 0)
  RETURNING id INTO v_mid_on;

  PERFORM public.activate_merchant(v_mid_on, gen_random_uuid(), FALSE);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid_on;
  ASSERT v_balance = v_credit,
    format('E: launch-node merchant must be credited %s despite an off-node consumed slot (got %s) — '
           'a mismatch here means the opening-credit count regressed to GLOBAL (drift D73)',
           v_credit, v_balance);

  UPDATE public.app_config SET value = v_saved_cap WHERE key = 'node0_opening_credit_merchant_cap';
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_mid_off, v_mid_on);
  DELETE FROM public.merchants WHERE id IN (v_mid_off, v_mid_on);
  RAISE NOTICE 'Scenario E passed: off-node consumed slot does not exhaust the launch node''s allowance';
END $$;

-- Scenario F (D73): the per-node count still enforces the cap WITHIN a node —
-- a consumed slot at the launch node blocks the next launch-node grant.
DO $$
DECLARE
  v_mid_first UUID;
  v_mid_next  UUID;
  v_balance NUMERIC;
  v_credit NUMERIC := (SELECT value::NUMERIC FROM public.app_config WHERE key = 'node0_opening_credit_kes');
  v_node   TEXT    := (SELECT value FROM public.app_config WHERE key = 'node0_launch_node');
  v_saved_cap TEXT := (SELECT value FROM public.app_config WHERE key = 'node0_opening_credit_merchant_cap');
BEGIN
  UPDATE public.app_config SET value = '1' WHERE key = 'node0_opening_credit_merchant_cap';

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_F_first', 'test.launch.node', '+254700000007', v_node, 'active', 0)
  RETURNING id INTO v_mid_first;
  INSERT INTO public.merchant_transactions (
    merchant_id, amount, transaction_type, payment_provider,
    provider_reference, description, currency, charged_amount
  ) VALUES (
    v_mid_first, COALESCE(v_credit, 300), 'topup', 'manual',
    'node0_opening_credit:' || v_mid_first,
    'Node 0 launch opening credit · node0_opening_credit', 'KES', 0
  );

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
  VALUES ('__test_node0_credit_F_next', 'test.launch.node', '+254700000008', v_node, 'pending', 0)
  RETURNING id INTO v_mid_next;

  PERFORM public.activate_merchant(v_mid_next, gen_random_uuid(), FALSE);

  SELECT account_balance INTO v_balance FROM public.merchants WHERE id = v_mid_next;
  ASSERT v_balance = 0,
    format('F: launch-node cap of 1 already consumed at that node — expected no credit, got %s', v_balance);
  ASSERT (SELECT status FROM public.merchants WHERE id = v_mid_next) = 'active',
    'F: merchant must still activate when its node''s allowance is spent';

  UPDATE public.app_config SET value = v_saved_cap WHERE key = 'node0_opening_credit_merchant_cap';
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_mid_first, v_mid_next);
  DELETE FROM public.merchants WHERE id IN (v_mid_first, v_mid_next);
  RAISE NOTICE 'Scenario F passed: the per-node count still enforces the cap within a node';
END $$;

-- If we got here, every ASSERT held.
DO $$ BEGIN RAISE NOTICE 'ALL node0_opening_credit scenarios passed.'; END $$;
