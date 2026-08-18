-- ============================================================
-- Test: deals.expires_at is NOT NULL, and the claim path yields a real window
-- (20260818130000_deals_expires_at_not_null.sql, D29)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deals_expires_at_not_null_test.sql
-- ============================================================

-- Scenario A: schema posture — the column is NOT NULL. This is the durable guard;
-- it fails if the constraint is ever dropped, which is what re-opened the 500.
DO $$
DECLARE v_notnull BOOLEAN;
BEGIN
  SELECT attnotnull INTO v_notnull
    FROM pg_attribute
    WHERE attrelid = 'public.deals'::regclass AND attname = 'expires_at';
  ASSERT v_notnull, 'A: public.deals.expires_at must be NOT NULL';
  RAISE NOTICE 'Scenario A passed: deals.expires_at is NOT NULL';
END $$;

-- Scenario B: behaviour — a deal inserted with no explicit expiry still gets a
-- non-null one from set_deal_expiry, and a claim derives a non-null redemption
-- window from it. Covers both deal types.
DO $$
DECLARE
  v_auth UUID := gen_random_uuid();
  v_uid UUID;
  v_mid UUID;
  v_std UUID;
  v_flash UUID;
  v_std_exp TIMESTAMPTZ;
  v_flash_exp TIMESTAMPTZ;
  v_rexp TIMESTAMPTZ;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('customer', v_auth) RETURNING id INTO v_uid;
  -- Elite so a second (flash) active deal is allowed.
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier)
    VALUES ('__test_expiry_notnull', 'test.expiry.notnull', '+254700000601', 'BBS Mall', 'active', TRUE, 100, 'elite')
    RETURNING id INTO v_mid;

  -- No expires_at supplied → trigger must fill it.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, price_kes)
    VALUES (v_mid, '__test standard', 'x', TRUE, 'standard', 100) RETURNING id, expires_at INTO v_std, v_std_exp;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, flash_duration_hours, price_kes)
    VALUES (v_mid, '__test flash', 'x', TRUE, 'flash', 5, 100) RETURNING id, expires_at INTO v_flash, v_flash_exp;

  ASSERT v_std_exp IS NOT NULL, 'B: standard deal must get a non-null expiry from the trigger';
  ASSERT v_flash_exp IS NOT NULL, 'B: flash deal must get a non-null expiry from the trigger';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  SELECT redemption_expires_at INTO v_rexp FROM public.claim_deal(v_uid, v_std);
  ASSERT v_rexp IS NOT NULL, 'B: a claim must derive a non-null redemption window';
  ASSERT v_rexp = v_std_exp + INTERVAL '15 minutes', 'B: redemption window must be deal expiry + 15m grace';

  DELETE FROM public.redemptions WHERE deal_id IN (v_std, v_flash);
  DELETE FROM public.deals WHERE id IN (v_std, v_flash);
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario B passed: deals get a non-null expiry and claims derive a real window';
END $$;

-- Scenario C: the constraint actually bites — forcing expires_at NULL on an
-- existing deal is refused (the trigger is INSERT-only, so an UPDATE would
-- otherwise slip a NULL through).
DO $$
DECLARE
  v_mid UUID;
  v_did UUID;
  v_blocked BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_expiry_bite', 'test.expiry.bite', '+254700000602', 'BBS Mall', 'active', TRUE, 100)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, price_kes)
    VALUES (v_mid, '__test bite', 'x', TRUE, 'standard', 100) RETURNING id INTO v_did;

  BEGIN
    UPDATE public.deals SET expires_at = NULL WHERE id = v_did;
  EXCEPTION WHEN not_null_violation THEN v_blocked := TRUE;
  END;
  ASSERT v_blocked, 'C: setting deals.expires_at to NULL must be refused';

  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario C passed: NULL expiry is refused by the constraint';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL deals_expires_at_not_null scenarios passed.'; END $$;
