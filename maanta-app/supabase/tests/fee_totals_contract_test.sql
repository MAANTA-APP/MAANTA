-- ============================================================================
-- Test: the fee contract — gross / reversals / net
--   (migration 20260829120000_fee_totals_contract.sql, drift D211)
--
-- Self-contained and self-cleaning. Run against a database that has the
-- migration applied, e.g.:
--   psql "$DATABASE_URL" -f supabase/tests/fee_totals_contract_test.sql
--
-- Two sections:
--
--   1. The SEMANTIC cases, generated from
--      supabase/tests/fixtures/fee-contract-cases.json. B2b delegates every
--      application read to this SQL contract, so these are the one executable
--      semantic rules rather than one half of a parity approximation.
--
--   2. The things a fixture cannot express: argument validation, grants,
--      function security settings, and the compatibility shim's behaviour.
-- ============================================================================

\ir fixtures/fee_contract_cases.generated.sql

-- ---------------------------------------------------------------------------
-- Scope arguments: NULL never means global.
--
-- The whole reason scope is two parameters rather than one nullable array. An
-- operator scoped to a node whose id list went missing must get an error, not
-- the marketplace.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_raised BOOLEAN;
BEGIN
  v_raised := FALSE;
  BEGIN
    PERFORM * FROM public.admin_fee_totals_for_merchants(NOW() - INTERVAL '30 days', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE 'invalid_scope:%', format('scope: unexpected error %s', SQLERRM);
  END;
  ASSERT v_raised, 'a scoped call with a NULL merchant array must raise, never fall back to global';

  v_raised := FALSE;
  BEGIN
    PERFORM * FROM public._fee_totals(NOW() - INTERVAL '30 days', NULL, FALSE, ARRAY[]::uuid[]);
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE 'invalid_scope:%', format('scope: unexpected error %s', SQLERRM);
  END;
  ASSERT v_raised, 'a global call supplying merchant ids is incoherent and must raise';

  RAISE NOTICE 'scope validation passed: NULL never means global';
END $$;

-- ---------------------------------------------------------------------------
-- Window arguments.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM * FROM public.admin_fee_totals_global(NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE 'invalid_window:%', format('window: unexpected error %s', SQLERRM);
  END;
  ASSERT v_raised, 'a NULL p_since must raise rather than aggregate all history unasked';

  v_raised := FALSE;
  BEGIN
    PERFORM * FROM public.admin_fee_totals_global(NOW(), NOW() - INTERVAL '1 day');
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE 'invalid_window:%', format('window: unexpected error %s', SQLERRM);
  END;
  ASSERT v_raised, 'an inverted window must raise rather than silently return zero';

  RAISE NOTICE 'window validation passed';
END $$;

-- ---------------------------------------------------------------------------
-- The GLOBAL wrapper.
--
-- The generated cases above all go through the scoped wrapper, for isolation:
-- a global assertion would depend on whatever every other suite left behind.
-- So the global path needs its own coverage, and it is written RELATIVELY —
-- "global sees at least what this scope sees, and strictly more when a second
-- merchant exists" — which is true regardless of what else is in the database.
--
-- The direction that matters is that global is BROADER. A global wrapper that
-- silently scoped to nothing would pass any absolute assertion written as
-- "expected 0".
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid UUID;
  v_m1 UUID; v_m2 UUID;
  v_d1 UUID; v_d2 UUID;
  v_r1 UUID; v_r2 UUID;
  v_scoped RECORD;
  v_both   RECORD;
  v_global RECORD;
  v_since  TIMESTAMPTZ := NOW() - INTERVAL '1 day';
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__fee_global_1', 'fee.global.one', '+254700009941', 'BBS Mall', 'active', TRUE, 1000)
    RETURNING id INTO v_m1;
  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__fee_global_2', 'fee.global.two', '+254700009942', 'BBS Mall', 'active', TRUE, 1000)
    RETURNING id INTO v_m2;

  INSERT INTO public.deals (merchant_id, title, image_url, expires_at)
    VALUES (v_m1, '__fee_global_1', 'x', NOW() + INTERVAL '30 days') RETURNING id INTO v_d1;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at)
    VALUES (v_m2, '__fee_global_2', 'x', NOW() + INTERVAL '30 days') RETURNING id INTO v_d2;

  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged)
    VALUES (v_d1, v_m1, v_uid, '991001', 'success', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '2 hours', 30)
    RETURNING id INTO v_r1;
  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged)
    VALUES (v_d2, v_m2, v_uid, '991002', 'success', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '2 hours', 70)
    RETURNING id INTO v_r2;

  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id)
    VALUES
      (v_m1, -30, 'success_fee', 'manual', '__fee_global_f1', 'fixture', v_r1),
      (v_m2, -70, 'success_fee', 'manual', '__fee_global_f2', 'fixture', v_r2);

  SELECT * INTO v_scoped FROM public.admin_fee_totals_for_merchants(v_since, NULL, ARRAY[v_m1]);
  SELECT * INTO v_both   FROM public.admin_fee_totals_for_merchants(v_since, NULL, ARRAY[v_m1, v_m2]);
  SELECT * INTO v_global FROM public.admin_fee_totals_global(v_since, NULL);

  ASSERT v_scoped.available, 'global: the single-merchant scope should be available';
  ASSERT v_scoped.gross_kes = 30,
    format('global: one merchant scope = %s, expected 30', v_scoped.gross_kes);
  ASSERT v_both.gross_kes = 100,
    format('global: two merchant scope = %s, expected 100', v_both.gross_kes);

  -- Global must be at least the two-merchant scope. Not equality: other suites'
  -- rows may legitimately be present, and an equality assertion here would make
  -- this suite fail for something it does not test.
  IF v_global.available THEN
    ASSERT v_global.gross_kes >= v_both.gross_kes,
      format('global (%s) must be at least the scoped total (%s)',
             v_global.gross_kes, v_both.gross_kes);
    ASSERT v_global.gross_kes > v_scoped.gross_kes,
      format('global (%s) must be strictly broader than one merchant (%s)',
             v_global.gross_kes, v_scoped.gross_kes);
  ELSE
    -- Unavailable is a legitimate global answer when unrelated rows in the
    -- database are incomplete. It is NOT a legitimate SCOPED answer here, which
    -- the assertions above already pinned.
    RAISE NOTICE 'global: unavailable because of rows outside this test — scoped assertions still held';
  END IF;

  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_m1, v_m2);
  DELETE FROM public.redemptions WHERE merchant_id IN (v_m1, v_m2);
  DELETE FROM public.deals WHERE merchant_id IN (v_m1, v_m2);
  DELETE FROM public.merchants WHERE id IN (v_m1, v_m2);
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'global wrapper passed: broader than a scope, never narrower';
END $$;

-- ---------------------------------------------------------------------------
-- The compatibility shim.
--
-- `admin_success_fee_revenue` keeps its signature so mid-rollout builds keep
-- working, and RAISES rather than returning NULL when the figure is
-- unavailable. That is forced, not stylistic: `formatKes` in src/lib/ui.ts is
-- `amount ?? 0`, so a NULL renders "KES 0" — a manufactured zero on an
-- executive money card. Both calling pages already turn any error into a
-- read-error state.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_sum NUMERIC;
  v_raised BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__fee_compat_shim', 'fee.compat.shim', '+254700009931', 'BBS Mall', 'active', TRUE, 1000)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at)
    VALUES (v_mid, '__fee_compat_shim', 'x', NOW() + INTERVAL '30 days')
    RETURNING id INTO v_did;
  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '990011', 'success', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;
  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id)
    VALUES (v_mid, -30, 'success_fee', 'manual', '__fee_compat_shim_1', 'fixture', v_rid);

  -- Complete: returns GROSS, not net. The name has always meant fees billed and
  -- B2a must not quietly change what it counts.
  --
  -- Guarded, because the shim is GLOBAL: another suite leaving a genuine
  -- success with no fee row would make this raise for a reason that has nothing
  -- to do with the shim. When that happens the assertion is skipped LOUDLY —
  -- the raise-when-incomplete leg below is unaffected, because inserting an
  -- incomplete row guarantees the raise whatever else is present.
  BEGIN
    SELECT public.admin_success_fee_revenue(NOW() - INTERVAL '1 day') INTO v_sum;
    ASSERT v_sum >= 30, format('shim: expected at least 30 gross, got %s', v_sum);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'shim: global baseline unavailable (%) — the value leg is skipped, the raise leg still runs', SQLERRM;
  END;

  -- Now break completeness: a second genuine success with no fee row at all.
  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '990012', 'success', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '30 minutes', 30);

  BEGIN
    SELECT public.admin_success_fee_revenue(NOW() - INTERVAL '1 day') INTO v_sum;
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE 'fee_totals_unavailable:%', format('shim: unexpected error %s', SQLERRM);
  END;
  ASSERT v_raised,
    'the shim must RAISE when the figure is unavailable — a NULL return renders as "KES 0"';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'compatibility shim passed: gross when available, raises when not';
END $$;

-- ---------------------------------------------------------------------------
-- Grants. Money aggregates are service-role only, and the private contract is
-- reachable only through the SECURITY DEFINER wrappers.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn TEXT;
  v_role TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.admin_fee_totals_global(timestamptz, timestamptz)',
    'public.admin_fee_totals_for_merchants(timestamptz, timestamptz, uuid[])',
    'public.admin_success_fee_revenue(timestamptz)'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      ASSERT NOT has_function_privilege(v_role, v_fn, 'EXECUTE'),
        format('%s must not be executable by %s', v_fn, v_role);
    END LOOP;
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'),
      format('%s must be executable by service_role', v_fn);
  END LOOP;

  v_fn := 'public._fee_totals(timestamptz, timestamptz, boolean, uuid[])';
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(v_role, v_fn, 'EXECUTE'),
      format('the private contract %s must not be executable by %s', v_fn, v_role);
  END LOOP;

  RAISE NOTICE 'grants passed: wrappers service_role-only, private contract unreachable';
END $$;

-- ---------------------------------------------------------------------------
-- Function security settings, and the index the join needs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name TEXT;
  v_rec RECORD;
  v_indexdef TEXT;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    '_fee_totals', 'admin_fee_totals_global',
    'admin_fee_totals_for_merchants', 'admin_success_fee_revenue'
  ] LOOP
    SELECT p.prosecdef, p.provolatile, p.proconfig INTO v_rec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;
    ASSERT FOUND, format('%s not found', v_name);
    ASSERT v_rec.prosecdef, format('%s must be SECURITY DEFINER', v_name);
    ASSERT v_rec.provolatile = 's', format('%s must be STABLE, got %s', v_name, v_rec.provolatile);
    -- A SECURITY DEFINER function without a pinned search_path is a
    -- privilege-escalation shape, and every money RPC in this schema pins one.
    ASSERT v_rec.proconfig IS NOT NULL
       AND array_to_string(v_rec.proconfig, ',') LIKE '%search_path%',
      format('%s must pin search_path', v_name);
  END LOOP;

  -- Exactly one overload each. The onboard_merchant lesson: a second signature
  -- makes every call ambiguous, and it is invisible until something breaks.
  FOREACH v_name IN ARRAY ARRAY[
    '_fee_totals', 'admin_fee_totals_global',
    'admin_fee_totals_for_merchants', 'admin_success_fee_revenue'
  ] LOOP
    ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = v_name) = 1,
      format('%s must have exactly one overload', v_name);
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'merchant_transactions'
       AND indexname = 'idx_mtx_reference_id'
  ), 'idx_mtx_reference_id is missing — sibling lookups would seq-scan the ledger';

  -- The global window's own index. `idx_mtx_reference_id` accelerates each
  -- sibling lookup once a row is in hand; only this one bounds the initial
  -- scan, and without it a marketplace-wide report reads the ledger's whole
  -- history to evaluate its timestamp predicate.
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'merchant_transactions'
       AND indexname = 'idx_mtx_fee_window'
  ), 'idx_mtx_fee_window is missing — the global window would scan all ledger history';

  -- Leading column, checked rather than assumed: `created_at` is the range
  -- predicate, so it must lead or the index cannot serve the scan.
  SELECT indexdef INTO v_indexdef FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'merchant_transactions'
     AND indexname = 'idx_mtx_fee_window';
  ASSERT v_indexdef LIKE '%(created_at)%',
    format('idx_mtx_fee_window must lead with created_at, got: %s', v_indexdef);

  -- And its partial predicate must name exactly the three fee-bearing types
  -- the contract buckets as gross or reversal. If the two ever disagree, the
  -- index silently stops covering part of the scan it exists for.
  FOREACH v_name IN ARRAY ARRAY['success_fee', 'success_fee_arrears', 'fee_reversal'] LOOP
    ASSERT v_indexdef LIKE '%' || v_name || '%',
      format('idx_mtx_fee_window must cover %s, got: %s', v_name, v_indexdef);
  END LOOP;
  ASSERT v_indexdef NOT LIKE '%arrears_settlement%'
     AND v_indexdef NOT LIKE '%topup%',
    format('idx_mtx_fee_window must not cover excluded types, got: %s', v_indexdef);

  RAISE NOTICE 'security settings and index passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL fee_totals_contract scenarios passed.'; END $$;
