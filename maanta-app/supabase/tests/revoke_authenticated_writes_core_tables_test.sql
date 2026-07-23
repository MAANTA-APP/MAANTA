-- ============================================================
-- Test: revoke authenticated writes on core tables
-- (20260723120000_revoke_authenticated_writes_core_tables.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/revoke_authenticated_writes_core_tables_test.sql
-- ============================================================

-- Scenario A: grant posture — authenticated may SELECT but not write.
DO $$
BEGIN
  ASSERT has_table_privilege('authenticated', 'public.merchants', 'SELECT'),
    'A: authenticated must retain SELECT on merchants';
  ASSERT NOT has_table_privilege('authenticated', 'public.merchants', 'INSERT'),
    'A: authenticated must not INSERT merchants';
  ASSERT NOT has_table_privilege('authenticated', 'public.merchants', 'UPDATE'),
    'A: authenticated must not UPDATE merchants';
  ASSERT NOT has_table_privilege('authenticated', 'public.merchants', 'DELETE'),
    'A: authenticated must not DELETE merchants';

  ASSERT has_table_privilege('authenticated', 'public.deals', 'SELECT'),
    'A: authenticated must retain SELECT on deals';
  ASSERT NOT has_table_privilege('authenticated', 'public.deals', 'INSERT'),
    'A: authenticated must not INSERT deals';
  ASSERT NOT has_table_privilege('authenticated', 'public.deals', 'UPDATE'),
    'A: authenticated must not UPDATE deals';
  ASSERT NOT has_table_privilege('authenticated', 'public.deals', 'DELETE'),
    'A: authenticated must not DELETE deals';

  ASSERT has_table_privilege('authenticated', 'public.redemptions', 'SELECT'),
    'A: authenticated must retain SELECT on redemptions';
  ASSERT NOT has_table_privilege('authenticated', 'public.redemptions', 'INSERT'),
    'A: authenticated must not INSERT redemptions';
  ASSERT NOT has_table_privilege('authenticated', 'public.redemptions', 'UPDATE'),
    'A: authenticated must not UPDATE redemptions';
  ASSERT NOT has_table_privilege('authenticated', 'public.redemptions', 'DELETE'),
    'A: authenticated must not DELETE redemptions';

  RAISE NOTICE 'Scenario A passed: authenticated write grants revoked on core tables';
END $$;

-- Scenario B (C-1): merchant owner cannot PATCH wallet/tier/status via PostgREST.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_mid UUID;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, user_id,
    account_balance, tier
  )
    VALUES ('__test_revoke_merch', 'test.revoke.merch', '+254700000301', 'BBS Mall', 'active', v_uid, 50, 'standard')
    RETURNING id INTO v_mid;

  SET ROLE authenticated;
  BEGIN
    UPDATE public.merchants
      SET tier = 'elite', account_balance = 999999, status = 'active', is_shadow_banned = FALSE
      WHERE id = v_mid;
    RAISE EXCEPTION 'B: merchant UPDATE should have been blocked by grant';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario B passed: authenticated cannot UPDATE merchants (C-1)';
END $$;

-- Scenario C (C-2): merchant cannot mark redemption success without verify_redemption.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, user_id, account_balance, is_visible
  )
    VALUES ('__test_revoke_red', 'test.revoke.red', '+254700000302', 'BBS Mall', 'active', v_uid, 100, TRUE)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at)
    VALUES (v_mid, '__test revoke deal', 'x', TRUE, NOW() + INTERVAL '2 hours')
    RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '123456', 'pending', NOW() + INTERVAL '1 hour', 30)
    RETURNING id INTO v_rid;

  SET ROLE authenticated;
  BEGIN
    UPDATE public.redemptions SET status = 'success', redeemed_at = NOW() WHERE id = v_rid;
    RAISE EXCEPTION 'C: redemption UPDATE should have been blocked by grant';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario C passed: authenticated cannot UPDATE redemptions (C-2)';
END $$;

-- Scenario D (C-3): merchant cannot PATCH deal boost/claims caps via PostgREST.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, user_id, account_balance, is_visible
  )
    VALUES ('__test_revoke_deal', 'test.revoke.deal', '+254700000303', 'BBS Mall', 'active', v_uid, 100, TRUE)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (
    merchant_id, title, image_url, is_active, expires_at, boost_active, claims_count, max_claims
  )
    VALUES (v_mid, '__test revoke boost', 'x', TRUE, NOW() + INTERVAL '2 hours', FALSE, 5, 10)
    RETURNING id INTO v_did;

  SET ROLE authenticated;
  BEGIN
    UPDATE public.deals
      SET boost_active = TRUE, claims_count = 0, max_claims = NULL, is_active = TRUE
      WHERE id = v_did;
    RAISE EXCEPTION 'D: deal UPDATE should have been blocked by grant';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario D passed: authenticated cannot UPDATE deals (C-3)';
END $$;

-- Scenario E: SECURITY DEFINER RPCs still work for legitimate flows.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_status TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance
  )
    VALUES ('__test_revoke_rpc', 'test.revoke.rpc', '+254700000304', 'BBS Mall', 'active', TRUE, 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test rpc deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  SELECT redemption_id INTO v_rid
    FROM public.claim_deal(v_uid, v_did);
  ASSERT v_rid IS NOT NULL, 'E: claim_deal should still create a redemption';

  SELECT status INTO v_status FROM public.redemptions WHERE id = v_rid;
  ASSERT v_status = 'pending', format('E: expected pending redemption, got %s', v_status);

  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario E passed: claim_deal still works after write revoke';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL revoke_authenticated_writes_core_tables scenarios passed.'; END $$;
