-- ============================================================
-- Test: redemptions.claimed_at — the claim timestamp D164 added
-- (20260824120000_redemptions_claimed_at.sql)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/redemptions_claimed_at_test.sql
--
-- What this pins, and why each half matters:
--   A  the column exists, is nullable, and its default is now() — the exact
--      shape that keeps history honest while stamping every future claim
--   B  a real claim through claim_deal gets a server-generated claimed_at
--   C  verification does NOT move it (the number would otherwise drift to the
--      redemption time and claim-to-visit conversion would read as instant)
--   D  a rejected/failed verification does not move it either
--   E  a claim that is REFUSED creates no row, so no stray timestamp
--   F  the KPI's own filter shape returns the claim — this is the query that
--      was silently broken, so it is asserted directly rather than by proxy
-- ============================================================

-- Scenario A: column shape. The two-step ADD-then-SET-DEFAULT is the point —
-- a single ADD COLUMN ... DEFAULT would have backfilled every historical row
-- with the migration timestamp, fabricating claim times on an audit record.
DO $$
DECLARE
  v_nullable TEXT;
  v_default  TEXT;
  v_type     TEXT;
BEGIN
  SELECT is_nullable, column_default, data_type
    INTO v_nullable, v_default, v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'redemptions' AND column_name = 'claimed_at';

  ASSERT v_type IS NOT NULL, 'A: redemptions.claimed_at must exist';
  ASSERT v_type = 'timestamp with time zone',
    format('A: claimed_at must be timestamptz, got %s', v_type);
  ASSERT v_nullable = 'YES',
    'A: claimed_at must stay NULLABLE — historical claims are unknowable and must not be invented';
  ASSERT v_default ILIKE '%now()%',
    format('A: claimed_at must default to now() so the DATABASE stamps it, got %s', COALESCE(v_default, '<none>'));
  RAISE NOTICE 'Scenario A passed: claimed_at is a nullable timestamptz defaulting to now()';
END $$;

-- Scenario B–F: one claim, carried through verification.
DO $$
DECLARE
  v_auth        UUID := gen_random_uuid();
  v_uid         UUID;
  v_mid         UUID;
  v_did         UUID;
  v_rid         UUID;
  v_otp         TEXT;
  v_claimed     TIMESTAMPTZ;
  v_claimed_after TIMESTAMPTZ;
  v_before      TIMESTAMPTZ;
  v_after       TIMESTAMPTZ;
  v_kpi_count   INT;
  v_status      TEXT;
  v_owner_auth  UUID := gen_random_uuid();
  v_owner_uid   UUID;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_claimed_at', 'test.claimed.at', '+254700000777', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test claimed_at deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);

  v_before := clock_timestamp();
  SELECT redemption_id, otp_code INTO v_rid, v_otp FROM public.claim_deal(v_uid, v_did);
  v_after := clock_timestamp();

  -- B: the claim is stamped, by the database, inside the window of the call.
  SELECT claimed_at INTO v_claimed FROM public.redemptions WHERE id = v_rid;
  ASSERT v_claimed IS NOT NULL, 'B: a new claim must record claimed_at';
  ASSERT v_claimed BETWEEN v_before - INTERVAL '5 seconds' AND v_after + INTERVAL '5 seconds',
    format('B: claimed_at must be server time at claim, got %s (window %s .. %s)', v_claimed, v_before, v_after);

  -- F: the KPI's actual filter shape finds it. This is the query that was
  -- broken; asserting it here means a future rename cannot silently re-break it.
  SELECT count(*) INTO v_kpi_count
  FROM public.redemptions
  WHERE claimed_at >= NOW() - INTERVAL '7 days' AND id = v_rid;
  ASSERT v_kpi_count = 1, 'F: the Claims (7d) filter must count a claim made just now';

  -- C: verification must not move it. Authenticate as the shop owner.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner_auth::text, 'role', 'authenticated')::text, true);
  PERFORM public.verify_redemption(v_mid, v_otp, 'test-device');

  SELECT status, claimed_at INTO v_status, v_claimed_after FROM public.redemptions WHERE id = v_rid;
  ASSERT v_status = 'success', format('C: redemption should have verified, got %s', v_status);
  ASSERT v_claimed_after = v_claimed,
    format('C: verification must NOT rewrite claimed_at (%s -> %s)', v_claimed, v_claimed_after);
  ASSERT (SELECT redeemed_at FROM public.redemptions WHERE id = v_rid) IS NOT NULL,
    'C: redeemed_at is the verification time and must be set separately';

  -- E: a second claim on the same deal is refused, so no stray row/timestamp.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.claim_deal(v_uid, v_did);
    -- Some refusal paths return a row with an error code rather than raising;
    -- either way there must be exactly one redemption for this user+deal.
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  ASSERT (SELECT count(*) FROM public.redemptions WHERE deal_id = v_did AND user_id = v_uid) = 1,
    'E: a refused re-claim must not create a second redemption';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid);
  RAISE NOTICE 'Scenarios B,C,E,F passed: claimed_at is stamped at claim, survives verification, and the KPI filter finds it';
END $$;

-- Scenario D: a FAILED verification must not move claimed_at either. A wrong
-- OTP leaves the claim untouched, so the claim time must be exactly as minted.
DO $$
DECLARE
  v_auth       UUID := gen_random_uuid();
  v_owner_auth UUID := gen_random_uuid();
  v_uid        UUID;
  v_owner_uid  UUID;
  v_mid        UUID;
  v_did        UUID;
  v_rid        UUID;
  v_claimed    TIMESTAMPTZ;
  v_after      TIMESTAMPTZ;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_claimed_at_fail', 'test.claimed.fail', '+254700000778', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test claimed_at fail deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_id INTO v_rid FROM public.claim_deal(v_uid, v_did);
  SELECT claimed_at INTO v_claimed FROM public.redemptions WHERE id = v_rid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner_auth::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.verify_redemption(v_mid, '000000', 'test-device');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT claimed_at INTO v_after FROM public.redemptions WHERE id = v_rid;
  ASSERT v_after = v_claimed,
    format('D: a failed verification must not rewrite claimed_at (%s -> %s)', v_claimed, v_after);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid);
  RAISE NOTICE 'Scenario D passed: a failed verification leaves claimed_at untouched';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL redemptions_claimed_at scenarios passed.'; END $$;
