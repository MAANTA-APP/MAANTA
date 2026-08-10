-- ============================================================
-- Test: pending_topups (20260810120000_pending_topups.sql)
--
-- Guards the amount-reconciliation record behind SEC-001 / D83.
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pending_topups_test.sql
-- ============================================================

-- Scenario A: grant posture — service_role writes, authenticated cannot.
DO $$
BEGIN
  ASSERT has_table_privilege('service_role', 'public.pending_topups', 'INSERT'),
    'A: service_role must INSERT pending_topups';
  ASSERT has_table_privilege('service_role', 'public.pending_topups', 'UPDATE'),
    'A: service_role must UPDATE pending_topups (status settle)';
  ASSERT has_table_privilege('authenticated', 'public.pending_topups', 'SELECT'),
    'A: authenticated must retain SELECT (RLS-gated)';
  ASSERT NOT has_table_privilege('authenticated', 'public.pending_topups', 'INSERT'),
    'A: authenticated must not INSERT pending_topups';
  -- A merchant editing the recorded amount would defeat reconciliation outright.
  ASSERT NOT has_table_privilege('authenticated', 'public.pending_topups', 'UPDATE'),
    'A: authenticated must not UPDATE pending_topups';
  ASSERT NOT has_table_privilege('anon', 'public.pending_topups', 'SELECT'),
    'A: anon must not read pending_topups';
  RAISE NOTICE 'Scenario A passed: pending_topups grants are service_role-only for writes';
END $$;

-- Scenario B: RLS is on, and the table is not readable without a policy match.
DO $$
DECLARE
  v_rls BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.pending_topups'::regclass;
  ASSERT v_rls, 'B: RLS must be enabled on pending_topups';
  RAISE NOTICE 'Scenario B passed: RLS enabled';
END $$;

-- Scenario C: constraints hold — the columns reconciliation depends on cannot
-- be written into a meaningless state.
DO $$
DECLARE
  v_mid UUID;
  v_ref TEXT := 'topup:__test__:' || gen_random_uuid()::text;
  v_failed BOOLEAN;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible
  )
    VALUES ('__test_pending_topups', 'test.pending.topups', '+254700000601', 'BBS Mall', 'active', TRUE)
    RETURNING id INTO v_mid;

  -- A non-positive amount is meaningless as a reconciliation target.
  v_failed := FALSE;
  BEGIN
    INSERT INTO public.pending_topups (api_ref, merchant_id, amount, payment_provider)
      VALUES (v_ref || ':zero', v_mid, 0, 'intasend');
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'C: amount must be > 0';

  -- Unknown status values would silently escape the ops sweep.
  v_failed := FALSE;
  BEGIN
    INSERT INTO public.pending_topups (api_ref, merchant_id, amount, payment_provider, status)
      VALUES (v_ref || ':bad', v_mid, 500, 'intasend', 'not_a_status');
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'C: status must be one of initiated/completed/abandoned';

  -- api_ref is the join key to the ledger; duplicates would make "which top-up
  -- was this" ambiguous.
  INSERT INTO public.pending_topups (api_ref, merchant_id, amount, payment_provider)
    VALUES (v_ref, v_mid, 500, 'intasend');
  v_failed := FALSE;
  BEGIN
    INSERT INTO public.pending_topups (api_ref, merchant_id, amount, payment_provider)
      VALUES (v_ref, v_mid, 500, 'intasend');
  EXCEPTION WHEN unique_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'C: api_ref must be unique';

  DELETE FROM public.pending_topups WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario C passed: pending_topups constraints hold';
END $$;

-- Scenario D: deleting a merchant does not orphan its pending rows.
DO $$
DECLARE
  v_mid UUID;
  v_ref TEXT := 'topup:__test_cascade__:' || gen_random_uuid()::text;
  v_count INT;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible
  )
    VALUES ('__test_pending_cascade', 'test.pending.cascade', '+254700000602', 'BBS Mall', 'active', TRUE)
    RETURNING id INTO v_mid;

  INSERT INTO public.pending_topups (api_ref, merchant_id, amount, payment_provider)
    VALUES (v_ref, v_mid, 750, 'intasend');

  DELETE FROM public.merchants WHERE id = v_mid;

  SELECT COUNT(*) INTO v_count FROM public.pending_topups WHERE api_ref = v_ref;
  ASSERT v_count = 0, format('D: pending row should cascade with the merchant, got %s', v_count);
  RAISE NOTICE 'Scenario D passed: pending_topups cascades on merchant delete';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL pending_topups scenarios passed.'; END $$;
