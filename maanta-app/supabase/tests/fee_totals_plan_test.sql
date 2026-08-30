-- ============================================================================
-- D211 / B2a — prove the global fee-window predicate is actually sargable.
--
-- Existence and column-order assertions are necessary but insufficient: the
-- earlier `NOT isfinite(created_at) OR range` form had the right index and
-- still scanned it end to end with the window in a Filter. This rollback-only
-- test builds the measured 400k-row shape and requires the explicit-extremes
-- predicate to plan as three real index conditions under a BitmapOr.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_mid UUID;
  v_plan TEXT := '';
  v_line TEXT;
BEGIN
  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible,
     account_balance, is_demo)
  VALUES
    ('__fee_plan_probe', 'fee.plan.probe', '+254700009977', 'BBS Mall',
     'active', TRUE, 1000, TRUE)
  RETURNING id INTO v_mid;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider,
     provider_reference, description, reference_id, created_at, is_demo)
  SELECT
    v_mid,
    CASE i % 3 WHEN 0 THEN -30 ELSE 30 END,
    CASE i % 3
      WHEN 0 THEN 'success_fee'
      WHEN 1 THEN 'success_fee_arrears'
      ELSE 'fee_reversal'
    END,
    'manual',
    '__fee_plan_' || i,
    'planner fixture',
    (substr(md5(i::text), 1, 8) || '-' ||
     substr(md5(i::text), 9, 4) || '-' ||
     substr(md5(i::text), 13, 4) || '-' ||
     substr(md5(i::text), 17, 4) || '-' ||
     substr(md5(i::text), 21, 12))::uuid,
    '2025-08-01T00:00:00Z'::timestamptz + i * INTERVAL '1 minute',
    TRUE
  FROM generate_series(1, 400000) AS g(i);

  -- Put a real row on each exceptional branch too. They remain demo-tagged and
  -- the enclosing transaction rolls back, so this test cannot contaminate any
  -- semantic suite regardless of runner order.
  UPDATE public.merchant_transactions
     SET created_at = 'infinity'::timestamptz
   WHERE provider_reference = '__fee_plan_399999';
  UPDATE public.merchant_transactions
     SET created_at = '-infinity'::timestamptz
   WHERE provider_reference = '__fee_plan_400000';

  ANALYZE public.merchant_transactions;
  PERFORM set_config('enable_seqscan', 'off', TRUE);

  FOR v_line IN EXECUTE $explain$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT DISTINCT t.reference_id
      FROM public.merchant_transactions t
     WHERE t.transaction_type IN
             ('success_fee', 'success_fee_arrears', 'fee_reversal')
       AND t.reference_id IS NOT NULL
       AND (   (t.created_at >= '2026-01-01T00:00:00Z'::timestamptz
                AND t.created_at < '2026-01-02T00:00:00Z'::timestamptz)
            OR t.created_at =  'infinity'::timestamptz
            OR t.created_at = '-infinity'::timestamptz)
  $explain$ LOOP
    v_plan := v_plan || v_line || E'\n';
  END LOOP;

  ASSERT v_plan LIKE '%BitmapOr%',
    format('fee window must use BitmapOr, got:%s%s', E'\n', v_plan);
  ASSERT (length(v_plan) - length(replace(v_plan, 'Index Cond:', '')))
           / length('Index Cond:') >= 3,
    format('fee window must expose three Index Cond branches, got:%s%s',
           E'\n', v_plan);
  ASSERT v_plan NOT LIKE '%Filter: %created_at%',
    format('created_at window must not collapse into a Filter, got:%s%s',
           E'\n', v_plan);

  RAISE NOTICE 'fee plan passed: 400000 rows, BitmapOr, three Index Conds';
END $$;

ROLLBACK;

