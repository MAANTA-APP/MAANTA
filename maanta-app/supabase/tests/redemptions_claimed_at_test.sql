-- ============================================================
-- Test: redemptions.claimed_at — the claim timestamp D164 added
-- (20260824130000_redemptions_claimed_at.sql)
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
--   E  a re-claim while the first ticket is still PENDING is refused and
--      creates no second row (the guard only applies while pending)
--   F  the KPI's own filter shape returns the claim — this is the query that
--      was silently broken, so it is asserted directly rather than by proxy
--   G  historical rows stay NULL and are excluded from the count
--   H  the seven-day boundary EXACTLY: on it counts (inclusive >=), one
--      second inside counts, one second outside does not
--   I  the index exists and is on the column the KPI filters
--   J  the migration recorded when tracking began
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

  -- E: a second claim WHILE THE FIRST IS STILL PENDING is refused, so no stray
  -- row and no second timestamp.
  --
  -- Order matters, and an earlier draft got it wrong: this was originally
  -- asserted AFTER verification, where it is simply false. `claim_deal` guards
  -- on `active_claim_already_exists` only while a claim is `pending`, and this
  -- deal has `max_claims` NULL (unlimited) — so once the ticket is redeemed a
  -- fresh claim is legitimate and a second row SHOULD appear. CI's fresh
  -- database caught it; production would have too. The guard being tested is
  -- the one a shopper actually meets: tapping Claim twice on a live ticket.
  BEGIN
    PERFORM public.claim_deal(v_uid, v_did);
    RAISE EXCEPTION 'E: a second claim on a still-pending ticket must be refused, but it succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'E:%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%active_claim_already_exists%',
        format('E: expected active_claim_already_exists, got: %s', SQLERRM);
  END;
  ASSERT (SELECT count(*) FROM public.redemptions WHERE deal_id = v_did AND user_id = v_uid) = 1,
    'E: a refused re-claim must not create a second redemption';

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

  -- Clear EVERY child a verify can create before the parent rows. Several of
  -- these FKs are NO ACTION, so a stray row makes the merchant DELETE fail and
  -- the whole scenario error out for reasons unrelated to what it tests.
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.audit_logs WHERE merchant_id = v_mid;
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

  -- Clear EVERY child a verify can create before the parent rows. Several of
  -- these FKs are NO ACTION, so a stray row makes the merchant DELETE fail and
  -- the whole scenario error out for reasons unrelated to what it tests.
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.audit_logs WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid);
  RAISE NOTICE 'Scenario D passed: a failed verification leaves claimed_at untouched';
END $$;

-- Scenario G: HISTORICAL ROWS STAY NULL.
--
-- The single most important property of this migration. A row that existed
-- before it must not have acquired a claim time — `ADD COLUMN ... DEFAULT` on
-- PG11+ would have stamped every one of them with the migration timestamp,
-- putting fabricated data on a money-adjacent audit record. This asserts the
-- shape that prevents it rather than the row count, which differs per database
-- (a fresh CI database has no history at all, production had 401 rows).
DO $$
DECLARE
  v_rid       UUID;
  v_uid       UUID;
  v_mid       UUID;
  v_did       UUID;
  v_auth      UUID := gen_random_uuid();
  v_claimed   TIMESTAMPTZ;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_claimed_at_hist', 'test.claimed.hist', '+254700000779', 'BBS Mall', 'active', TRUE, 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test hist deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  -- Stand in for a pre-migration row: an insert that explicitly supplies NULL,
  -- exactly as a historical row looks after the column was added without a
  -- backfill. If someone later adds a NOT NULL or a backfill, this fails.
  INSERT INTO public.redemptions (
    deal_id, merchant_id, user_id, otp_code, success_fee_charged,
    status, expires_at, amount_kes, claimed_at
  )
  VALUES (v_did, v_mid, v_uid, '999001', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NULL)
  RETURNING id INTO v_rid;

  SELECT claimed_at INTO v_claimed FROM public.redemptions WHERE id = v_rid;
  ASSERT v_claimed IS NULL,
    'G: a row inserted with claimed_at NULL must STAY null — no backfill, no NOT NULL';

  -- And it must be invisible to the KPI rather than counted as a recent claim.
  ASSERT (SELECT count(*) FROM public.redemptions
          WHERE id = v_rid AND claimed_at >= NOW() - INTERVAL '7 days') = 0,
    'G: an untracked historical claim must not be counted by Claims (7d)';

  DELETE FROM public.redemptions WHERE id = v_rid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario G passed: historical rows stay NULL and are excluded from the KPI';
END $$;

-- Scenario H: the SEVEN-DAY BOUNDARY behaves. Inside counts, outside does not.
DO $$
DECLARE
  v_uid   UUID;
  v_mid   UUID;
  v_did   UUID;
  v_auth  UUID := gen_random_uuid();
  v_in       UUID;
  v_edge     UUID;
  v_out      UUID;
  v_exact    UUID;
  v_just_in  UUID;
  v_just_out UUID;
  v_count    INT;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_claimed_at_window', 'test.claimed.window', '+254700000780', 'BBS Mall', 'active', TRUE, 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test window deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes, claimed_at)
    VALUES (v_did, v_mid, v_uid, '999002', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NOW() - INTERVAL '1 day')
    RETURNING id INTO v_in;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes, claimed_at)
    VALUES (v_did, v_mid, v_uid, '999003', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NOW() - INTERVAL '6 days 23 hours')
    RETURNING id INTO v_edge;
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes, claimed_at)
    VALUES (v_did, v_mid, v_uid, '999004', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NOW() - INTERVAL '8 days')
    RETURNING id INTO v_out;

  -- THE BOUNDARY ITSELF. `now()` is the transaction timestamp and is stable
  -- inside this block, so a row written at exactly `NOW() - 7 days` and a
  -- predicate of `>= NOW() - 7 days` compare against the identical instant —
  -- the test is deterministic, not a race. The predicate is inclusive (`>=`),
  -- so a claim landing exactly on the boundary COUNTS. `claimsWindow()` uses
  -- the same inclusive comparison (`covered >= WINDOW_MS`) for its label
  -- transition, so the two halves of this KPI agree at the edge.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes, claimed_at)
    VALUES (v_did, v_mid, v_uid, '999005', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NOW() - INTERVAL '7 days')
    RETURNING id INTO v_exact;
  -- One second inside the window.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes, claimed_at)
    VALUES (v_did, v_mid, v_uid, '999006', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NOW() - INTERVAL '7 days' + INTERVAL '1 second')
    RETURNING id INTO v_just_in;
  -- One second outside it.
  INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes, claimed_at)
    VALUES (v_did, v_mid, v_uid, '999007', 30, 'pending', NOW() + INTERVAL '1 hour', 100, NOW() - INTERVAL '7 days' - INTERVAL '1 second')
    RETURNING id INTO v_just_out;

  SELECT count(*) INTO v_count FROM public.redemptions
   WHERE id IN (v_in, v_edge, v_out) AND claimed_at >= NOW() - INTERVAL '7 days';
  ASSERT v_count = 2,
    format('H: the 7-day window must count the 1-day and 6d23h claims and exclude the 8-day one, got %s', v_count);

  -- Exactly on the boundary: counted, because the predicate is inclusive.
  ASSERT (SELECT count(*) FROM public.redemptions
          WHERE id = v_exact AND claimed_at >= NOW() - INTERVAL '7 days') = 1,
    'H: a claim landing EXACTLY on the 7-day boundary must be counted (the predicate is >=)';

  -- One second inside: counted.
  ASSERT (SELECT count(*) FROM public.redemptions
          WHERE id = v_just_in AND claimed_at >= NOW() - INTERVAL '7 days') = 1,
    'H: a claim one second inside the 7-day boundary must be counted';

  -- One second outside: not counted.
  ASSERT (SELECT count(*) FROM public.redemptions
          WHERE id = v_just_out AND claimed_at >= NOW() - INTERVAL '7 days') = 0,
    'H: a claim one second outside the 7-day boundary must NOT be counted';

  DELETE FROM public.redemptions WHERE id IN (v_in, v_edge, v_out, v_exact, v_just_in, v_just_out);
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario H passed: the 7-day boundary is inclusive — exactly-7d and 7d-1s count, 7d+1s does not';
END $$;

-- Scenario I: the index exists and is usable by the KPI's own predicate.
-- The table grows ~70 demo rows a day; without this the card is a seq scan.
DO $$
DECLARE
  v_indexdef TEXT;
BEGIN
  SELECT indexdef INTO v_indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'redemptions' AND indexname = 'idx_redemptions_claimed_at';

  ASSERT v_indexdef IS NOT NULL, 'I: idx_redemptions_claimed_at must exist';
  ASSERT v_indexdef ILIKE '%(claimed_at)%',
    format('I: the index must be on claimed_at, got %s', v_indexdef);
  RAISE NOTICE 'Scenario I passed: idx_redemptions_claimed_at exists on (claimed_at)';
END $$;

-- Scenario J: the migration recorded WHEN tracking began, so the dashboards can
-- tell "no claims" apart from "we only started counting on Tuesday".
DO $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT value INTO v_value FROM public.app_config WHERE key = 'claims_tracking_started_at';
  ASSERT v_value IS NOT NULL,
    'J: app_config.claims_tracking_started_at must be seeded by the migration';
  ASSERT v_value::timestamptz <= NOW(),
    format('J: tracking start must not be in the future, got %s', v_value);
  RAISE NOTICE 'Scenario J passed: claims tracking start is recorded';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL redemptions_claimed_at scenarios passed.'; END $$;
