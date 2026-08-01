-- ============================================================
-- Test: paused-deal semantics (founder rule 2026-07-30)
--
-- 1. New claims on a paused deal → deal_paused; no redemption.
-- 2. Claim while active → pause → ticket still verifiable.
-- 3. Pause → resume → deal claimable again + visible in browse view.
-- 4. Paused deals excluded from deals_public_browse.
--
-- Restored claim gate: 20260730180000_restore_claim_deal_pause_gate.sql
-- Discovery view filter: 20260730190000_paused_deals_discovery_filter.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/claim_deal_pause_gate_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: claim on an already-paused deal is hard-rejected.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_err TEXT;
  v_claimed BOOLEAN := false;
  v_pause_rejected BOOLEAN := false;
  v_browse INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_pause_gate_a', 'test.pause.gate.a', '+254700000411', 'BBS Mall', 'active', 100, '1st Floor', 'P-1', TRUE)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_mid, 'Paused deal A', 'https://img/x', true, true, NOW() + INTERVAL '6 hours', 50, 0, 30, 500)
    RETURNING id INTO v_did;

  -- Do NOT raise the "expected" sentinel inside this block. The previous version
  -- did, and the sentinel text contained "deal_paused", so the WHEN OTHERS
  -- handler caught its own sentinel and the LIKE '%deal_paused%' assertion
  -- passed. That made the test report OK even with the gate absent — verified by
  -- stripping `RAISE EXCEPTION 'deal_paused'` from claim_deal and re-running:
  -- it still printed OK. Record success/failure in a flag and assert outside.
  BEGIN
    PERFORM public.claim_deal(v_uid, v_did);
    v_claimed := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    -- Exact match, not LIKE: a substring test is what let the sentinel through.
    v_pause_rejected := v_err = 'deal_paused';
  END;

  ASSERT NOT v_claimed,
    'A: claim_deal accepted a claim on a paused deal — the deal_paused gate is missing';
  ASSERT v_pause_rejected,
    format('A: paused claim must raise deal_paused, got: %s', COALESCE(v_err, '<none>'));

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.redemptions WHERE deal_id = v_did
  ), 'A: paused deal must not create a redemption';

  SELECT COUNT(*) INTO v_browse FROM public.deals_public_browse WHERE id = v_did;
  ASSERT v_browse = 0, 'A: paused deal must not appear in deals_public_browse';

  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;

  RAISE NOTICE 'Scenario A passed: paused claim rejected + hidden from browse view';
END $$;

-- Scenario B: claim while active → pause → verify still works; second shopper blocked.
DO $$
DECLARE
  v_uid1 UUID;
  v_uid2 UUID;
  v_mid UUID;
  v_did UUID;
  v_otp TEXT;
  v_rid UUID;
  v_err TEXT;
  v_claimed2 BOOLEAN := false;
  v_pause_rejected BOOLEAN := false;
  v_verify RECORD;
  v_browse INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid2;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_pause_gate_b', 'test.pause.gate.b', '+254700000412', 'BBS Mall', 'active', 500, '1st Floor', 'P-2', TRUE)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_mid, 'Active then paused', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 50, 0, 30, 500)
    RETURNING id INTO v_did;

  SELECT redemption_id, otp_code INTO v_rid, v_otp
    FROM public.claim_deal(v_uid1, v_did);
  ASSERT v_rid IS NOT NULL, 'B: claim while active must succeed';

  UPDATE public.deals SET is_paused = TRUE WHERE id = v_did;

  SELECT COUNT(*) INTO v_browse FROM public.deals_public_browse WHERE id = v_did;
  ASSERT v_browse = 0, 'B: after pause, deal must leave deals_public_browse';

  BEGIN
    PERFORM public.claim_deal(v_uid2, v_did);
    v_claimed2 := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_pause_rejected := v_err = 'deal_paused';
  END;
  ASSERT NOT v_claimed2, 'B: second shopper must not claim after pause';
  ASSERT v_pause_rejected,
    format('B: second claim must raise deal_paused, got: %s', COALESCE(v_err, '<none>'));

  -- Existing ticket remains verifiable (verify_redemption ignores is_paused).
  SELECT * INTO v_verify FROM public.verify_redemption(v_mid, v_otp);
  ASSERT v_verify.redemption_status = 'success',
    format('B: existing ticket must verify after pause, got status=%s', v_verify.redemption_status);

  ASSERT EXISTS (
    SELECT 1 FROM public.redemptions
     WHERE id = v_rid AND status = 'success'
  ), 'B: redemption must be success after verify on paused deal';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id IN (v_uid1, v_uid2);

  RAISE NOTICE 'Scenario B passed: claimed-while-active ticket survives pause + verify';
END $$;

-- Scenario C: pause → resume → re-enters browse + claimable again.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_browse INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_pause_gate_c', 'test.pause.gate.c', '+254700000413', 'BBS Mall', 'active', 100, '1st Floor', 'P-3', TRUE)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_mid, 'Resume deal', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 50, 0, 30, 500)
    RETURNING id INTO v_did;

  UPDATE public.deals SET is_paused = TRUE WHERE id = v_did;
  SELECT COUNT(*) INTO v_browse FROM public.deals_public_browse WHERE id = v_did;
  ASSERT v_browse = 0, 'C: paused deal hidden from browse';

  UPDATE public.deals SET is_paused = FALSE WHERE id = v_did;
  SELECT COUNT(*) INTO v_browse FROM public.deals_public_browse WHERE id = v_did;
  ASSERT v_browse = 1, 'C: resumed deal must re-enter deals_public_browse';

  SELECT redemption_id INTO v_rid FROM public.claim_deal(v_uid, v_did);
  ASSERT v_rid IS NOT NULL, 'C: resumed deal must be claimable again';

  DELETE FROM public.redemptions WHERE deal_id = v_did;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;

  RAISE NOTICE 'Scenario C passed: resume restores discovery + claimability';
END $$;

DO $$ BEGIN RAISE NOTICE 'claim_deal_pause_gate_test: ALL OK'; END $$;
