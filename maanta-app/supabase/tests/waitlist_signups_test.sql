-- ============================================================
-- Test: waitlist_signups (20260904130000_waitlist_supabase_mirror.sql)
--
-- Self-contained and self-cleaning. Run after full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/waitlist_signups_test.sql
-- ============================================================

-- Scenario A: grant posture — service_role writes, admins read, anon never.
DO $$
BEGIN
  ASSERT has_table_privilege('service_role', 'public.waitlist_signups', 'INSERT'),
    'A: service_role must INSERT waitlist_signups';
  ASSERT has_table_privilege('authenticated', 'public.waitlist_signups', 'SELECT'),
    'A: authenticated must retain SELECT (RLS-gated)';
  ASSERT NOT has_table_privilege('authenticated', 'public.waitlist_signups', 'INSERT'),
    'A: authenticated must not INSERT waitlist_signups';
  ASSERT NOT has_table_privilege('anon', 'public.waitlist_signups', 'SELECT'),
    'A: anon must never read the waitlist';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.waitlist_signups'::regclass),
    'A: RLS must be enabled';
  RAISE NOTICE 'Scenario A passed: waitlist_signups grants are service_role-write / admin-read';
END $$;

-- Scenario B: the address is stored lowercased, and that is an invariant.
--
-- Two rules in one, and the second is load-bearing: the signup path upserts with
-- ON CONFLICT (email), which Postgres matches only against a unique index on
-- exactly (email). A functional index on lower(email) would raise "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification" — and
-- because the mirror write is non-fatal by design, that would fail silently on
-- every signup. So identity is a PLAIN unique column plus a CHECK that keeps it
-- lowercase, and this test pins both.
DO $$
DECLARE
  v_id UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.waitlist_signups (email, segment, resend_status)
      VALUES ('__T.Case@Example.com', 'shopper', 'created');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'B: a non-lowercase address must be rejected, not silently folded';

  INSERT INTO public.waitlist_signups (email, segment, resend_status)
    VALUES ('__t.case@example.com', 'shopper', 'created') RETURNING id INTO v_id;

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.waitlist_signups (email, segment, resend_status)
      VALUES ('__t.case@example.com', 'merchant', 'created');
  EXCEPTION WHEN unique_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'B: the same address twice must collide';

  -- The ON CONFLICT the application actually issues must resolve.
  INSERT INTO public.waitlist_signups (email, segment, resend_status)
    VALUES ('__t.case@example.com', 'shopper', 'created')
    ON CONFLICT (email) DO NOTHING;

  DELETE FROM public.waitlist_signups WHERE id = v_id;
  RAISE NOTICE 'Scenario B passed: email is a lowercase unique column and ON CONFLICT (email) resolves';
END $$;

-- Scenario C: joined_at is nullable and is never defaulted.
-- Resend's create response carries no created_at, so at signup time the join
-- date is genuinely unknown. A DEFAULT NOW() here would move every historical
-- already_exists signup into today's chart.
DO $$
DECLARE
  v_id UUID;
  v_joined TIMESTAMPTZ;
BEGIN
  INSERT INTO public.waitlist_signups (email, segment, resend_status)
    VALUES ('__t_joined@example.com', 'shopper', 'pending') RETURNING id INTO v_id;
  SELECT joined_at INTO v_joined FROM public.waitlist_signups WHERE id = v_id;
  ASSERT v_joined IS NULL, 'C: joined_at must default to NULL, never to now()';

  ASSERT (SELECT is_nullable = 'YES' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='waitlist_signups' AND column_name='joined_at'),
    'C: joined_at must remain nullable';

  DELETE FROM public.waitlist_signups WHERE id = v_id;
  RAISE NOTICE 'Scenario C passed: an unread join date stays unknown';
END $$;

-- Scenario D: resend_status has no default — a row nobody decided about must
-- fail loudly rather than land looking settled.
DO $$
DECLARE
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.waitlist_signups (email, segment) VALUES ('__t_nostatus@example.com', 'shopper');
  EXCEPTION WHEN not_null_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'D: resend_status must be required, with no default';

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.waitlist_signups (email, segment, resend_status)
      VALUES ('__t_badstatus@example.com', 'shopper', 'probably');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'D: resend_status must come from the closed list';
  RAISE NOTICE 'Scenario D passed: resend_status is required and closed';
END $$;

-- Scenario E: the population flag defaults to REAL, and a label needs the flag.
DO $$
DECLARE
  v_id UUID;
  v_is_test BOOLEAN;
  v_raised BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.waitlist_signups (email, segment, resend_status)
    VALUES ('__t_pop@example.com', 'shopper', 'created') RETURNING id INTO v_id;
  SELECT is_test INTO v_is_test FROM public.waitlist_signups WHERE id = v_id;
  ASSERT v_is_test = FALSE, 'E: is_test must default FALSE, never NULL';

  BEGIN
    UPDATE public.waitlist_signups SET test_label = 'smoke' WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'E: a test label without the flag must be rejected';

  DELETE FROM public.waitlist_signups WHERE id = v_id;
  RAISE NOTICE 'Scenario E passed: unmarked rows count as real';
END $$;

-- Scenario F: "unreadable" belongs to backfilled rows only, and a form row must
-- know its own segment. The public form writes every property itself, so a
-- live-path row flagged unreadable is a bug inflating the data-quality tile.
DO $$
DECLARE
  v_id UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.waitlist_signups (email, segment, resend_status, signup_source, properties_unreadable)
      VALUES ('__t_unreadable@example.com', 'shopper', 'created', 'public_form', TRUE);
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'F: a public_form row must never be flagged unreadable';

  v_raised := FALSE;
  BEGIN
    INSERT INTO public.waitlist_signups (email, resend_status, signup_source)
      VALUES ('__t_nosegment@example.com', 'created', 'public_form');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'F: a public_form row must carry a segment';

  -- A backfilled contact whose segment Resend would not return is legitimate.
  INSERT INTO public.waitlist_signups (email, resend_status, signup_source, properties_unreadable)
    VALUES ('__t_backfill@example.com', 'created', 'backfill', TRUE) RETURNING id INTO v_id;
  DELETE FROM public.waitlist_signups WHERE id = v_id;
  RAISE NOTICE 'Scenario F passed: unknown-segment rows are backfill-only';
END $$;

-- Scenario G: one mirror row per Resend contact, but many rows may be unsynced.
DO $$
DECLARE
  v_a UUID;
  v_b UUID;
  v_raised BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.waitlist_signups (email, segment, resend_status, resend_contact_id)
    VALUES ('__t_c1@example.com', 'shopper', 'created', '__t-contact-1') RETURNING id INTO v_a;

  BEGIN
    INSERT INTO public.waitlist_signups (email, segment, resend_status, resend_contact_id)
      VALUES ('__t_c2@example.com', 'shopper', 'created', '__t-contact-1');
  EXCEPTION WHEN unique_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'G: two rows must not claim the same Resend contact';

  -- The index is partial, so any number of rows may have no contact id yet.
  INSERT INTO public.waitlist_signups (email, segment, resend_status)
    VALUES ('__t_c3@example.com', 'shopper', 'pending') RETURNING id INTO v_b;
  INSERT INTO public.waitlist_signups (email, segment, resend_status)
    VALUES ('__t_c4@example.com', 'shopper', 'pending');

  DELETE FROM public.waitlist_signups WHERE email LIKE '__t\_c%@example.com';
  RAISE NOTICE 'Scenario G passed: contact id is unique where present';
END $$;

-- Scenario H: phone shape is enforced, matching growth_merchant_leads.
DO $$
DECLARE
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.waitlist_signups (email, segment, resend_status, phone)
      VALUES ('__t_phone@example.com', 'shopper', 'created', '0712345678');
  EXCEPTION WHEN check_violation THEN v_raised := TRUE;
  END;
  ASSERT v_raised, 'H: a non-E.164 number must be rejected';
  RAISE NOTICE 'Scenario H passed: phone is stored E.164 or not at all';
END $$;
