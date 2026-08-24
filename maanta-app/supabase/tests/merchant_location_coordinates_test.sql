-- ============================================================
-- Test: coordinates are the canonical shop location, what3words is optional
-- (D162, migration 20260824120000).
--
-- The DB half only. WHICH coordinates get here — the pin the merchant confirmed
-- after standing at their own door, rather than the phone's first reading — is
-- a browser and route concern, covered by the vitest suites
-- (`shop-location.test.ts`, `merchant-onboarding-geolocation.test.ts`, and the
-- D162 block in `api/merchants/onboard/__tests__/route.test.ts`). What is
-- asserted here is what the database will and will not accept.
--
-- Calls the FOURTEEN-argument onboard_merchant (p_lat/p_lng trailing). Every
-- parameter is passed by name, so a reintroduced overload fails this suite
-- loudly instead of silently binding to the wrong function — scenario 7 checks
-- for one directly.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/merchant_location_coordinates_test.sql
-- ============================================================

-- Scenario 1: coordinates alone onboard a shop, with no what3words address.
-- This is the ruling in one assertion: a merchant standing at their entrance
-- can finish signing up while the what3words account is over quota.
DO $$
DECLARE
  v_user   UUID;
  v_mid    UUID;
  v_lat    DOUBLE PRECISION;
  v_lng    DOUBLE PRECISION;
  v_w3w    TEXT;
  v_status TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  v_mid := public.onboard_merchant(
    p_user_id            => v_user,
    p_merchant_name      => '__test_d162_coords_only',
    p_phone              => '+254700000901',
    p_email              => NULL,
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => NULL,
    p_floor              => 'Floor 2',
    p_unit_number        => 'Unit 12',
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => NULL,
    p_admin_user_id      => NULL,
    p_lat                => -1.2746,
    p_lng                => 36.8501
  );

  SELECT lat, lng, what3words_address, status
    INTO v_lat, v_lng, v_w3w, v_status
    FROM public.merchants WHERE id = v_mid;

  ASSERT v_lat = -1.2746 AND v_lng = 36.8501,
    'D162: the confirmed coordinates must be stored verbatim, got '
      || COALESCE(v_lat::text, '<null>') || ',' || COALESCE(v_lng::text, '<null>');
  ASSERT v_w3w IS NULL,
    'D162: a coordinate-only shop must store no what3words address, got ' || COALESCE(v_w3w, '<null>');
  ASSERT v_status = 'pending',
    'D162: relaxing the location rule must NOT weaken approval — expected pending, got ' || v_status;

  RAISE NOTICE 'Scenario 1 passed: coordinate-only onboarding, still pending';
END $$;

-- Scenario 2: a what3words-only shop still onboards. The admin-assisted route
-- supplies no coordinates, and old rows carry words and no GPS.
DO $$
DECLARE
  v_user UUID;
  v_mid  UUID;
  v_lat  DOUBLE PRECISION;
  v_w3w  TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  v_mid := public.onboard_merchant(
    p_user_id            => v_user,
    p_merchant_name      => '__test_d162_w3w_only',
    p_phone              => '+254700000902',
    p_email              => NULL,
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => 'test.d162.words',
    p_floor              => NULL,
    p_unit_number        => NULL,
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => NULL,
    p_admin_user_id      => NULL
  );

  SELECT lat, what3words_address INTO v_lat, v_w3w
    FROM public.merchants WHERE id = v_mid;

  ASSERT v_lat IS NULL, 'D162: no coordinates were supplied, so none must be invented';
  ASSERT v_w3w = 'test.d162.words', 'D162: the supplied address must persist';

  RAISE NOTICE 'Scenario 2 passed: what3words-only onboarding still works';
END $$;

-- Scenario 3: neither → location_required, named, and no half-built row left.
DO $$
DECLARE
  v_user   UUID;
  v_raised BOOLEAN := FALSE;
  v_count  INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  BEGIN
    PERFORM public.onboard_merchant(
      p_user_id            => v_user,
      p_merchant_name      => '__test_d162_no_location',
      p_phone              => '+254700000903',
      p_email              => NULL,
      p_whatsapp           => NULL,
      p_node               => 'BBS Mall',
      p_w3w_address        => '   ',
      p_floor              => NULL,
      p_unit_number        => NULL,
      p_entrance_notes     => NULL,
      p_onboarding_agent_id => NULL,
      p_admin_user_id      => NULL,
      p_lat                => NULL,
      p_lng                => NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%location_required%',
      'D162: expected location_required, got ' || SQLERRM;
  END;

  ASSERT v_raised, 'D162: a shop with no location at all must be refused';

  SELECT COUNT(*) INTO v_count
    FROM public.merchants WHERE merchant_name = '__test_d162_no_location';
  ASSERT v_count = 0, 'D162: the refused onboarding must leave no merchant row';

  RAISE NOTICE 'Scenario 3 passed: a locationless shop is refused by name';
END $$;

-- Scenario 4: bad coordinates are refused as invalid_coordinates, not as an
-- opaque CHECK violation the route would have to render as a 500.
DO $$
DECLARE
  v_user UUID;
  v_case RECORD;
  v_raised BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR v_case IN
    SELECT * FROM (VALUES
      (91.0::double precision,   36.8501::double precision, 'latitude above 90'),
      (-91.0,                    36.8501,                   'latitude below -90'),
      (-1.2746,                  181.0,                     'longitude above 180'),
      (-1.2746,                  -181.0,                    'longitude below -180'),
      ('NaN'::double precision,  36.8501,                   'NaN latitude')
    ) AS t(lat, lng, label)
  LOOP
    INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;
    v_raised := FALSE;
    BEGIN
      PERFORM public.onboard_merchant(
        p_user_id            => v_user,
        p_merchant_name      => '__test_d162_bad_coords',
        p_phone              => '+254700000904',
        p_email              => NULL,
        p_whatsapp           => NULL,
        p_node               => 'BBS Mall',
        p_w3w_address        => NULL,
        p_floor              => NULL,
        p_unit_number        => NULL,
        p_entrance_notes     => NULL,
        p_onboarding_agent_id => NULL,
        p_admin_user_id      => NULL,
        p_lat                => v_case.lat,
        p_lng                => v_case.lng
      );
    EXCEPTION WHEN OTHERS THEN
      v_raised := TRUE;
      ASSERT SQLERRM LIKE '%invalid_coordinates%',
        'D162: ' || v_case.label || ' expected invalid_coordinates, got ' || SQLERRM;
    END;
    ASSERT v_raised, 'D162: ' || v_case.label || ' must be refused';
  END LOOP;

  RAISE NOTICE 'Scenario 4 passed: out-of-range and NaN coordinates refused by name';
END $$;

-- Scenario 5: half a pair is refused too — a lone latitude is not a location.
DO $$
DECLARE
  v_user   UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  BEGIN
    PERFORM public.onboard_merchant(
      p_user_id            => v_user,
      p_merchant_name      => '__test_d162_half_pair',
      p_phone              => '+254700000905',
      p_email              => NULL,
      p_whatsapp           => NULL,
      p_node               => 'BBS Mall',
      p_w3w_address        => NULL,
      p_floor              => NULL,
      p_unit_number        => NULL,
      p_entrance_notes     => NULL,
      p_onboarding_agent_id => NULL,
      p_admin_user_id      => NULL,
      p_lat                => -1.2746,
      p_lng                => NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%invalid_coordinates%',
      'D162: expected invalid_coordinates for half a pair, got ' || SQLERRM;
  END;

  ASSERT v_raised, 'D162: half a coordinate pair must be refused';
  RAISE NOTICE 'Scenario 5 passed: half a coordinate pair refused';
END $$;

-- Scenario 6: the constraints stand on their own, independent of the RPC.
-- A direct write is what a compromised service key or a future code path would
-- do; the table must refuse a locationless or off-planet shop either way.
DO $$
DECLARE
  v_uid    UUID;
  v_raised BOOLEAN;
BEGIN
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.merchants (merchant_name, phone, node, what3words_address, lat, lng)
      VALUES ('__test_d162_direct_nowhere', '+254700000906', 'BBS Mall', NULL, NULL, NULL);
  EXCEPTION WHEN check_violation THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'D162: merchants_location_present must refuse a shop with no location';

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.merchants (merchant_name, phone, node, what3words_address, lat, lng)
      VALUES ('__test_d162_direct_offworld', '+254700000907', 'BBS Mall', NULL, 12.0, 999.0);
  EXCEPTION WHEN check_violation THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised, 'D162: merchants_lat_lng_range must refuse an out-of-range longitude';

  -- And the legitimate coordinate-only write is accepted.
  INSERT INTO public.merchants (merchant_name, phone, node, what3words_address, lat, lng)
    VALUES ('__test_d162_direct_ok', '+254700000908', 'BBS Mall', NULL, -1.2746, 36.8501);

  ASSERT (SELECT what3words_address IS NULL FROM public.merchants
           WHERE merchant_name = '__test_d162_direct_ok'),
    'D162: what3words_address must be nullable';

  RAISE NOTICE 'Scenario 6 passed: location constraints hold on direct writes';
END $$;

-- Scenario 7: exactly ONE onboard_merchant overload survives.
-- Two overloads with defaults make every existing call ambiguous
-- ("function public.onboard_merchant(...) is not unique") — the trap that broke
-- 20260816020000 in CI and that a first draft of 20260823130000 walked into.
DO $$
DECLARE
  v_count INT;
  v_sig   TEXT;
BEGIN
  SELECT COUNT(*), MIN(p.oid::regprocedure::text)
    INTO v_count, v_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'onboard_merchant';

  ASSERT v_count = 1,
    'D162: exactly one onboard_merchant overload must exist, found ' || v_count;
  ASSERT v_sig LIKE '%double precision,double precision)',
    'D162: the surviving overload must be the 14-argument one, got ' || v_sig;

  ASSERT NOT has_function_privilege('anon', v_sig, 'EXECUTE'),
    'D162: anon must not hold EXECUTE on onboard_merchant (DROP discards grants)';
  ASSERT has_function_privilege('service_role', v_sig, 'EXECUTE'),
    'D162: service_role must retain EXECUTE on onboard_merchant';

  RAISE NOTICE 'Scenario 7 passed: one overload, grants intact';
END $$;

-- Scenario 8: one merchant cannot move another merchant's shop.
--
-- Two independent barriers, both asserted: `authenticated` holds no UPDATE
-- grant on merchants at all (20260723120000), and the merchants_own RLS policy
-- scopes rows to `user_id = current_user_id()`. The location is written by
-- onboard_merchant under service_role and edited only by the admin route, so a
-- merchant has no path to another merchant's coordinates.
DO $$
DECLARE
  v_auth_a UUID := gen_random_uuid();
  v_auth_b UUID := gen_random_uuid();
  v_uid_a  UUID;
  v_uid_b  UUID;
  v_mid_b  UUID;
  v_lat    DOUBLE PRECISION;
BEGIN
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth_a) RETURNING id INTO v_uid_a;
  INSERT INTO public.users (role, auth_uid)
    VALUES ('merchant_admin', v_auth_b) RETURNING id INTO v_uid_b;

  INSERT INTO public.merchants (merchant_name, phone, node, what3words_address, lat, lng, user_id, status)
    VALUES ('__test_d162_victim', '+254700000909', 'BBS Mall', NULL, -1.2746, 36.8501, v_uid_b, 'active')
    RETURNING id INTO v_mid_b;

  ASSERT NOT has_table_privilege('authenticated', 'public.merchants', 'UPDATE'),
    'D162: authenticated must hold no UPDATE grant on merchants';

  -- Merchant A, signed in, tries to drag merchant B's shop onto their own.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_auth_a::text)::text, true);
  SET ROLE authenticated;
  BEGIN
    UPDATE public.merchants SET lat = 0, lng = 0 WHERE id = v_mid_b;
    RESET ROLE;
    RAISE EXCEPTION 'D162: cross-merchant location UPDATE should have been blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;

  SELECT lat INTO v_lat FROM public.merchants WHERE id = v_mid_b;
  ASSERT v_lat = -1.2746,
    'D162: another merchant''s coordinates must be unchanged, got ' || COALESCE(v_lat::text, '<null>');

  -- The RLS policy is the second barrier: even with a grant, the row is not
  -- visible to merchant A for writing.
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'merchants'
       AND policyname = 'merchants_own'
       AND qual LIKE '%current_user_id()%'
  ), 'D162: merchants_own must still scope rows to the owning user';

  RAISE NOTICE 'Scenario 8 passed: a merchant cannot move another merchant''s shop';
END $$;

-- Cleanup: every row this suite created.
DELETE FROM public.merchants WHERE merchant_name LIKE '\_\_test\_d162\_%';
DELETE FROM public.users
 WHERE id NOT IN (SELECT user_id FROM public.merchants WHERE user_id IS NOT NULL)
   AND role IN ('customer', 'merchant_admin')
   AND created_at > NOW() - INTERVAL '1 minute'
   AND NOT EXISTS (SELECT 1 FROM public.redemptions r WHERE r.user_id = users.id);

DO $$ BEGIN RAISE NOTICE 'merchant_location_coordinates_test: all scenarios passed'; END $$;
