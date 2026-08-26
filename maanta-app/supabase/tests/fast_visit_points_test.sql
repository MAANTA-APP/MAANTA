-- ============================================================
-- Test: Fast Visit reward + MAANTA Points
-- (20260826120000_fast_visit_points.sql)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fast_visit_points_test.sql
--
-- What this pins, and why:
--   A  schema + privilege shape: arrived_at nullable with NO default (only
--      the RPC writes it); reward_events append-only with a UNIQUE reference
--      and RLS on; award RPC NOT executable by authenticated (server-side
--      only); both config rows seeded
--   B  the whole happy path through the REAL RPCs: claim -> arrival (shopper
--      JWT) -> verify (owner JWT) -> award = exactly one ledger row; replay
--      awards nothing more; merchant balance untouched by the award (the KES
--      30 fee moved at verify, and only there)
--   C  arrival is idempotent — first arrival wins, a re-scan never moves the
--      reward timestamp
--   D  arrival at the WRONG merchant is refused (same-merchant rule enforced
--      where the timestamp is written)
--   E  a different shopper cannot record arrival on someone else's claim
--   F  the 15-minute boundary EXACTLY, decided AT ARRIVAL by the real RPC:
--      14:59 qualifies, 15:00.000 qualifies (<=), 15:00 + 1s does not (but
--      the late arrival is still recorded — a normal check-in, no failure);
--      a claim with historical claimed_at NULL never qualifies
--   G  no arrival -> no points; unverified (still pending) -> no points
--   H  an expired or already-redeemed claim refuses arrival
--   I  qualification is decided at ARRIVAL time and is immutable:
--      I1 gate OFF at arrival -> the arrival NEVER becomes reward-eligible,
--         even after the gate turns ON and staff verify (no retroactive
--         qualification), and a re-scan while ON does not upgrade it;
--      I2 gate ON at a qualifying arrival -> earned eligibility survives the
--         gate turning OFF before verification — the award still lands
--
-- The suite flips fast_visit_enabled to 'true' for its scenarios and restores
-- 'false' (the seeded value) at the end — self-contained and self-cleaning.
-- ============================================================

-- The feature gate ships dark ('false'); these scenarios need it on.
UPDATE public.app_config SET value = 'true' WHERE key = 'fast_visit_enabled';

-- Scenario A: schema and privilege shape.
DO $$
DECLARE
  v_nullable TEXT;
  v_default  TEXT;
  v_type     TEXT;
  v_rls      BOOLEAN;
  v_cnt      INT;
BEGIN
  SELECT is_nullable, column_default, data_type
    INTO v_nullable, v_default, v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'redemptions' AND column_name = 'arrived_at';

  ASSERT v_type = 'timestamp with time zone',
    format('A: arrived_at must be timestamptz, got %s', COALESCE(v_type, '<missing>'));
  ASSERT v_nullable = 'YES', 'A: arrived_at must be nullable — NULL means no check-in';
  ASSERT v_default IS NULL,
    format('A: arrived_at must have NO default — only record_shopper_arrival writes it, got %s', v_default);

  SELECT is_nullable, column_default, data_type
    INTO v_nullable, v_default, v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'redemptions' AND column_name = 'fast_visit_qualified_at';

  ASSERT v_type = 'timestamp with time zone',
    format('A: fast_visit_qualified_at must be timestamptz, got %s', COALESCE(v_type, '<missing>'));
  ASSERT v_nullable = 'YES', 'A: fast_visit_qualified_at must be nullable — NULL means did not qualify';
  ASSERT v_default IS NULL,
    format('A: fast_visit_qualified_at must have NO default — only record_shopper_arrival writes it, got %s', v_default);

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.reward_events'::regclass;
  ASSERT v_rls, 'A: reward_events must have RLS enabled';

  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'reward_events';
  ASSERT v_cnt = 2, format('A: reward_events must carry exactly the own + admin SELECT policies, got %s', v_cnt);

  SELECT count(*) INTO v_cnt FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'reward_events' AND indexdef ILIKE '%UNIQUE%reference%';
  ASSERT v_cnt = 1, 'A: reward_events.reference must be UNIQUE — it is the idempotency key';

  ASSERT NOT has_table_privilege('authenticated', 'public.reward_events', 'INSERT'),
    'A: authenticated must not INSERT into the points ledger directly';
  ASSERT NOT has_function_privilege('authenticated', 'public.award_fast_visit_points(uuid)', 'EXECUTE'),
    'A: the award RPC is server-side only — authenticated must not execute it';
  ASSERT has_function_privilege('authenticated', 'public.record_shopper_arrival(uuid, uuid, uuid)', 'EXECUTE'),
    'A: shoppers (authenticated) must be able to record their own arrival';

  SELECT count(*) INTO v_cnt FROM public.app_config
  WHERE key IN ('fast_visit_points', 'fast_visit_enabled');
  ASSERT v_cnt = 2, format('A: both fast_visit config rows must be seeded, found %s', v_cnt);

  RAISE NOTICE 'Scenario A passed: schema, RLS and privilege shape';
END $$;

-- Scenario B + C: the whole loop through the real RPCs, arrival idempotency,
-- award idempotency, and fee-path isolation.
DO $$
DECLARE
  v_auth       UUID := gen_random_uuid();
  v_owner_auth UUID := gen_random_uuid();
  v_uid        UUID;
  v_owner_uid  UUID;
  v_mid        UUID;
  v_did        UUID;
  v_rid        UUID;
  v_otp        TEXT;
  v_arrived    TIMESTAMPTZ;
  v_arrived2   TIMESTAMPTZ;
  v_first      BOOLEAN;
  v_eligible   BOOLEAN;
  v_awarded    BOOLEAN;
  v_points     INT;
  v_balance    BIGINT;
  v_rows       INT;
  v_merchant_balance NUMERIC;
  v_merchant_balance_after NUMERIC;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_fast_visit', 'fast.visit.test', '+254700000281', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test fast visit deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  -- Claim as the shopper.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_id, otp_code INTO v_rid, v_otp FROM public.claim_deal(v_uid, v_did);

  -- Arrive (still the shopper). Within 15 minutes by construction.
  SELECT arrived_at, fast_visit_eligible, first_arrival
    INTO v_arrived, v_eligible, v_first
    FROM public.record_shopper_arrival(v_uid, v_mid, v_rid);
  ASSERT v_arrived IS NOT NULL, 'B: arrival must be stamped';
  ASSERT v_first, 'B: the first check-in must report first_arrival';
  ASSERT v_eligible, 'B: an immediate arrival with the gate ON must be Fast Visit eligible';
  ASSERT (SELECT arrived_at FROM public.redemptions WHERE id = v_rid) = v_arrived,
    'B: the stamp must land on the redemption row';
  ASSERT (SELECT fast_visit_qualified_at FROM public.redemptions WHERE id = v_rid) = v_arrived,
    'B: the qualification verdict must be persisted at arrival, same instant as the stamp';

  -- C: a re-scan is fine but never moves the evidence — neither the arrival
  -- stamp nor the persisted qualification verdict.
  SELECT arrived_at, first_arrival INTO v_arrived2, v_first
    FROM public.record_shopper_arrival(v_uid, v_mid, v_rid);
  ASSERT NOT v_first, 'C: a second check-in must not report first_arrival';
  ASSERT v_arrived2 = v_arrived,
    format('C: first arrival wins — arrived_at must not move (%s -> %s)', v_arrived, v_arrived2);
  ASSERT (SELECT fast_visit_qualified_at FROM public.redemptions WHERE id = v_rid) = v_arrived,
    'C: a re-scan must not move the qualification timestamp either';

  -- The QR scan itself must never award: no ledger row exists yet.
  SELECT count(*) INTO v_rows FROM public.reward_events WHERE redemption_id = v_rid;
  ASSERT v_rows = 0, 'B: arrival alone must not create a reward — points wait for verification';

  -- Verify as the shop owner (this charges the KES 30 fee).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner_auth::text, 'role', 'authenticated')::text, true);
  PERFORM public.verify_redemption(v_mid, v_otp, 'test-device');
  SELECT account_balance INTO v_merchant_balance FROM public.merchants WHERE id = v_mid;

  -- Award (server-side context).
  SELECT awarded, points, balance INTO v_awarded, v_points, v_balance
    FROM public.award_fast_visit_points(v_rid);
  ASSERT v_awarded, 'B: a verified, qualifying Fast Visit must award';
  ASSERT v_points = 50, format('B: the seeded config awards 50 points, got %s', v_points);
  ASSERT v_balance = 50, format('B: the derived balance must be 50, got %s', v_balance);

  -- Replay: same call again — no duplicate, same balance.
  SELECT awarded, points, balance INTO v_awarded, v_points, v_balance
    FROM public.award_fast_visit_points(v_rid);
  ASSERT NOT v_awarded, 'B: a replayed award must be a no-op';
  ASSERT v_points = 0, 'B: a replayed award must report 0 new points';
  ASSERT v_balance = 50, format('B: the balance must not grow on replay, got %s', v_balance);
  SELECT count(*) INTO v_rows FROM public.reward_events WHERE redemption_id = v_rid;
  ASSERT v_rows = 1, format('B: exactly one ledger row per redemption, got %s', v_rows);

  -- Fee-path isolation: the award moved no merchant money.
  SELECT account_balance INTO v_merchant_balance_after FROM public.merchants WHERE id = v_mid;
  ASSERT v_merchant_balance_after = v_merchant_balance,
    format('B: the award must not touch the merchant wallet (%s -> %s)', v_merchant_balance, v_merchant_balance_after);

  -- Clear EVERY child a verify can create before the parent rows.
  DELETE FROM public.reward_events WHERE redemption_id = v_rid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.guardian_events WHERE merchant_id = v_mid;
  DELETE FROM public.fraud_events WHERE merchant_id = v_mid;
  DELETE FROM public.agent_tasks WHERE merchant_id = v_mid;
  DELETE FROM public.audit_logs WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid);

  RAISE NOTICE 'Scenario B+C passed: claim -> arrival -> verify -> exactly one award; arrival and award both idempotent; wallet untouched by the award';
END $$;

-- Scenario D + E + G + H: refusals — wrong merchant, wrong shopper, no
-- arrival, unverified, expired, already-redeemed.
DO $$
DECLARE
  v_auth        UUID := gen_random_uuid();
  v_thief_auth  UUID := gen_random_uuid();
  v_owner_auth  UUID := gen_random_uuid();
  v_owner2_auth UUID := gen_random_uuid();
  v_uid         UUID;
  v_thief_uid   UUID;
  v_owner_uid   UUID;
  v_owner2_uid  UUID;
  v_mid         UUID;
  v_mid2        UUID;
  v_did         UUID;
  v_rid         UUID;
  v_otp         TEXT;
  v_awarded     BOOLEAN;
  v_rows        INT;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_thief_auth) RETURNING id INTO v_thief_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth) RETURNING id INTO v_owner_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner2_auth) RETURNING id INTO v_owner2_uid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid, '__test_fast_visit_d', 'fast.visit.dee', '+254700000282', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner2_uid, '__test_fast_visit_other', 'fast.visit.oth', '+254700000283', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid2;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test fast visit refusals', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_id, otp_code INTO v_rid, v_otp FROM public.claim_deal(v_uid, v_did);

  -- D: scanning merchant B's counter must not mark a claim held at merchant A.
  BEGIN
    PERFORM public.record_shopper_arrival(v_uid, v_mid2, v_rid);
    RAISE EXCEPTION 'D: arrival at the wrong merchant must be refused, but it succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'D:%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%arrival_merchant_mismatch%',
      format('D: expected arrival_merchant_mismatch, got: %s', SQLERRM);
  END;

  -- E: a different signed-in shopper cannot check in on someone else's claim —
  -- and cannot even learn whether the id exists.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_thief_auth::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.record_shopper_arrival(v_thief_uid, v_mid, v_rid);
    RAISE EXCEPTION 'E: arrival on another shopper''s claim must be refused, but it succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'E:%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%arrival_claim_not_found%',
      format('E: expected arrival_claim_not_found (no probing), got: %s', SQLERRM);
  END;
  BEGIN
    PERFORM public.record_shopper_arrival(v_uid, v_mid, v_rid); -- caller != p_user_id
    RAISE EXCEPTION 'E: impersonating another shopper must be refused, but it succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'E:%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%unauthorized%',
      format('E: expected unauthorized, got: %s', SQLERRM);
  END;

  -- G: no arrival + no verification -> the award has nothing to give.
  SELECT awarded INTO v_awarded FROM public.award_fast_visit_points(v_rid);
  ASSERT NOT v_awarded, 'G: an unverified claim with no arrival must not award';
  SELECT count(*) INTO v_rows FROM public.reward_events WHERE redemption_id = v_rid;
  ASSERT v_rows = 0, 'G: no ledger row may exist for an unawarded claim';

  -- H: an expired claim refuses arrival — the reward window cannot resurrect it.
  UPDATE public.redemptions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = v_rid;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.record_shopper_arrival(v_uid, v_mid, v_rid);
    RAISE EXCEPTION 'H: arrival on an expired claim must be refused, but it succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'H:%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%arrival_claim_expired%',
      format('H: expected arrival_claim_expired, got: %s', SQLERRM);
  END;

  -- H: a non-pending claim refuses arrival too.
  UPDATE public.redemptions
    SET expires_at = NOW() + INTERVAL '1 hour', status = 'failed'
    WHERE id = v_rid;
  BEGIN
    PERFORM public.record_shopper_arrival(v_uid, v_mid, v_rid);
    RAISE EXCEPTION 'H: arrival on a non-pending claim must be refused, but it succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'H:%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%arrival_claim_not_pending%',
      format('H: expected arrival_claim_not_pending, got: %s', SQLERRM);
  END;

  DELETE FROM public.reward_events WHERE redemption_id = v_rid;
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_mid, v_mid2);
  DELETE FROM public.guardian_events WHERE merchant_id IN (v_mid, v_mid2);
  DELETE FROM public.fraud_events WHERE merchant_id IN (v_mid, v_mid2);
  DELETE FROM public.agent_tasks WHERE merchant_id IN (v_mid, v_mid2);
  DELETE FROM public.audit_logs WHERE merchant_id IN (v_mid, v_mid2);
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id IN (v_mid, v_mid2);
  DELETE FROM public.users WHERE id IN (v_uid, v_thief_uid, v_owner_uid, v_owner2_uid);

  RAISE NOTICE 'Scenario D+E+G+H passed: wrong merchant, wrong shopper, no arrival, expired and non-pending all refused';
END $$;

-- Scenario F: the exact 15-minute boundary, decided AT ARRIVAL by the real
-- RPC. Claim times are backdated (superuser UPDATE) because the boundary
-- cannot be reached by waiting in a test; NOW() is transaction-stable inside
-- this DO block, so "claimed_at = NOW() - 15 minutes" puts the RPC's own
-- arrival stamp EXACTLY on the inclusive boundary — deterministically.
DO $$
DECLARE
  v_auth       UUID := gen_random_uuid();
  v_uid        UUID;
  -- One owner + merchant + deal per boundary case: the tier trigger allows a
  -- standard merchant only 1 active deal, so the four cases cannot share one.
  v_owner_auths UUID[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_owner_uids  UUID[] := ARRAY[NULL, NULL, NULL, NULL]::uuid[];
  v_mids        UUID[] := ARRAY[NULL, NULL, NULL, NULL]::uuid[];
  v_dids        UUID[] := ARRAY[NULL, NULL, NULL, NULL]::uuid[];
  v_r_in       UUID;  -- claimed 14:59 ago — arrival now qualifies
  v_r_on       UUID;  -- claimed exactly 15:00 ago — arrival now qualifies (<=)
  v_r_out      UUID;  -- claimed 15:00 + 1s ago — arrival now does NOT qualify
  v_r_null     UUID;  -- claimed_at NULL (historical) — never qualifies
  v_eligible   BOOLEAN;
  v_first      BOOLEAN;
  v_awarded    BOOLEAN;
  v_rows       INT;
  i            INT;
  v_tmp        UUID;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  FOR i IN 1..4 LOOP
    INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auths[i]) RETURNING id INTO v_tmp;
    v_owner_uids[i] := v_tmp;
    INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
      VALUES (v_tmp, '__test_fast_visit_f' || i, 'fast.visit.f' || i, '+25470000028' || i, 'BBS Mall', 'active', TRUE, 500)
      RETURNING id INTO v_tmp;
    v_mids[i] := v_tmp;
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_tmp, '__test fv boundary ' || i, 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
      RETURNING id INTO v_tmp;
    v_dids[i] := v_tmp;
  END LOOP;

  -- Real claims, backdated claim stamps.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_id INTO v_r_in   FROM public.claim_deal(v_uid, v_dids[1]);
  SELECT redemption_id INTO v_r_on   FROM public.claim_deal(v_uid, v_dids[2]);
  SELECT redemption_id INTO v_r_out  FROM public.claim_deal(v_uid, v_dids[3]);
  SELECT redemption_id INTO v_r_null FROM public.claim_deal(v_uid, v_dids[4]);
  UPDATE public.redemptions SET claimed_at = NOW() - INTERVAL '14 minutes 59 seconds' WHERE id = v_r_in;
  UPDATE public.redemptions SET claimed_at = NOW() - INTERVAL '15 minutes'            WHERE id = v_r_on;
  UPDATE public.redemptions SET claimed_at = NOW() - INTERVAL '15 minutes 1 second'   WHERE id = v_r_out;
  UPDATE public.redemptions SET claimed_at = NULL                                     WHERE id = v_r_null;

  SELECT fast_visit_eligible INTO v_eligible FROM public.record_shopper_arrival(v_uid, v_mids[1], v_r_in);
  ASSERT v_eligible, 'F: arrival at 14:59 must qualify';
  SELECT fast_visit_eligible INTO v_eligible FROM public.record_shopper_arrival(v_uid, v_mids[2], v_r_on);
  ASSERT v_eligible, 'F: arrival at exactly 15:00 must qualify — the boundary is inclusive';
  SELECT fast_visit_eligible, first_arrival INTO v_eligible, v_first
    FROM public.record_shopper_arrival(v_uid, v_mids[3], v_r_out);
  ASSERT NOT v_eligible, 'F: arrival at 15:01 must NOT qualify';
  ASSERT v_first AND (SELECT arrived_at FROM public.redemptions WHERE id = v_r_out) IS NOT NULL,
    'F: a late arrival is still a normal recorded check-in — only the reward is gone';
  ASSERT (SELECT fast_visit_qualified_at FROM public.redemptions WHERE id = v_r_out) IS NULL,
    'F: a late arrival must persist NO qualification';
  SELECT fast_visit_eligible INTO v_eligible FROM public.record_shopper_arrival(v_uid, v_mids[4], v_r_null);
  ASSERT NOT v_eligible,
    'F: a historical claim with claimed_at NULL must never qualify — unknown claim times are not fabricated';

  -- Staff verify (crafted status; the full real-RPC loop is Scenario B) and
  -- award: exactly the two in-window arrivals pay.
  UPDATE public.redemptions SET status = 'success' WHERE id IN (v_r_in, v_r_on, v_r_out, v_r_null);
  SELECT awarded INTO v_awarded FROM public.award_fast_visit_points(v_r_in);
  ASSERT v_awarded, 'F: the 14:59 arrival must award after verification';
  SELECT awarded INTO v_awarded FROM public.award_fast_visit_points(v_r_on);
  ASSERT v_awarded, 'F: the exact-boundary arrival must award after verification';
  SELECT awarded INTO v_awarded FROM public.award_fast_visit_points(v_r_out);
  ASSERT NOT v_awarded, 'F: the late arrival must not award';
  SELECT awarded INTO v_awarded FROM public.award_fast_visit_points(v_r_null);
  ASSERT NOT v_awarded, 'F: the historical-NULL claim must not award';

  SELECT count(*) INTO v_rows FROM public.reward_events WHERE user_id = v_uid;
  ASSERT v_rows = 2, format('F: exactly the two qualifying redemptions award, got %s rows', v_rows);

  DELETE FROM public.reward_events WHERE user_id = v_uid;
  DELETE FROM public.merchant_transactions WHERE merchant_id = ANY(v_mids);
  DELETE FROM public.guardian_events WHERE merchant_id = ANY(v_mids);
  DELETE FROM public.fraud_events WHERE merchant_id = ANY(v_mids);
  DELETE FROM public.agent_tasks WHERE merchant_id = ANY(v_mids);
  DELETE FROM public.audit_logs WHERE merchant_id = ANY(v_mids);
  DELETE FROM public.tier_flags WHERE merchant_id = ANY(v_mids);
  DELETE FROM public.redemptions WHERE deal_id = ANY(v_dids);
  DELETE FROM public.deals WHERE id = ANY(v_dids);
  DELETE FROM public.merchants WHERE id = ANY(v_mids);
  DELETE FROM public.users WHERE id = v_uid OR id = ANY(v_owner_uids);

  RAISE NOTICE 'Scenario F passed: arrival-time 15:00 inclusive boundary, late arrival still checked in, historical NULL never eligible';
END $$;

-- Scenario I: qualification is decided AT ARRIVAL and is immutable in both
-- directions. I1 is THE retroactivity regression: an arrival made while the
-- feature was OFF must never earn points, however the gate moves afterwards
-- and however many times the shopper re-scans. I2 is the mirror rule: an
-- arrival that qualified while the feature was ON keeps its earned
-- eligibility through a later gate-OFF, all the way through the REAL
-- verify_redemption to the award.
DO $$
DECLARE
  v_auth        UUID := gen_random_uuid();
  v_owner_auth1 UUID := gen_random_uuid();
  v_owner_auth2 UUID := gen_random_uuid();
  v_uid         UUID;
  v_owner_uid1  UUID;
  v_owner_uid2  UUID;
  v_mid1        UUID;
  v_mid2        UUID;
  v_d1          UUID;
  v_d2          UUID;
  v_r1          UUID;
  v_r2          UUID;
  v_otp1        TEXT;
  v_otp2        TEXT;
  v_eligible    BOOLEAN;
  v_first       BOOLEAN;
  v_awarded     BOOLEAN;
  v_points      INT;
  v_rows        INT;
BEGIN
  -- Two merchant/deal pairs: the tier trigger allows a standard merchant
  -- only one active deal, so I1 and I2 each get their own shop.
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth1) RETURNING id INTO v_owner_uid1;
  INSERT INTO public.users (role, auth_uid) VALUES ('merchant_admin', v_owner_auth2) RETURNING id INTO v_owner_uid2;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid1, '__test_fast_visit_i1', 'fast.visit.iw1', '+254700000287', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid1;
  INSERT INTO public.merchants (user_id, merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES (v_owner_uid2, '__test_fast_visit_i2', 'fast.visit.iw2', '+254700000288', 'BBS Mall', 'active', TRUE, 500)
    RETURNING id INTO v_mid2;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid1, '__test fv retroactivity', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_d1;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid2, '__test fv earned survives', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_d2;

  -- I1: gate OFF -> claim -> immediate (in-window) arrival.
  UPDATE public.app_config SET value = 'false' WHERE key = 'fast_visit_enabled';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_id, otp_code INTO v_r1, v_otp1 FROM public.claim_deal(v_uid, v_d1);
  SELECT fast_visit_eligible, first_arrival INTO v_eligible, v_first
    FROM public.record_shopper_arrival(v_uid, v_mid1, v_r1);
  ASSERT v_first, 'I1: the gate-OFF arrival is still a normal recorded check-in';
  ASSERT NOT v_eligible, 'I1: an arrival while the feature is OFF must not be eligible';
  ASSERT (SELECT arrived_at FROM public.redemptions WHERE id = v_r1) IS NOT NULL,
    'I1: the gate-OFF arrival must still stamp arrived_at (queue evidence)';
  ASSERT (SELECT fast_visit_qualified_at FROM public.redemptions WHERE id = v_r1) IS NULL,
    'I1: the gate-OFF arrival must persist NO qualification';

  -- The founder turns the feature ON. The old arrival must not upgrade —
  -- not by itself, and not through a re-scan inside the original window.
  UPDATE public.app_config SET value = 'true' WHERE key = 'fast_visit_enabled';
  SELECT fast_visit_eligible, first_arrival INTO v_eligible, v_first
    FROM public.record_shopper_arrival(v_uid, v_mid1, v_r1);
  ASSERT NOT v_first, 'I1: the re-scan after the gate flip is not a first arrival';
  ASSERT NOT v_eligible, 'I1: a re-scan after the gate turns ON must not upgrade the verdict';
  ASSERT (SELECT fast_visit_qualified_at FROM public.redemptions WHERE id = v_r1) IS NULL,
    'I1: the persisted verdict must stay NULL through the gate flip and the re-scan';

  -- Staff verify through the REAL money path; the award must still refuse.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner_auth1::text, 'role', 'authenticated')::text, true);
  PERFORM public.verify_redemption(v_mid1, v_otp1, 'test-device');
  SELECT awarded INTO v_awarded FROM public.award_fast_visit_points(v_r1);
  ASSERT NOT v_awarded,
    'I1: REGRESSION — turning fast_visit_enabled ON must not retroactively qualify a gate-OFF arrival';
  SELECT count(*) INTO v_rows FROM public.reward_events WHERE redemption_id = v_r1;
  ASSERT v_rows = 0, 'I1: no ledger row may exist for the gate-OFF arrival';

  -- I2: gate ON -> claim -> qualifying arrival -> gate OFF -> verify -> award.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_id, otp_code INTO v_r2, v_otp2 FROM public.claim_deal(v_uid, v_d2);
  SELECT fast_visit_eligible INTO v_eligible
    FROM public.record_shopper_arrival(v_uid, v_mid2, v_r2);
  ASSERT v_eligible, 'I2: an in-window arrival with the gate ON must qualify';

  UPDATE public.app_config SET value = 'false' WHERE key = 'fast_visit_enabled';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner_auth2::text, 'role', 'authenticated')::text, true);
  PERFORM public.verify_redemption(v_mid2, v_otp2, 'test-device');
  SELECT awarded, points INTO v_awarded, v_points FROM public.award_fast_visit_points(v_r2);
  ASSERT v_awarded,
    'I2: earned eligibility must survive the gate turning OFF before verification';
  ASSERT v_points = 50, format('I2: the earned award pays the configured 50 points, got %s', v_points);
  SELECT count(*) INTO v_rows FROM public.reward_events WHERE redemption_id = v_r2;
  ASSERT v_rows = 1, 'I2: exactly one ledger row for the earned award';

  UPDATE public.app_config SET value = 'true' WHERE key = 'fast_visit_enabled';
  DELETE FROM public.reward_events WHERE user_id = v_uid;
  DELETE FROM public.merchant_transactions WHERE merchant_id IN (v_mid1, v_mid2);
  DELETE FROM public.guardian_events WHERE merchant_id IN (v_mid1, v_mid2);
  DELETE FROM public.fraud_events WHERE merchant_id IN (v_mid1, v_mid2);
  DELETE FROM public.agent_tasks WHERE merchant_id IN (v_mid1, v_mid2);
  DELETE FROM public.audit_logs WHERE merchant_id IN (v_mid1, v_mid2);
  DELETE FROM public.redemptions WHERE deal_id IN (v_d1, v_d2);
  DELETE FROM public.deals WHERE id IN (v_d1, v_d2);
  DELETE FROM public.merchants WHERE id IN (v_mid1, v_mid2);
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid1, v_owner_uid2);

  RAISE NOTICE 'Scenario I passed: gate-OFF arrivals never retro-qualify (I1); earned eligibility survives gate-OFF (I2)';
END $$;

-- Restore the seeded (dark) state.
UPDATE public.app_config SET value = 'false' WHERE key = 'fast_visit_enabled';

DO $$ BEGIN RAISE NOTICE 'ALL fast_visit_points scenarios passed.'; END $$;
