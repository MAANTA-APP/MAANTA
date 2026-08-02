-- ============================================================
-- Test: nodes registry (20260802120000_nodes_registry.sql) — drift D62.
--
-- The scenario that matters is C: renaming a mall for display must not orphan
-- its deals and merchants. That was the actual defect — the display name was
-- the join key — and it is the one a future refactor is most likely to undo.
--
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/nodes_registry_test.sql
-- ============================================================

-- Scenario A: the five known nodes are seeded, and Node 0 is live.
DO $$
DECLARE
  v_count INT;
  v_live  BOOLEAN;
  v_label TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.nodes
    WHERE id IN ('BBS Mall', 'CBD Galleria', 'Westlands Hub', 'Two Rivers Mall', 'Sarit Centre');
  ASSERT v_count = 5, format('A: expected 5 seeded nodes, got %s', v_count);

  SELECT is_live, label INTO v_live, v_label FROM public.nodes WHERE id = 'BBS Mall';
  ASSERT v_live IS TRUE, 'A: BBS Mall (Node 0) must be live';
  ASSERT v_label = 'BBS Mall, Eastleigh', format('A: unexpected BBS Mall label %s', v_label);

  RAISE NOTICE 'Scenario A passed: node registry seeded, Node 0 live';
END $$;

-- Scenario B: a deal or merchant cannot name a node that does not exist.
-- This is the constraint that did not exist before D62 — any typo was accepted.
DO $$
DECLARE
  v_mid UUID;
BEGIN
  BEGIN
    INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status)
      VALUES ('__test_nodes_bogus', 'test.nodes.bogus', '+254700000801', 'Nowhere Mall', 'active');
    RAISE EXCEPTION 'B: merchants accepted an unknown node value';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_nodes_ok', 'test.nodes.ok', '+254700000802', 'BBS Mall', 'active', 999)
    RETURNING id INTO v_mid;

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, node)
      VALUES (v_mid, '__test nodes bogus deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100, 'Nowhere Mall');
    RAISE EXCEPTION 'B: deals accepted an unknown node value';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario B passed: unknown node values are rejected on both tables';
END $$;

-- Scenario C: THE D62 CASE. Renaming a mall for display must not orphan
-- anything. Before this migration the display name *was* the key, so a rename
-- silently detached every deal and merchant referencing the old string.
DO $$
DECLARE
  v_mid          UUID;
  v_did          UUID;
  v_saved_label  TEXT;
  v_deal_node    TEXT;
  v_merch_node   TEXT;
  v_joined       INT;
BEGIN
  SELECT label INTO v_saved_label FROM public.nodes WHERE id = 'BBS Mall';

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, is_visible, account_balance)
    VALUES ('__test_nodes_rename', 'test.nodes.rename', '+254700000803', 'BBS Mall', 'active', TRUE, 999)
    RETURNING id INTO v_mid;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes, node)
    VALUES (v_mid, '__test nodes rename deal', 'x', TRUE, NOW() + INTERVAL '2 hours', 100, 'BBS Mall')
    RETURNING id INTO v_did;

  -- The rename an operator would actually perform.
  UPDATE public.nodes SET label = 'BBS Shopping Centre, Eastleigh', updated_at = NOW()
    WHERE id = 'BBS Mall';

  SELECT d.node, m.node INTO v_deal_node, v_merch_node
    FROM public.deals d JOIN public.merchants m ON m.id = d.merchant_id
    WHERE d.id = v_did;

  ASSERT v_deal_node = 'BBS Mall', format('C: deal node changed to %s', v_deal_node);
  ASSERT v_merch_node = 'BBS Mall', format('C: merchant node changed to %s', v_merch_node);

  -- Still joins to a node, and that node now shows the new display name.
  SELECT COUNT(*) INTO v_joined
    FROM public.deals d
    JOIN public.nodes n ON n.id = d.node
    WHERE d.id = v_did AND n.label = 'BBS Shopping Centre, Eastleigh';
  ASSERT v_joined = 1, 'C: renamed node no longer joins to its deal';

  UPDATE public.nodes SET label = v_saved_label, updated_at = NOW() WHERE id = 'BBS Mall';
  DELETE FROM public.deals WHERE id = v_did;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario C passed: renaming a node label orphans nothing';
END $$;

-- Scenario D: the id itself is frozen. Without this, a well-meaning UPDATE on
-- nodes.id would ON UPDATE CASCADE straight through the money path's node
-- scoping — which is the same orphaning risk wearing a different hat.
DO $$
BEGIN
  BEGIN
    UPDATE public.nodes SET id = 'BBS Mall Renamed' WHERE id = 'BBS Mall';
    RAISE EXCEPTION 'D: nodes.id was allowed to change';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%node_id_immutable%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'Scenario D passed: nodes.id is immutable';
END $$;

-- Scenario E: a node carrying history cannot be deleted out from under it.
-- Retirement is is_live = FALSE, not DELETE.
DO $$
DECLARE
  v_mid  UUID;
  v_live BOOLEAN;
BEGIN
  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_nodes_retire', 'test.nodes.retire', '+254700000804', 'CBD Galleria', 'active', 999)
    RETURNING id INTO v_mid;

  BEGIN
    DELETE FROM public.nodes WHERE id = 'CBD Galleria';
    RAISE EXCEPTION 'E: a node with live references was deleted';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  -- The supported retirement path still works and leaves the row joinable.
  UPDATE public.nodes SET is_live = FALSE, updated_at = NOW() WHERE id = 'CBD Galleria';
  SELECT is_live INTO v_live FROM public.nodes WHERE id = 'CBD Galleria';
  ASSERT v_live IS FALSE, 'E: node could not be retired via is_live';

  UPDATE public.nodes SET is_live = TRUE, updated_at = NOW() WHERE id = 'CBD Galleria';
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario E passed: nodes retire via is_live, never by DELETE';
END $$;

-- Scenario F: reference data is readable before sign-in (the mall switcher
-- renders for anon) and writable by nobody but service_role.
DO $$
DECLARE
  v_count INT;
BEGIN
  SET ROLE anon;
  SELECT COUNT(*) INTO v_count FROM public.nodes WHERE is_live;
  ASSERT v_count >= 1, 'F: anon cannot read live nodes';

  BEGIN
    UPDATE public.nodes SET label = 'anon owned' WHERE id = 'BBS Mall';
    RESET ROLE;
    RAISE EXCEPTION 'F: anon was able to write to nodes';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  SET ROLE authenticated;
  BEGIN
    INSERT INTO public.nodes (id, slug, label, short_label)
      VALUES ('__test_authed', 'test_authed', 'x', 'x');
    RESET ROLE;
    RAISE EXCEPTION 'F: authenticated was able to insert a node';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'Scenario F passed: nodes are world-readable, service_role-writable';
END $$;

-- Scenario G: adding a mall is a row, which is the other half of D62.
DO $$
DECLARE
  v_mid   UUID;
  v_count INT;
BEGIN
  INSERT INTO public.nodes (id, slug, label, short_label, lat, lng, is_live, display_order)
    VALUES ('__test_new_mall', 'test_new_mall', 'Test New Mall, Nairobi', 'Test Mall', -1.3, 36.8, TRUE, 500);

  INSERT INTO public.merchants (merchant_name, what3words_address, phone, node, status, account_balance)
    VALUES ('__test_nodes_newmall', 'test.nodes.newmall', '+254700000805', '__test_new_mall', 'active', 999)
    RETURNING id INTO v_mid;

  SELECT COUNT(*) INTO v_count
    FROM public.merchants m JOIN public.nodes n ON n.id = m.node
    WHERE m.id = v_mid AND n.is_live;
  ASSERT v_count = 1, 'G: a merchant at a newly registered node does not join';

  DELETE FROM public.merchants WHERE id = v_mid;
  DELETE FROM public.nodes WHERE id = '__test_new_mall';
  RAISE NOTICE 'Scenario G passed: registering a node needs no deploy';
END $$;

-- Scenario H: the slug is URL-safe by constraint, not by convention.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.nodes (id, slug, label, short_label)
      VALUES ('__test_badslug', 'Not A Slug!', 'x', 'x');
    DELETE FROM public.nodes WHERE id = '__test_badslug';
    RAISE EXCEPTION 'H: an unsafe slug was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'Scenario H passed: slug format is enforced';
END $$;
