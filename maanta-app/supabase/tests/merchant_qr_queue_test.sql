-- ============================================================
-- Test: merchant counter QR token + presentation queue
-- (20260826130000_merchant_qr_queue.sql)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/merchant_qr_queue_test.sql
--
-- What this pins, and why:
--   A  every merchant carries a token: NOT NULL, UNIQUE, 32 hex chars, and
--      two merchants never share one (backfill + default both mint fresh)
--   B  the token LEAKS NOWHERE a client can read: neither public browse view
--      exposes qr_token — the column lists are enumerated, and this assert
--      is what keeps a future view rewrite from quietly adding it
--   C  queue shape: RLS on, shopper-own + admin SELECT only, no client
--      writes; at most one WAITING entry per redemption (partial unique),
--      while a cancelled/dismissed row frees the slot for a fresh check-in
--   D  a shopper reads only their OWN check-ins through RLS — another
--      authenticated user sees zero rows
-- ============================================================

-- Scenario A: token shape on existing and new merchants.
DO $$
DECLARE
  v_owner_auth UUID := gen_random_uuid();
  v_owner_uid  UUID;
  v_mid        UUID;
  v_token      TEXT;
  v_nullable   TEXT;
  v_bad        INT;
BEGIN
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'qr_token';
  ASSERT v_nullable = 'NO', 'A: qr_token must be NOT NULL — every merchant has a counter identity';

  -- Every pre-existing row got a well-formed token from the backfill.
  SELECT count(*) INTO v_bad FROM public.merchants
  WHERE qr_token IS NULL OR qr_token !~ '^[0-9a-f]{32}$';
  ASSERT v_bad = 0, format('A: %s merchant(s) carry a malformed qr_token', v_bad);

  -- A new merchant mints its own.
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_qr_token', 'qr.token.test', '+254700000291', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id, qr_token INTO v_mid, v_token;
  ASSERT v_token ~ '^[0-9a-f]{32}$',
    format('A: a new merchant must mint a 32-hex token, got %s', v_token);

  SELECT count(*) INTO v_bad FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'merchants'
    AND indexname = 'merchants_qr_token_key' AND indexdef ILIKE '%UNIQUE%';
  ASSERT v_bad = 1, 'A: qr_token must be UNIQUE';

  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_owner_uid;
  RAISE NOTICE 'Scenario A passed: qr_token NOT NULL, UNIQUE, 32 hex on old and new rows';
END $$;

-- Scenario B: the token is not readable through any public surface.
DO $$
DECLARE
  v_leak INT;
BEGIN
  SELECT count(*) INTO v_leak
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('merchants_public_browse', 'deals_public_browse')
    AND column_name = 'qr_token';
  ASSERT v_leak = 0, 'B: qr_token must not appear in any public browse view';
  RAISE NOTICE 'Scenario B passed: qr_token exposed by neither browse view';
END $$;

-- Scenario C: queue shape — RLS, grants, and the one-waiting-entry rule.
DO $$
DECLARE
  v_auth       UUID := gen_random_uuid();
  v_owner_auth UUID := gen_random_uuid();
  v_uid        UUID;
  v_owner_uid  UUID;
  v_mid        UUID;
  v_did        UUID;
  v_rid        UUID;
  v_rls        BOOLEAN;
  v_cnt        INT;
  v_p1         UUID;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.merchant_presentations'::regclass;
  ASSERT v_rls, 'C: merchant_presentations must have RLS enabled';

  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'merchant_presentations';
  ASSERT v_cnt = 2, format('C: exactly the own + admin SELECT policies, got %s', v_cnt);

  ASSERT NOT has_table_privilege('authenticated', 'public.merchant_presentations', 'INSERT'),
    'C: authenticated must not INSERT queue rows directly';
  ASSERT NOT has_table_privilege('authenticated', 'public.merchant_presentations', 'UPDATE'),
    'C: authenticated must not UPDATE queue rows directly';

  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_qr_queue', 'qr.queue.test', '+254700000292', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test qr queue deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at)
    VALUES (v_did, v_mid, v_uid, '910001', 'pending', NOW() + INTERVAL '2 hours')
    RETURNING id INTO v_rid;

  INSERT INTO public.merchant_presentations (merchant_id, redemption_id, shopper_id, expires_at)
    VALUES (v_mid, v_rid, v_uid, NOW() + INTERVAL '10 minutes')
    RETURNING id INTO v_p1;

  -- A second WAITING entry for the same claim must be impossible.
  BEGIN
    INSERT INTO public.merchant_presentations (merchant_id, redemption_id, shopper_id, expires_at)
      VALUES (v_mid, v_rid, v_uid, NOW() + INTERVAL '10 minutes');
    RAISE EXCEPTION 'C: a duplicate waiting entry must be refused, but it succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- exactly right
  END;

  -- A cancelled entry frees the slot: fresh check-in on a still-valid claim.
  UPDATE public.merchant_presentations SET status = 'cancelled' WHERE id = v_p1;
  INSERT INTO public.merchant_presentations (merchant_id, redemption_id, shopper_id, expires_at)
    VALUES (v_mid, v_rid, v_uid, NOW() + INTERVAL '10 minutes');
  SELECT count(*) INTO v_cnt FROM public.merchant_presentations WHERE redemption_id = v_rid;
  ASSERT v_cnt = 2, format('C: cancelled + fresh waiting should coexist, got %s rows', v_cnt);

  DELETE FROM public.merchant_presentations WHERE redemption_id = v_rid;
  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid);
  RAISE NOTICE 'Scenario C passed: RLS on, no client writes, one waiting entry per claim, cancelled frees the slot';
END $$;

-- Scenario D: RLS scoping — a shopper reads only their own check-ins.
DO $$
DECLARE
  v_auth        UUID := gen_random_uuid();
  v_other_auth  UUID := gen_random_uuid();
  v_owner_auth  UUID := gen_random_uuid();
  v_uid         UUID;
  v_other_uid   UUID;
  v_owner_uid   UUID;
  v_mid         UUID;
  v_did         UUID;
  v_rid         UUID;
  v_cnt         INT;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_other_auth) RETURNING id INTO v_other_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_qr_rls', 'qr.rls.test', '+254700000293', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test qr rls deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, status, expires_at)
    VALUES (v_did, v_mid, v_uid, '910002', 'pending', NOW() + INTERVAL '2 hours')
    RETURNING id INTO v_rid;
  INSERT INTO public.merchant_presentations (merchant_id, redemption_id, shopper_id, expires_at)
    VALUES (v_mid, v_rid, v_uid, NOW() + INTERVAL '10 minutes');

  -- The owner of the check-in sees it…
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_cnt FROM public.merchant_presentations WHERE redemption_id = v_rid;
  ASSERT v_cnt = 1, format('D: the shopper must see their own check-in, saw %s', v_cnt);

  -- …and a different shopper sees nothing at all.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other_auth::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt FROM public.merchant_presentations WHERE redemption_id = v_rid;
  ASSERT v_cnt = 0, format('D: another shopper must see zero queue rows, saw %s', v_cnt);

  PERFORM set_config('role', 'postgres', true);
  DELETE FROM public.merchant_presentations WHERE redemption_id = v_rid;
  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_other_uid, v_owner_uid);
  RAISE NOTICE 'Scenario D passed: RLS scopes the queue to the shopper''s own rows';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL merchant_qr_queue scenarios passed.'; END $$;
