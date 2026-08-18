-- ============================================================
-- Test: deal categories (20260818120000_deal_categories.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deal_categories_test.sql
-- ============================================================

-- Scenario A: the three locked keys are accepted, anything else is rejected,
-- and NULL stays legal (uncategorised deals predate the column).
DO $$
DECLARE
  v_mid UUID;
  v_did UUID;
  v_key TEXT;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance
  )
    VALUES ('__test_deal_category', 'test.deal.category', '+254700000801', 'BBS Mall', 'active', TRUE, 999)
    RETURNING id INTO v_mid;

  FOREACH v_key IN ARRAY ARRAY['fashion', 'beauty', 'food'] LOOP
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, category)
      VALUES (v_mid, '__test category ' || v_key, 'x', TRUE, NOW() + INTERVAL '2 hours', 100, v_key)
      RETURNING id INTO v_did;
    DELETE FROM public.deals WHERE id = v_did;
  END LOOP;

  -- NULL is legal: every deal created before this migration has one.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test category null', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_did;
  DELETE FROM public.deals WHERE id = v_did;

  -- A key outside the taxonomy must not reach the table. Without the CHECK the
  -- filter would silently accumulate buckets no chip renders, and those deals
  -- would be discoverable only under "All" with nothing saying why.
  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, category)
      VALUES (v_mid, '__test category bogus', 'x', TRUE, NOW() + INTERVAL '2 hours', 100, 'electronics');
    RAISE EXCEPTION 'A: an unknown category key was accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  -- Case matters: the app writes lowercase keys and filters on equality.
  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, category)
      VALUES (v_mid, '__test category case', 'x', TRUE, NOW() + INTERVAL '2 hours', 100, 'Food');
    RAISE EXCEPTION 'A: a mis-cased category key was accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario A passed: category CHECK accepts the three locked keys and NULL only';
END $$;

-- Scenario B: the browse view exposes category AND still hides paused deals.
-- The view is recreated by this migration, so the pause predicate (D25/D32) is
-- re-asserted here — a recreate that dropped it would otherwise pass every
-- existing test while re-advertising paused deals to anon clients.
DO $$
DECLARE
  v_mid UUID;
  v_live UUID;
  v_paused UUID;
  v_category TEXT;
  v_paused_visible INT;
BEGIN
  -- Elite so two active deals are allowed: enforce_deal_limit caps Standard at 1,
  -- and this scenario needs a live deal and a paused deal side by side to tell
  -- the two view outcomes apart. Same reason, same fix as Scenario D of
  -- browse_views_test.sql.
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_category_view', 'test.category.view', '+254700000802', 'BBS Mall', 'active', TRUE, 999, 'elite')
    RETURNING id INTO v_mid;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, category)
    VALUES (v_mid, '__test view live', 'x', TRUE, NOW() + INTERVAL '2 hours', 100, 'beauty')
    RETURNING id INTO v_live;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, price_kes, category)
    VALUES (v_mid, '__test view paused', 'x', TRUE, TRUE, NOW() + INTERVAL '2 hours', 100, 'food')
    RETURNING id INTO v_paused;

  SET ROLE anon;
  SELECT category INTO v_category FROM public.deals_public_browse WHERE id = v_live;
  SELECT COUNT(*) INTO v_paused_visible FROM public.deals_public_browse WHERE id = v_paused;
  RESET ROLE;

  ASSERT v_category = 'beauty', format('B: expected category beauty, got %s', v_category);
  ASSERT v_paused_visible = 0, 'B: paused deal is visible in deals_public_browse — the recreate lost the pause predicate';

  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario B passed: browse view carries category and still hides paused deals';
END $$;
