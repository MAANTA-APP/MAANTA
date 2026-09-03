-- ============================================================
-- Test: D236 — max_claims is a CLAIM ALLOCATION, enforced at issuance.
--
-- Founder ruling 2026-09-03. Each scenario names the invariant it proves.
--
--   A  INVARIANT A  cap binds at claim issuance, not at redemption
--   B  INVARIANT B  the cap holds against a DIRECT insert, not just claim_deal
--   C  INVARIANT G  a claim issued before exhaustion still redeems normally
--   D  INVARIANT D  max_claims cannot be lowered below claims already issued
--   E  INVARIANT E  raising the allocation re-opens claiming
--   F  INVARIANT F  pause blocks new claims and cancels none
--   G  INVARIANT J  an EXPIRED claim does not release its slot
--   H              claims_issued = count(redemptions) — the counter invariant
--   I              claims_count stays REDEMPTIONS, claims_issued stays CLAIMS
--
-- Migration: 20260903120000_claim_allocation_cap.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/claim_allocation_cap_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Scenario A: the allocation binds at CLAIM time. This is the regression the
-- whole migration exists for — before it, claims_count only moved at
-- verification, so an unlimited number of codes could be issued.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u1 UUID; v_u2 UUID; v_u3 UUID;
  v_err TEXT; v_third_claimed BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u2;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u3;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_a', 'test.alloc.a', '+254700000901', 'BBS Mall', 'active', 500, '1st Floor', 'A-1', TRUE)
    RETURNING id INTO v_m;
  -- Allocation of TWO.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Two claims only', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 2, 0, 30, 500)
    RETURNING id INTO v_d;

  PERFORM public.claim_deal(v_u1, v_d);
  PERFORM public.claim_deal(v_u2, v_d);

  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 2,
    'A: two claims must consume two slots';
  -- Nobody has redeemed, so the OLD counter is still zero. That is exactly the
  -- condition under which the pre-D236 cap failed open.
  ASSERT (SELECT claims_count FROM public.deals WHERE id = v_d) = 0,
    'A: claims_count must still be 0 — it counts redemptions, not claims';

  BEGIN
    PERFORM public.claim_deal(v_u3, v_d);
    v_third_claimed := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  ASSERT NOT v_third_claimed,
    'A: a third claim was issued against an allocation of 2 — the cap does not bind at issuance';
  ASSERT v_err = 'deal_claim_limit_reached',
    format('A: expected deal_claim_limit_reached, got: %s', COALESCE(v_err, '<none>'));
  ASSERT (SELECT count(*) FROM public.redemptions WHERE deal_id = v_d) = 2,
    'A: the refused claim must not have created a redemption row';

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id IN (v_u1, v_u2, v_u3);
  RAISE NOTICE 'A passed: allocation binds at claim issuance (INVARIANT A)';
END $$;

-- Scenario B: the cap is on the TABLE, so a writer that never calls claim_deal
-- is still bound by the merchant's promise.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u UUID; v_err TEXT; v_inserted BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_b', 'test.alloc.b', '+254700000902', 'BBS Mall', 'active', 500, '1st Floor', 'B-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'One claim only', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 1, 0, 30, 500)
    RETURNING id INTO v_d;

  PERFORM public.claim_deal(v_u, v_d);

  BEGIN
    INSERT INTO public.redemptions (deal_id, merchant_id, user_id, otp_code, success_fee_charged, status, expires_at, amount_kes)
    VALUES (v_d, v_m, v_u, '999111', 30, 'pending', NOW() + INTERVAL '2 hours', 500);
    v_inserted := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  ASSERT NOT v_inserted,
    'B: a direct INSERT bypassed the allocation — the cap is not on the table';
  ASSERT v_err = 'deal_claim_limit_reached',
    format('B: expected deal_claim_limit_reached from the trigger, got: %s', COALESCE(v_err, '<none>'));

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_u;
  RAISE NOTICE 'B passed: allocation holds against a direct insert (INVARIANT B)';
END $$;

-- Scenario C: a claim issued while capacity existed must redeem normally. There
-- is NO second stock rejection at the counter (INVARIANT G), and the KES 30 fee
-- behaves exactly as before (INVARIANT H).
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u UUID; v_claim RECORD; v_verify RECORD; v_bal NUMERIC;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_c', 'test.alloc.c', '+254700000903', 'BBS Mall', 'active', 500, '1st Floor', 'C-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Single allocation', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 1, 0, 30, 500)
    RETURNING id INTO v_d;

  SELECT * INTO v_claim FROM public.claim_deal(v_u, v_d);
  -- The allocation is now exhausted. The already-issued claim must not care.
  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 1, 'C: slot consumed';

  SELECT * INTO v_verify FROM public.verify_redemption(v_m, v_claim.otp_code, NULL, false, NULL);
  ASSERT v_verify.redemption_status = 'success',
    format('C: an exhausted allocation must not block redeeming an issued claim, got %s', v_verify.redemption_status);
  ASSERT v_verify.fee_charge_status = 'charged',
    format('C: fee must still be charged exactly once, got %s', COALESCE(v_verify.fee_charge_status,'<null>'));
  ASSERT v_verify.fee_amount = 30, 'C: success fee must remain KES 30';

  SELECT account_balance INTO v_bal FROM public.merchants WHERE id = v_m;
  ASSERT v_bal = 470, format('C: balance must be 500-30=470, got %s', v_bal);
  -- Both counters now moved, for different reasons.
  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 1, 'C: claims_issued unchanged by redemption';
  ASSERT (SELECT claims_count  FROM public.deals WHERE id = v_d) = 1, 'C: claims_count incremented by redemption';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id = v_u;
  RAISE NOTICE 'C passed: issued claim redeems normally, fee once (INVARIANTS G, H)';
END $$;

-- Scenario D: an internally contradictory allocation is impossible.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u1 UUID; v_u2 UUID; v_lowered BOOLEAN := false; v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u2;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_d', 'test.alloc.d', '+254700000904', 'BBS Mall', 'active', 500, '1st Floor', 'D-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Lowerable', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 5, 0, 30, 500)
    RETURNING id INTO v_d;

  PERFORM public.claim_deal(v_u1, v_d);
  PERFORM public.claim_deal(v_u2, v_d);

  -- Lowering to 2 is legal: it equals what has been issued and simply stops
  -- further claiming. This is the merchant's stock-protection lever.
  UPDATE public.deals SET max_claims = 2 WHERE id = v_d;
  ASSERT (SELECT max_claims FROM public.deals WHERE id = v_d) = 2, 'D: lowering to the issued count must be allowed';

  -- Lowering BELOW the issued count would retroactively un-promise a code that
  -- a shopper is already holding. The database refuses.
  BEGIN
    UPDATE public.deals SET max_claims = 1 WHERE id = v_d;
    v_lowered := true;
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;

  ASSERT NOT v_lowered,
    'D: max_claims was lowered below claims already issued — existing claims can be silently over-promised';
  ASSERT (SELECT count(*) FROM public.redemptions WHERE deal_id = v_d AND status = 'pending') = 2,
    'D: both issued claims must survive the rejected edit (INVARIANT C)';

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id IN (v_u1, v_u2);
  RAISE NOTICE 'D passed: contradictory allocation refused, existing claims preserved (INVARIANTS C, D)';
END $$;

-- Scenario E: raising the allocation re-opens claiming.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u1 UUID; v_u2 UUID;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u2;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_e', 'test.alloc.e', '+254700000905', 'BBS Mall', 'active', 500, '1st Floor', 'E-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Raisable', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 1, 0, 30, 500)
    RETURNING id INTO v_d;

  PERFORM public.claim_deal(v_u1, v_d);
  UPDATE public.deals SET max_claims = 2 WHERE id = v_d;
  PERFORM public.claim_deal(v_u2, v_d);

  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 2,
    'E: raising the allocation must let another shopper claim';

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id IN (v_u1, v_u2);
  RAISE NOTICE 'E passed: allocation can be raised (INVARIANT E)';
END $$;

-- Scenario F: pause is the other stock lever. It blocks NEW claims and cancels
-- nothing — the ticket a shopper already holds still verifies.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u1 UUID; v_u2 UUID; v_claim RECORD; v_verify RECORD;
  v_blocked BOOLEAN := false; v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u2;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_f', 'test.alloc.f', '+254700000906', 'BBS Mall', 'active', 500, '1st Floor', 'F-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Pausable', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 10, 0, 30, 500)
    RETURNING id INTO v_d;

  SELECT * INTO v_claim FROM public.claim_deal(v_u1, v_d);
  UPDATE public.deals SET is_paused = true WHERE id = v_d;

  BEGIN
    PERFORM public.claim_deal(v_u2, v_d);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM; v_blocked := (v_err = 'deal_paused');
  END;
  ASSERT v_blocked, format('F: pause must block a new claim, got: %s', COALESCE(v_err,'<none>'));

  -- Capacity was NOT consumed by the refused claim.
  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 1,
    'F: a claim refused by pause must not consume a slot';

  SELECT * INTO v_verify FROM public.verify_redemption(v_m, v_claim.otp_code, NULL, false, NULL);
  ASSERT v_verify.redemption_status = 'success',
    'F: pausing must not cancel an already-issued ticket (INVARIANT F)';

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m;
  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id IN (v_u1, v_u2);
  RAISE NOTICE 'F passed: pause blocks new claims, preserves issued ones (INVARIANT F)';
END $$;

-- Scenario G: an EXPIRED claim keeps its slot. This is the conservative reading
-- of the 2026-09-03 ruling: allocation is consumed at issuance. Whether a
-- no-show should hand capacity back is an OPEN founder decision (INVARIANT J),
-- deliberately not implemented. If that ruling changes, THIS test is the one
-- that must be updated first — it is the written record of today's semantics.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u1 UUID; v_u2 UUID; v_claimed BOOLEAN := false; v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u2;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_g', 'test.alloc.g', '+254700000907', 'BBS Mall', 'active', 500, '1st Floor', 'G-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Expiring', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 1, 0, 30, 500)
    RETURNING id INTO v_d;

  PERFORM public.claim_deal(v_u1, v_d);
  -- Force the claim past its expiry without deleting it.
  UPDATE public.redemptions SET expires_at = NOW() - INTERVAL '1 hour' WHERE deal_id = v_d;

  BEGIN
    PERFORM public.claim_deal(v_u2, v_d);
    v_claimed := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  ASSERT NOT v_claimed,
    'G: an expired claim released its slot — that is an inventory rule nobody authorised';
  ASSERT v_err = 'deal_claim_limit_reached',
    format('G: expected deal_claim_limit_reached, got %s', COALESCE(v_err,'<none>'));

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id IN (v_u1, v_u2);
  RAISE NOTICE 'G passed: expiry does NOT release a slot — today''s documented semantics (INVARIANT J)';
END $$;

-- Scenario H: the counter invariant, including the DELETE bookkeeping path the
-- demo wipe relies on.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u1 UUID; v_u2 UUID; v_drift INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u1;
  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u2;
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_h', 'test.alloc.h', '+254700000908', 'BBS Mall', 'active', 500, '1st Floor', 'H-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Counted', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', 4, 0, 30, 500)
    RETURNING id INTO v_d;

  PERFORM public.claim_deal(v_u1, v_d);
  PERFORM public.claim_deal(v_u2, v_d);
  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 2, 'H: two issued';

  -- A hard DELETE (what the demo wipe does) must give the slot back, or demo
  -- deals would become permanently unclaimable after a reseed.
  DELETE FROM public.redemptions WHERE deal_id = v_d AND user_id = v_u1;
  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 1,
    'H: deleting a claim row must decrement claims_issued';

  -- The global invariant, over every deal in the database.
  SELECT count(*) INTO v_drift
    FROM public.deals d
   WHERE d.claims_issued <> (SELECT count(*) FROM public.redemptions r WHERE r.deal_id = d.id);
  ASSERT v_drift = 0,
    format('H: %s deal(s) have claims_issued out of step with their redemption rows', v_drift);

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  DELETE FROM public.users WHERE id IN (v_u1, v_u2);
  RAISE NOTICE 'H passed: claims_issued = count(redemptions), globally';
END $$;

-- Scenario I: an unlimited allocation stays unlimited.
DO $$
DECLARE
  v_m UUID; v_d UUID; v_u UUID; i INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance, floor, unit_number, is_visible)
    VALUES ('__test_alloc_i', 'test.alloc.i', '+254700000909', 'BBS Mall', 'active', 500, '1st Floor', 'I-1', TRUE)
    RETURNING id INTO v_m;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, max_claims, claims_count, success_fee, price_kes)
    VALUES (v_m, 'Unlimited', 'https://img/x', true, false, NOW() + INTERVAL '6 hours', NULL, 0, 30, 500)
    RETURNING id INTO v_d;

  FOR i IN 1..12 LOOP
    INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_u;
    PERFORM public.claim_deal(v_u, v_d);
  END LOOP;

  ASSERT (SELECT claims_issued FROM public.deals WHERE id = v_d) = 12,
    'I: a NULL max_claims must not cap anything';

  DELETE FROM public.redemptions WHERE deal_id = v_d;
  DELETE FROM public.deals WHERE id = v_d;
  DELETE FROM public.merchants WHERE id = v_m;
  RAISE NOTICE 'I passed: NULL allocation is unlimited';
END $$;

SELECT 'claim_allocation_cap_test: ALL SCENARIOS PASSED' AS result;
