-- ============================================================
-- Test: owner phone is optional for an email-carrying merchant (D158,
-- migration 20260823130000). The merchant twin of D154's staff-seat change.
--
-- What is asserted here is the DB half only: the column accepts NULL, the
-- contact-present CHECK still forbids a shop with no channel at all, and
-- onboard_merchant raises a named `contact_required` rather than letting the
-- CHECK escape as a bare error. The rule that decides WHEN a phone may be
-- omitted — the submitting account must have a verified `users.email` — is a
-- route-level gate and is covered by the vitest suite, because the RPC has no
-- access to the Clerk session that proves it.
--
-- Calls the TWELVE-argument onboard_merchant (p_admin_user_id trailing, added
-- by 20260816020000). Passing every parameter by name also means this suite
-- fails loudly if a second overload is ever reintroduced.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/merchant_phone_optional_test.sql
-- ============================================================

-- Scenario 1: email present, phone omitted → onboards, phone stored NULL.
DO $$
DECLARE
  v_user  UUID;
  v_mid   UUID;
  v_phone TEXT;
  v_email TEXT;
  v_mode  TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  v_mid := public.onboard_merchant(
    p_user_id            => v_user,
    p_merchant_name      => '__test_d158_email_only',
    p_phone              => NULL,
    p_email              => 'd158-email-only@example.com',
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => 'test.d158.email',
    p_floor              => NULL,
    p_unit_number        => NULL,
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => NULL,
    p_admin_user_id      => NULL
  );

  SELECT phone, email, onboarding_mode INTO v_phone, v_email, v_mode
    FROM public.merchants WHERE id = v_mid;

  ASSERT v_phone IS NULL,
    'D158: an email-only onboarding must store phone NULL, got ' || COALESCE(v_phone, '<null>');
  ASSERT v_email = 'd158-email-only@example.com',
    'D158: the contact email must persist';
  ASSERT v_mode = 'self_serve',
    'D158: omitting the phone must not change attribution, got ' || v_mode;
END $$;

-- Scenario 2: a blank-string phone is normalised to NULL, not stored as ''.
DO $$
DECLARE
  v_user  UUID;
  v_mid   UUID;
  v_phone TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  v_mid := public.onboard_merchant(
    p_user_id            => v_user,
    p_merchant_name      => '__test_d158_blank_phone',
    p_phone              => '   ',
    p_email              => 'd158-blank@example.com',
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => 'test.d158.blank',
    p_floor              => NULL,
    p_unit_number        => NULL,
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => NULL,
    p_admin_user_id      => NULL
  );

  SELECT phone INTO v_phone FROM public.merchants WHERE id = v_mid;

  ASSERT v_phone IS NULL,
    'D158: a whitespace-only phone must normalise to NULL, got ' || quote_literal(v_phone);
END $$;

-- Scenario 3: neither channel → contact_required, and no merchant row is left.
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
      p_merchant_name      => '__test_d158_no_contact',
      p_phone              => NULL,
      p_email              => NULL,
      p_whatsapp           => NULL,
      p_node               => 'BBS Mall',
      p_w3w_address        => 'test.d158.none',
      p_floor              => NULL,
      p_unit_number        => NULL,
      p_entrance_notes     => NULL,
      p_onboarding_agent_id => NULL,
      p_admin_user_id      => NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
    ASSERT SQLERRM LIKE '%contact_required%',
      'D158: expected contact_required, got ' || SQLERRM;
  END;

  ASSERT v_raised,
    'D158: onboarding with neither a phone nor an email must be rejected';

  SELECT count(*) INTO v_count
    FROM public.merchants WHERE merchant_name = '__test_d158_no_contact';
  ASSERT v_count = 0,
    'D158: the rejected onboarding must leave no merchant row';
END $$;

-- Scenario 4: the CHECK is real — a direct UPDATE cannot strip the last channel.
DO $$
DECLARE
  v_mid    UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT id INTO v_mid
    FROM public.merchants WHERE merchant_name = '__test_d158_email_only';

  BEGIN
    UPDATE public.merchants SET email = NULL WHERE id = v_mid;
  EXCEPTION WHEN check_violation THEN
    v_raised := TRUE;
  END;

  ASSERT v_raised,
    'D158: merchants_contact_present must reject a row losing its last channel';
END $$;

-- Scenario 5: the phone-only merchant is untouched by any of this.
DO $$
DECLARE
  v_user  UUID;
  v_mid   UUID;
  v_phone TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_user;

  v_mid := public.onboard_merchant(
    p_user_id            => v_user,
    p_merchant_name      => '__test_d158_phone_only',
    p_phone              => '+254700000501',
    p_email              => NULL,
    p_whatsapp           => NULL,
    p_node               => 'BBS Mall',
    p_w3w_address        => 'test.d158.phone',
    p_floor              => NULL,
    p_unit_number        => NULL,
    p_entrance_notes     => NULL,
    p_onboarding_agent_id => NULL,
    p_admin_user_id      => NULL
  );

  SELECT phone INTO v_phone FROM public.merchants WHERE id = v_mid;
  ASSERT v_phone = '+254700000501',
    'D158: a phone-only onboarding must be unchanged, got ' || COALESCE(v_phone, '<null>');
END $$;

-- Scenario 6: the shop's contact channels are INTERNAL. D158 lets the account's
-- verified login address become the shop contact when no phone is given, which
-- is only acceptable while that column cannot reach a shopper. Assert it:
-- neither contact column may appear in the anon/authenticated browse
-- projection. If a future change wants to show a contact on a storefront, it
-- needs explicit merchant consent and a separate column — not this one.
DO $$
DECLARE
  v_cols TEXT[];
BEGIN
  SELECT array_agg(column_name::text) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'merchants_public_browse';

  ASSERT v_cols IS NOT NULL,
    'D158: merchants_public_browse must exist for this assertion to mean anything';
  ASSERT NOT ('email' = ANY(v_cols)),
    'D158: merchants.email must NOT be exposed by merchants_public_browse — '
    'it can hold the owner''s private login address';
  ASSERT NOT ('phone' = ANY(v_cols)),
    'D158: merchants.phone must NOT be exposed by merchants_public_browse';
END $$;

-- Cleanup
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM public.merchants WHERE merchant_name LIKE '__test_d158_%';
END $$;
