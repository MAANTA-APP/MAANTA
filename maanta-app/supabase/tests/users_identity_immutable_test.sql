-- ============================================================
-- Test: identity columns on public.users are immutable to the row holder
-- (20260817130000_prevent_users_identity_self_change.sql)
--
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/users_identity_immutable_test.sql
--
-- The vulnerability this covers: RLS lets an authenticated user UPDATE their own
-- users row, and before this trigger only `role` was protected. A self-written
-- `phone` is the primitive behind the merchant_staff-seat hijack in
-- src/lib/merchant.ts (link-by-phone). These scenarios assert the identity
-- columns are frozen to the holder while the legitimate self-write survives.
-- ============================================================

-- ------------------------------------------------------------------
-- PRECONDITION, made explicit rather than inherited from the environment.
--
-- Every scenario below writes public.users as `authenticated`. Whether that role
-- can UPDATE the table at all is decided by GRANTs, and NO migration in this repo
-- grants or revokes them: on production `authenticated` holds full DML (from
-- ALTER DEFAULT PRIVILEGES configured on that database, bounded to the caller's
-- own row by the users_own_row RLS policy), while a fresh `supabase start` /
-- `db reset` grants nothing. That divergence is drift D128.
--
-- It matters here for a reason worse than a failing test. The identity-change
-- attempts below were caught by `EXCEPTION WHEN OTHERS`, and "permission denied"
-- is an OTHERS too — so on any database without the grant this suite reported
-- the trigger working when the trigger had never run. It passed for the wrong
-- reason. The handlers are now narrowed to the trigger's own error, and this
-- block guarantees the role can reach the table so that error is reachable.
--
-- Granted only if absent, and revoked at the end of the file if granted here, so
-- the suite leaves the database as it found it.
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.users', 'UPDATE') THEN
    EXECUTE 'GRANT UPDATE ON public.users TO authenticated';
    CREATE TEMP TABLE _users_update_granted_by_test ();
  END IF;
END $$;

-- Scenario A: an authenticated user cannot change their OWN phone, clerk_user_id
-- or auth_uid — but CAN still update push_subscription (the one column the
-- anon/authenticated client legitimately self-writes).
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid  UUID;
  v_phone_blocked BOOLEAN := FALSE;
  v_clerk_blocked BOOLEAN := FALSE;
  v_authuid_blocked BOOLEAN := FALSE;
  v_push_rows INT;
  v_phone_after TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid, phone)
    VALUES ('customer', v_auth, NULL) RETURNING id INTO v_uid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.users SET phone = '+254799000123' WHERE id = v_uid;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'A: refused by table GRANTs, not by the trigger — the precondition block failed, so this scenario proves nothing';
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%cannot change identity columns%' THEN
        RAISE EXCEPTION 'A: blocked by an unexpected error, not the identity guard: %', SQLERRM;
      END IF;
      v_phone_blocked := TRUE;
  END;

  BEGIN
    UPDATE public.users SET clerk_user_id = 'user_hijack' WHERE id = v_uid;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'A: refused by table GRANTs, not by the trigger — the precondition block failed, so this scenario proves nothing';
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%cannot change identity columns%' THEN
        RAISE EXCEPTION 'A: blocked by an unexpected error, not the identity guard: %', SQLERRM;
      END IF;
      v_clerk_blocked := TRUE;
  END;

  BEGIN
    UPDATE public.users SET auth_uid = gen_random_uuid() WHERE id = v_uid;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'A: refused by table GRANTs, not by the trigger — the precondition block failed, so this scenario proves nothing';
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%cannot change identity columns%' THEN
        RAISE EXCEPTION 'A: blocked by an unexpected error, not the identity guard: %', SQLERRM;
      END IF;
      v_authuid_blocked := TRUE;
  END;

  -- Non-identity self-write must still work (proves the trigger is column-scoped).
  UPDATE public.users SET push_subscription = '{"endpoint":"x"}'::jsonb WHERE id = v_uid;
  GET DIAGNOSTICS v_push_rows = ROW_COUNT;

  RESET ROLE;
  SELECT phone INTO v_phone_after FROM public.users WHERE id = v_uid;

  ASSERT v_phone_blocked,   'A: authenticated must NOT change own phone';
  ASSERT v_clerk_blocked,   'A: authenticated must NOT change own clerk_user_id';
  ASSERT v_authuid_blocked, 'A: authenticated must NOT change own auth_uid';
  ASSERT v_phone_after IS NULL, format('A: phone must be unchanged, got %s', v_phone_after);
  ASSERT v_push_rows = 1, 'A: authenticated must still update own push_subscription';

  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: identity columns frozen to holder; push_subscription still writable';
END $$;

-- Scenario B: the staff-seat hijack itself is blocked end to end. A shopper who
-- knows a pre-invited (user_id NULL) merchant_staff phone cannot claim it by
-- writing their own users.phone.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid  UUID;
  v_owner_auth UUID := gen_random_uuid();
  v_owner_uid UUID;
  v_mid  UUID;
  v_staff_phone TEXT := '+254799000450';
  v_blocked BOOLEAN := FALSE;
  v_linked INT;
BEGIN
  INSERT INTO public.users (role, auth_uid, phone) VALUES ('customer', v_auth, NULL) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid, phone) VALUES ('merchant_admin', v_owner_auth, '+254799000451') RETURNING id INTO v_owner_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, user_id, account_balance)
    VALUES ('__test_hijack_shop', 'test.hijack.shop', '+254799000452', 'BBS Mall', 'active', TRUE, v_owner_uid, 500)
    RETURNING id INTO v_mid;
  -- Pre-invited staff seat: phone set, not yet linked to a user, can_verify on.
  -- staff_name is NOT NULL with no default (20260709175532). Omitting it is what
  -- this suite did before it had ever been run anywhere; the insert aborted the
  -- scenario before the hijack attempt it exists to make.
  INSERT INTO public.merchant_staff (merchant_id, staff_name, phone, user_id, can_verify, can_deals, can_topup, can_purchase)
    VALUES (v_mid, '__test invited staff', v_staff_phone, NULL, TRUE, TRUE, TRUE, TRUE);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.users SET phone = v_staff_phone WHERE id = v_uid;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'B: refused by table GRANTs, not by the trigger — the precondition block failed, so this scenario proves nothing';
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%cannot change identity columns%' THEN
        RAISE EXCEPTION 'B: blocked by an unexpected error, not the identity guard: %', SQLERRM;
      END IF;
      v_blocked := TRUE;
  END;
  RESET ROLE;

  ASSERT v_blocked, 'B: attacker must NOT set own phone to a pre-invited staff phone';
  SELECT count(*) INTO v_linked FROM public.users WHERE id = v_uid AND phone = v_staff_phone;
  ASSERT v_linked = 0, 'B: attacker phone must not equal the staff phone after the attempt';

  DELETE FROM public.merchant_staff WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid, v_owner_uid);
  RAISE NOTICE 'Scenario B passed: staff-seat hijack via self-written phone is blocked';
END $$;

-- Scenario C: privileged writers are unaffected. service_role changes phone via
-- the JWT-claim path (no SET ROLE — the app's service client keeps owner rights),
-- and an admin changes another user's phone via the admin RLS arm.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_admin_auth UUID := gen_random_uuid();
  v_admin_uid UUID;
  v_after_service TEXT;
  v_after_admin TEXT;
BEGIN
  INSERT INTO public.users (role, auth_uid, phone) VALUES ('customer', v_auth, NULL) RETURNING id INTO v_uid;
  INSERT INTO public.users (role, auth_uid, phone) VALUES ('admin', v_admin_auth, '+254799000460') RETURNING id INTO v_admin_uid;

  -- service_role branch: claim role only, no SET ROLE (matches src/lib/auth.ts).
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  UPDATE public.users SET phone = '+254799000461' WHERE id = v_uid;
  SELECT phone INTO v_after_service FROM public.users WHERE id = v_uid;
  ASSERT v_after_service = '+254799000461', 'C: service_role must be able to set phone (provisioning path)';

  -- admin branch: an admin JWT updating another user via the users_admin policy.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_auth::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.users SET phone = '+254799000462' WHERE id = v_uid;
  RESET ROLE;
  SELECT phone INTO v_after_admin FROM public.users WHERE id = v_uid;
  ASSERT v_after_admin = '+254799000462', 'C: admin must be able to set another user phone';

  DELETE FROM public.users WHERE id IN (v_uid, v_admin_uid);
  RAISE NOTICE 'Scenario C passed: service_role and admin phone writes still work';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL users_identity_immutable scenarios passed.'; END $$;

-- ------------------------------------------------------------------
-- Restore the privilege state this suite found. No-op unless the
-- precondition block above had to add the grant.
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = '_users_update_granted_by_test'
                AND n.nspname LIKE 'pg_temp%') THEN
    EXECUTE 'REVOKE UPDATE ON public.users FROM authenticated';
    DROP TABLE _users_update_granted_by_test;
  END IF;
END $$;
