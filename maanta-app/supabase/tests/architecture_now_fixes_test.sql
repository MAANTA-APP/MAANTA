-- ============================================================
-- Test: architecture now-fixes (20260726200000)
--   - verified_counts_by_merchant aggregates past PostgREST caps
--   - browse views hide non-public merchants / inactive deals
--   - admin report RPCs return SQL aggregates
-- ============================================================

-- Scenario A: verified counts GROUP BY is accurate for many rows.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_count BIGINT;
  i INT;
BEGIN
  INSERT INTO public.users (role, phone)
    VALUES ('customer', '+254700009901')
    RETURNING id INTO v_uid;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance
  )
    VALUES ('__test_verified_counts', 'test.verified.counts', '+254700009902', 'BBS Mall', 'active', TRUE, 999)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test verified deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  FOR i IN 1..25 LOOP
    INSERT INTO public.redemptions (
      deal_id, merchant_id, user_id, otp_code, status, expires_at, success_fee_charged, redeemed_at
    )
      VALUES (
        v_did, v_mid, v_uid,
        LPAD((900000 + i)::text, 6, '0'),
        'success',
        NOW() + INTERVAL '1 hour',
        30,
        NOW() - (i || ' minutes')::interval
      );
  END LOOP;

  SELECT verified_count INTO v_count
  FROM public.verified_counts_by_merchant(ARRAY[v_mid]);

  ASSERT v_count = 25, format('A: expected 25 verified, got %s', v_count);

  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario A passed: verified_counts_by_merchant aggregates correctly';
END $$;

-- Scenario B: browse views hide pending / shadow-banned / inactive deals.
DO $$
DECLARE
  v_active UUID;
  v_pending UUID;
  v_shadow UUID;
  v_live_deal UUID;
  v_dead_deal UUID;
  v_n INT;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, is_shadow_banned, account_balance
  )
    VALUES ('__test_browse_active', 'test.browse.active', '+254700009911', 'BBS Mall', 'active', TRUE, FALSE, 999)
    RETURNING id INTO v_active;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, is_shadow_banned, account_balance
  )
    VALUES ('__test_browse_pending', 'test.browse.pending', '+254700009912', 'BBS Mall', 'pending', TRUE, FALSE, 999)
    RETURNING id INTO v_pending;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, is_shadow_banned, account_balance
  )
    VALUES ('__test_browse_shadow', 'test.browse.shadow', '+254700009913', 'BBS Mall', 'active', TRUE, TRUE, 999)
    RETURNING id INTO v_shadow;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_active, '__live', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_live_deal;

  SET ROLE anon;
  SELECT COUNT(*) INTO v_n FROM public.merchants_public_browse WHERE id = v_active;
  ASSERT v_n = 1, 'B: active public merchant should be visible';
  SELECT COUNT(*) INTO v_n FROM public.merchants_public_browse WHERE id = v_pending;
  ASSERT v_n = 0, 'B: pending merchant must be hidden from browse view';
  SELECT COUNT(*) INTO v_n FROM public.merchants_public_browse WHERE id = v_shadow;
  ASSERT v_n = 0, 'B: shadow-banned merchant must be hidden from browse view';
  SELECT COUNT(*) INTO v_n FROM public.deals_public_browse WHERE id = v_live_deal;
  ASSERT v_n = 1, 'B: live deal should be visible';
  RESET ROLE;

  -- Deal-limit trigger counts rows per merchant; pause in place to assert hide.
  UPDATE public.deals SET is_active = FALSE WHERE id = v_live_deal
    RETURNING id INTO v_dead_deal;
  SET ROLE anon;
  SELECT COUNT(*) INTO v_n FROM public.deals_public_browse WHERE id = v_dead_deal;
  ASSERT v_n = 0, 'B: paused deal must be hidden from browse view';
  RESET ROLE;

  DELETE FROM public.deals WHERE id = v_live_deal;
  DELETE FROM public.merchants WHERE id IN (v_active, v_pending, v_shadow);
  RAISE NOTICE 'Scenario B passed: browse views enforce public visibility';
END $$;

-- Scenario C: admin_success_fee_revenue aggregates genuine linked fees.
--
-- REWRITTEN by 20260829120000 (drift D211). The old version inserted two
-- unlinked `success_fee` rows and asserted the RPC returned at least 60. Under
-- the corrected contract those rows are invisible: a ledger row carries nothing
-- about its merchant or deal, so a fee only counts when it links to a
-- genuine-tagged redemption (D188). The old assertion was therefore proving
-- that an UNSCOPED sum existed, which is the defect, not the fix.
--
-- What it asserts now is what the shim is actually for: a genuine-tagged,
-- fully-billed fee reaches the number, and an unlinked row does not.
DO $$
DECLARE
  v_uid UUID;
  v_mid UUID;
  v_did UUID;
  v_rid UUID;
  v_before NUMERIC;
  v_after  NUMERIC;
  v_noise  NUMERIC;
BEGIN
  SELECT public.admin_success_fee_revenue(NOW() - INTERVAL '1 hour') INTO v_before;

  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;
  INSERT INTO public.merchants
    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_admin_rev', 'test.admin.rev', '+254700009921', 'BBS Mall', 'active', TRUE, 999)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, expires_at)
    VALUES (v_mid, '__test_admin_rev', 'x', NOW() + INTERVAL '30 days')
    RETURNING id INTO v_did;
  INSERT INTO public.redemptions
    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged)
    VALUES (v_did, v_mid, v_uid, '889901', 'success', NOW() + INTERVAL '1 hour', NOW() - INTERVAL '10 minutes', 30)
    RETURNING id INTO v_rid;

  -- A genuine, linked, correctly-signed fee.
  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id)
    VALUES (v_mid, -30, 'success_fee', 'manual', '__test_arch_fee_1', 't', v_rid);

  SELECT public.admin_success_fee_revenue(NOW() - INTERVAL '1 hour') INTO v_after;
  ASSERT v_after = v_before + 30,
    format('C: expected the linked fee to add exactly 30 (%s -> %s)', v_before, v_after);

  -- An UNLINKED fee row, and a top-up. Neither may move the figure: the first
  -- cannot be tied to a genuine-tagged redemption, the second is not a fee.
  INSERT INTO public.merchant_transactions
    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description)
    VALUES
      (v_mid, -30, 'success_fee', 'manual', '__test_arch_fee_2', 't'),
      (v_mid, 500, 'topup',       'manual', '__test_arch_topup_1', 't');

  SELECT public.admin_success_fee_revenue(NOW() - INTERVAL '1 hour') INTO v_noise;
  ASSERT v_noise = v_after,
    format('C: an unlinked fee row and a top-up must not move the figure (%s -> %s)', v_after, v_noise);

  DELETE FROM public.merchant_transactions WHERE merchant_id = v_mid;
  DELETE FROM public.redemptions WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.users WHERE id = v_uid;
  RAISE NOTICE 'Scenario C passed: admin_success_fee_revenue counts genuine linked fees only';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL architecture_now_fixes scenarios passed.'; END $$;
