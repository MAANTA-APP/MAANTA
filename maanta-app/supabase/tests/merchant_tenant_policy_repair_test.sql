-- ============================================================
-- Test: D168 — tenant policies FILTER instead of erroring, without widening
-- what `authenticated` can see (D147 must survive).
--
--   A  the ten policies no longer read public.merchants directly
--   B  an authenticated read succeeds where it used to raise 42501
--   C  a merchant owner sees THEIR OWN rows
--   D  a merchant owner sees NONE of another tenant's rows  (cross-tenant)
--   E  a plain shopper sees no merchant-scoped rows at all
--   F  authenticated STILL cannot select from merchants or deals (D147 intact)
--   G  the helper cannot be aimed at anyone else and leaks no merchant columns
--   H  anon holds no EXECUTE on the helper
--
-- Migration: 20260903140000_repair_merchant_tenant_policies.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/merchant_tenant_policy_repair_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- A: no affected policy may name the base table again.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(tablename||'.'||policyname, ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND qual LIKE '%FROM merchants%';
  ASSERT v_bad IS NULL,
    format('A: policies still subquery public.merchants directly and will raise 42501: %s', v_bad);
  RAISE NOTICE 'A passed: no tenant policy reads public.merchants directly';
END $$;

-- B–E: behaviour, with two real tenants and a bystander shopper.
DO $$
DECLARE
  v_own_uid UUID; v_other_uid UUID; v_shopper UUID;
  v_m1 UUID; v_m2 UUID; v_d1 UUID; v_d2 UUID;
  v_seen INT; v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', gen_random_uuid()) RETURNING id INTO v_own_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', gen_random_uuid()) RETURNING id INTO v_other_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', gen_random_uuid()) RETURNING id INTO v_shopper;

  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES (v_own_uid, '__d168_mine', 'd168.mine', '+254700000931', 'BBS Mall', 'active', 500, '1st Floor', 'M-1', TRUE)
    RETURNING id INTO v_m1;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES (v_other_uid, '__d168_theirs', 'd168.theirs', '+254700000932', 'BBS Mall', 'active', 500, '1st Floor', 'M-2', TRUE)
    RETURNING id INTO v_m2;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m1, 'Mine', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 50, 0, 30, 500) RETURNING id INTO v_d1;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m2, 'Theirs', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 50, 0, 30, 500) RETURNING id INTO v_d2;

  -- One ledger row and one claim for each tenant.
  INSERT INTO public.merchant_transactions (merchant_id, amount, transaction_type, description)
    VALUES (v_m1, -30, 'success_fee', 'mine'), (v_m2, -30, 'success_fee', 'theirs');
  PERFORM public.claim_deal(v_shopper, v_d1);

  -- B + C: the owner reads their own ledger. Before the repair this raised.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT auth_uid FROM public.users WHERE id=v_own_uid))::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_seen FROM public.merchant_transactions;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RESET ROLE;
    RAISE EXCEPTION 'B: authenticated read still fails: %', v_err;
  END;
  RESET ROLE;

  ASSERT v_seen = 1,
    format('C/D: owner must see exactly their OWN ledger row, saw %s', v_seen);

  -- D: and nothing of the other tenant's, by id.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT auth_uid FROM public.users WHERE id=v_own_uid))::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen FROM public.merchant_transactions WHERE merchant_id = v_m2;
  RESET ROLE;
  ASSERT v_seen = 0, 'D: CROSS-TENANT LEAK — owner can read another shop''s ledger';

  -- E: a plain shopper sees no merchant-scoped ledger rows.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT auth_uid FROM public.users WHERE id=v_shopper))::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen FROM public.merchant_transactions;
  RESET ROLE;
  ASSERT v_seen = 0, format('E: a shopper saw %s merchant ledger row(s)', v_seen);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_m1, v_m2);
  DELETE FROM public.redemptions WHERE deal_id IN (v_d1, v_d2);
  DELETE FROM public.deals WHERE id IN (v_d1, v_d2);
  DELETE FROM public.merchants WHERE id IN (v_m1, v_m2);
  DELETE FROM public.users WHERE id IN (v_own_uid, v_other_uid, v_shopper);
  RAISE NOTICE 'B-E passed: own rows visible, cross-tenant denied, shopper sees none';
END $$;

-- F: D147 must still hold — the repair must not have widened base-table access.
DO $$
BEGIN
  ASSERT NOT has_table_privilege('authenticated', 'public.merchants', 'SELECT'),
    'F: authenticated regained SELECT on merchants — D147 isolation was traded away to silence 42501';
  ASSERT NOT has_table_privilege('authenticated', 'public.deals', 'SELECT'),
    'F: authenticated regained SELECT on deals — D147 isolation was traded away';
  ASSERT NOT has_table_privilege('anon', 'public.merchants', 'SELECT'),
    'F: anon regained SELECT on merchants';
  RAISE NOTICE 'F passed: D147 revokes intact';
END $$;

-- G: the helper answers only about the caller, and returns no merchant columns.
DO $$
DECLARE v_args INT; v_ret TEXT;
BEGIN
  SELECT pronargs, pg_catalog.format_type(prorettype, NULL)
    INTO v_args, v_ret
    FROM pg_proc WHERE proname = 'current_user_merchant_ids'
     AND pronamespace = 'public'::regnamespace;
  ASSERT v_args = 0,
    'G: the helper takes arguments — a caller could aim it at another user''s shops';
  ASSERT v_ret = 'uuid',
    format('G: the helper must return bare uuids, not merchant data (returns %s)', v_ret);
  ASSERT (SELECT prosecdef FROM pg_proc WHERE proname='current_user_merchant_ids'
            AND pronamespace='public'::regnamespace),
    'G: the helper must be SECURITY DEFINER or it cannot read merchants either';
  RAISE NOTICE 'G passed: helper is argument-free, definer, uuid-only';
END $$;

-- H: anon holds no EXECUTE on it.
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.current_user_merchant_ids()', 'EXECUTE'),
    'H: anon can execute the ownership helper';
  RAISE NOTICE 'H passed: anon has no EXECUTE on the helper';
END $$;

SELECT 'merchant_tenant_policy_repair_test: ALL SCENARIOS PASSED' AS result;
