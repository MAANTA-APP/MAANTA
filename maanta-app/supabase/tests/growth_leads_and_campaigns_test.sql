-- ============================================================
-- Test: growth_merchant_leads + growth_campaigns
--       (20260904120000_growth_leads_and_campaigns.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/growth_leads_and_campaigns_test.sql
-- ============================================================

-- Scenario A: grant posture — service_role writes, authenticated reads only.
DO $$
BEGIN
  ASSERT has_table_privilege('service_role', 'public.growth_merchant_leads', 'INSERT'),
    'A: service_role must INSERT growth_merchant_leads';
  ASSERT has_table_privilege('authenticated', 'public.growth_merchant_leads', 'SELECT'),
    'A: authenticated must retain SELECT (RLS-gated)';
  ASSERT NOT has_table_privilege('authenticated', 'public.growth_merchant_leads', 'INSERT'),
    'A: authenticated must not INSERT growth_merchant_leads';
  ASSERT NOT has_table_privilege('anon', 'public.growth_merchant_leads', 'SELECT'),
    'A: anon must not read growth_merchant_leads';
  ASSERT NOT has_table_privilege('anon', 'public.growth_campaigns', 'SELECT'),
    'A: anon must not read growth_campaigns';
  RAISE NOTICE 'Scenario A passed: growth table grants are service_role-write / admin-read';
END $$;

-- Scenario B: a lost lead must carry a reason; a live lead must not.
DO $$
DECLARE
  v_id UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.growth_merchant_leads (floor, unit, stage)
      VALUES ('GF', '__t01', 'lost');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'B: stage=lost without a lost_reason must be rejected';

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.growth_merchant_leads (floor, unit, stage, lost_reason)
      VALUES ('GF', '__t01', 'new', 'not_interested');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'B: a non-lost lead carrying a lost_reason must be rejected';

  -- The legal pair inserts cleanly.
  INSERT INTO public.growth_merchant_leads (floor, unit, stage, lost_reason)
    VALUES ('GF', '__t01', 'lost', 'unit_vacant') RETURNING id INTO v_id;
  DELETE FROM public.growth_merchant_leads WHERE id = v_id;
  RAISE NOTICE 'Scenario B passed: lost_reason and stage agree by constraint';
END $$;

-- Scenario C: one live card per unit, but a lost lead frees the unit again.
DO $$
DECLARE
  v_first UUID;
  v_second UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.growth_merchant_leads (floor, unit)
    VALUES ('1F', '__t02') RETURNING id INTO v_first;

  BEGIN
    INSERT INTO public.growth_merchant_leads (floor, unit) VALUES ('1F', '__t02');
  EXCEPTION WHEN unique_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'C: a second live lead on the same unit must be rejected';

  -- Marking it lost releases the unit for a future approach without deleting history.
  UPDATE public.growth_merchant_leads
     SET stage = 'lost', lost_reason = 'not_interested' WHERE id = v_first;
  INSERT INTO public.growth_merchant_leads (floor, unit)
    VALUES ('1F', '__t02') RETURNING id INTO v_second;

  DELETE FROM public.growth_merchant_leads WHERE id IN (v_first, v_second);
  RAISE NOTICE 'Scenario C passed: unit uniqueness is scoped to live leads';
END $$;

-- Scenario D: is_test defaults to FALSE, so an unmarked row counts as real.
DO $$
DECLARE
  v_id UUID;
  v_is_test BOOLEAN;
BEGIN
  INSERT INTO public.growth_merchant_leads (floor, unit)
    VALUES ('2F', '__t03') RETURNING id INTO v_id;
  SELECT is_test INTO v_is_test FROM public.growth_merchant_leads WHERE id = v_id;
  ASSERT v_is_test = FALSE, 'D: is_test must default FALSE, never NULL';
  DELETE FROM public.growth_merchant_leads WHERE id = v_id;
  RAISE NOTICE 'Scenario D passed: is_test is NOT NULL DEFAULT FALSE';
END $$;

-- Scenario E: campaign slugs are constrained, not trusted.
DO $$
DECLARE
  v_id UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.growth_campaigns (name, slug, channel, destination)
      VALUES ('__t Bad Slug', 'Node0_Teaser', 'instagram', '/waitlist');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'E: a non-slug utm_campaign must be rejected';

  INSERT INTO public.growth_campaigns (name, slug, channel, destination)
    VALUES ('__t Node 0 teaser', '__t-node0-teaser', 'instagram', '/waitlist')
    RETURNING id INTO v_id;

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.growth_campaigns (name, slug, channel, destination)
      VALUES ('__t Duplicate', '__t-node0-teaser', 'tiktok', '/waitlist');
  EXCEPTION WHEN unique_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'E: a duplicate utm_campaign slug must be rejected';

  -- Negative spend is not a thing; NULL spend is (an owned channel has no cost).
  v_raised := FALSE;
  BEGIN
    UPDATE public.growth_campaigns SET spend_kes = -1 WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'E: negative spend must be rejected';

  DELETE FROM public.growth_campaigns WHERE id = v_id;
  RAISE NOTICE 'Scenario E passed: campaign slug and spend constraints hold';
END $$;

-- Scenario F: the audit trail accepts the two new growth targets.
DO $$
DECLARE
  v_admin UUID;
  v_lead UUID;
  v_log UUID;
BEGIN
  INSERT INTO public.users (role, auth_uid) VALUES ('admin', gen_random_uuid())
    RETURNING id INTO v_admin;
  INSERT INTO public.growth_merchant_leads (floor, unit)
    VALUES ('GF', '__t04') RETURNING id INTO v_lead;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.admin_ops_log (admin_user_id, action, target_type, target_id, details)
    VALUES (v_admin, 'growth.lead.stage', 'growth_lead', v_lead, '{"to":"contacted"}'::jsonb)
    RETURNING id INTO v_log;
  ASSERT v_log IS NOT NULL, 'F: admin_ops_log must accept a growth_lead target';

  DELETE FROM public.admin_ops_log WHERE id = v_log;
  DELETE FROM public.growth_merchant_leads WHERE id = v_lead;
  DELETE FROM public.users WHERE id = v_admin;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'Scenario F passed: growth targets are auditable';
END $$;
