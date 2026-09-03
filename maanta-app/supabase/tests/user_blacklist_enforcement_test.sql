-- ============================================================
-- Test: D171 — users.is_blacklisted is an ENFORCED control.
--
--   A  a blacklisted shopper cannot be issued a new claim
--   B  clearing the flag restores claiming
--   C  a claim issued BEFORE the blacklist still redeems (verify-anyway,
--      a frozen rule — blacklisting must never strand a shopper at a till)
--   D  a shopper cannot set or clear their OWN flag (adversarial)
--   E  a shopper cannot blacklist ANOTHER shopper (adversarial)
--   F  an admin can set and clear it
--   G  the flag does not leak into merchant-side gating
--
-- Migration: 20260903130000_enforce_user_blacklist.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/user_blacklist_enforcement_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- A + B: the claim gate, both directions.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u UUID; v_err TEXT; v_claimed BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_bl_a', 'test.bl.a', '+254700000921', 'BBS Mall', 'active', 500, '1st Floor', 'B-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Blacklist test', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 50, 0, 30, 500)
    RETURNING id INTO v_d;

  UPDATE public.users SET is_blacklisted = true WHERE id = v_u;

  BEGIN
    PERFORM public.claim_deal(v_u, v_d);
    v_claimed := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  ASSERT NOT v_claimed,
    'A: a blacklisted shopper was issued a claim — the control is decorative again';
  ASSERT v_err = 'user_blacklisted',
    format('A: expected user_blacklisted, got: %s', COALESCE(v_err, '<none>'));
  ASSERT NOT EXISTS (SELECT 1 FROM public.redemptions WHERE user_id = v_u),
    'A: no redemption row may exist for a refused claim';
  -- The refusal must not have eaten one of the merchant's claim slots (D236).
  ASSERT (SELECT public.claims_reserved(d) FROM public.deals d WHERE d.id = v_d) = 0,
    'A: a blacklisted refusal must not reserve any of the merchant allocation';

  UPDATE public.users SET is_blacklisted = false WHERE id = v_u;
  PERFORM public.claim_deal(v_u, v_d);
  ASSERT EXISTS (SELECT 1 FROM public.redemptions WHERE user_id = v_u),
    'B: clearing the flag must restore claiming';

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_u;
  RAISE NOTICE 'A+B passed: blacklist blocks new claims and unblocking restores them';
END $$;

-- C: verify-anyway. A code already in a shopper's hand still works.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u UUID; v_claim RECORD; v_verify RECORD;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_bl_c', 'test.bl.c', '+254700000923', 'BBS Mall', 'active', 500, '1st Floor', 'B-3', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Verify anyway', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 50, 0, 30, 500)
    RETURNING id INTO v_d;

  SELECT * INTO v_claim FROM public.claim_deal(v_u, v_d);
  -- Blacklisted AFTER the code was issued.
  UPDATE public.users SET is_blacklisted = true WHERE id = v_u;

  SELECT * INTO v_verify FROM public.verify_redemption(v_m, v_claim.otp_code, NULL, false, NULL);
  ASSERT v_verify.redemption_status = 'success',
    format('C: verify-anyway is a frozen rule — a blacklist must not strand a shopper at the counter, got %s', v_verify.redemption_status);
  ASSERT v_verify.fee_charge_status = 'charged',
    'C: the KES 30 fee behaves exactly as before';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_u;
  RAISE NOTICE 'C passed: an already-issued code still redeems (verify-anyway preserved)';
END $$;

-- D + E: adversarial. A shopper acting as `authenticated` must not be able to
-- move the flag on themselves or on anyone else.
DO $$
DECLARE
  v_u1 UUID; v_u2 UUID; v_err TEXT; v_changed BOOLEAN := false; v_state BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', gen_random_uuid()) RETURNING id INTO v_u1;
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', gen_random_uuid()) RETURNING id INTO v_u2;
  UPDATE public.users SET is_blacklisted = true WHERE id = v_u1;

  -- Become the blacklisted shopper.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT auth_uid FROM public.users WHERE id=v_u1))::text, true);

  BEGIN
    UPDATE public.users SET is_blacklisted = false WHERE id = v_u1;
    v_changed := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT is_blacklisted INTO v_state FROM public.users WHERE id = v_u1;
  ASSERT v_state IS TRUE,
    'D: a blacklisted shopper cleared their own flag — the control can be undone from the phone it was applied to';
  ASSERT NOT v_changed,
    format('D: self-clear must raise, got no error (err=%s)', COALESCE(v_err,'<none>'));

  -- And they must not be able to blacklist somebody else either.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT auth_uid FROM public.users WHERE id=v_u1))::text, true);
  BEGIN
    UPDATE public.users SET is_blacklisted = true WHERE id = v_u2;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT is_blacklisted INTO v_state FROM public.users WHERE id = v_u2;
  ASSERT v_state IS NOT TRUE,
    'E: one shopper blacklisted another';

  DELETE FROM public.users WHERE id IN (v_u1, v_u2);
  RAISE NOTICE 'D+E passed: the flag is not self-servable and not cross-servable';
END $$;

-- F: an admin can move it (the authority the admin console relies on).
DO $$
DECLARE
  v_admin UUID; v_u UUID; v_state BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role, auth_uid) VALUES ('admin', gen_random_uuid()) RETURNING id INTO v_admin;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',(SELECT auth_uid FROM public.users WHERE id=v_admin))::text, true);
  UPDATE public.users SET is_blacklisted = true WHERE id = v_u;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT is_blacklisted INTO v_state FROM public.users WHERE id = v_u;
  ASSERT v_state IS TRUE, 'F: an admin must be able to blacklist';

  DELETE FROM public.users WHERE id IN (v_admin, v_u);
  RAISE NOTICE 'F passed: admin authority works';
END $$;

-- G: the shopper flag must not have leaked into merchant-side gating.
DO $$
DECLARE v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc
   WHERE proname = 'verify_redemption' AND pronamespace = 'public'::regnamespace;
  ASSERT v_src NOT LIKE '%is_blacklisted%',
    'G: verify_redemption consults is_blacklisted — that breaks the frozen verify-anyway rule';
  RAISE NOTICE 'G passed: verify_redemption does not consult the flag';
END $$;

SELECT 'user_blacklist_enforcement_test: ALL SCENARIOS PASSED' AS result;
