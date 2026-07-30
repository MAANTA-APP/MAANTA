-- ============================================================
-- Test: anon browse views (20260723130000_fix_browse_views_security_invoker.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/browse_views_test.sql
-- ============================================================

-- Scenario A: anon can read browse views (security_invoker = false).
DO $$
DECLARE
  v_mid UUID;
  v_did UUID;
  v_merchant_count INT;
  v_deal_count INT;
  v_balance NUMERIC;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance
  )
    VALUES ('__test_browse_view', 'test.browse.view', '+254700000401', 'BBS Mall', 'active', TRUE, 999)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test browse deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;

  SET ROLE anon;
  SELECT COUNT(*) INTO v_merchant_count FROM public.merchants_public_browse WHERE id = v_mid;
  SELECT COUNT(*) INTO v_deal_count FROM public.deals_public_browse WHERE id = v_did;
  BEGIN
    SELECT account_balance INTO v_balance FROM public.merchants_public_browse WHERE id = v_mid;
    RAISE EXCEPTION 'A: account_balance should not be exposed via browse view';
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;
  RESET ROLE;

  ASSERT v_merchant_count = 1, format('A: expected 1 merchant row, got %s', v_merchant_count);
  ASSERT v_deal_count = 1, format('A: expected 1 deal row, got %s', v_deal_count);

  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario A passed: anon can read browse views without base-table grants';
END $$;

-- Scenario B: anon still cannot read wallet columns from the base merchants table.
DO $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SET ROLE anon;
  BEGIN
    SELECT account_balance INTO v_balance FROM public.merchants LIMIT 1;
    RAISE EXCEPTION 'B: anon should not SELECT from merchants base table';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'Scenario B passed: anon cannot SELECT merchants base table';
END $$;

-- Scenario C: pending / shadow-banned merchants are not exposed via browse views.
DO $$
DECLARE
  v_pending UUID;
  v_shadow UUID;
  v_n INT;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, is_shadow_banned, account_balance
  )
    VALUES ('__test_browse_pending', 'test.browse.pend', '+254700000402', 'BBS Mall', 'pending', TRUE, FALSE, 999)
    RETURNING id INTO v_pending;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, is_shadow_banned, account_balance
  )
    VALUES ('__test_browse_shadow', 'test.browse.shad', '+254700000403', 'BBS Mall', 'active', TRUE, TRUE, 999)
    RETURNING id INTO v_shadow;

  SET ROLE anon;
  SELECT COUNT(*) INTO v_n FROM public.merchants_public_browse WHERE id IN (v_pending, v_shadow);
  RESET ROLE;
  ASSERT v_n = 0, format('C: expected 0 non-public merchants in browse view, got %s', v_n);

  DELETE FROM public.merchants WHERE id IN (v_pending, v_shadow);
  RAISE NOTICE 'Scenario C passed: browse views hide pending/shadow-banned merchants';
END $$;

-- Scenario D: paused deals are excluded from deals_public_browse
-- (20260730190000_paused_deals_discovery_filter.sql).
DO $$
DECLARE
  v_mid UUID;
  v_active UUID;
  v_paused UUID;
  v_n INT;
BEGIN
  -- Elite so two active deals are allowed (standard cap is 1).
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_browse_pause', 'test.browse.pause', '+254700000404', 'BBS Mall', 'active', TRUE, 999, 'elite')
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, price_kes)
    VALUES (v_mid, '__test active browse', 'x', TRUE, FALSE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_active;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, price_kes)
    VALUES (v_mid, '__test paused browse', 'x', TRUE, TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_paused;

  SELECT COUNT(*) INTO v_n FROM public.deals_public_browse WHERE id = v_active;
  ASSERT v_n = 1, format('D: active deal should appear in browse view, got %s', v_n);
  SELECT COUNT(*) INTO v_n FROM public.deals_public_browse WHERE id = v_paused;
  ASSERT v_n = 0, format('D: paused deal must be excluded from browse view, got %s', v_n);

  DELETE FROM public.deals WHERE id IN (v_active, v_paused);
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario D passed: paused deals excluded from deals_public_browse';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL browse_views scenarios passed.'; END $$;
