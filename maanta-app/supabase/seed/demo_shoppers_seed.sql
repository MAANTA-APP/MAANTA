-- ============================================================================
-- Demo shoppers — widen the synthetic customer pool
--
-- Why this exists
-- ---------------
-- The shipped seeds create 213 demo merchants but only THREE demo users with
-- role = 'customer' (two @maanta.app role-test accounts and one founder alias).
-- `demo_activity_seed.sql` draws its shopper per redemption from that pool, so
-- ~354 redemptions divided across 3 people — about 118 each, roughly 17 a day.
--
-- That is not a seed bug. The LATERAL correlation fix (2026-07-29) works: the
-- shopper is now drawn per row. Three is simply the ceiling. But any surface
-- that groups by user — repeat rate, redemptions per shopper, a customer detail
-- view — reads as obviously fabricated, which defeats the point of a rehearsal
-- dataset and is exactly the detail a sharp observer notices first.
--
-- 120 shoppers puts the average near 3 redemptions each over a trailing week,
-- which is a plausible shape for a mall app.
--
-- Scope and safety
-- ----------------
--   · Every row is written with is_demo = TRUE and demo_source = 'demo_shoppers'
--     from the start — never backfilled, never inferred from a prefix.
--   · role = 'customer' only. No merchant, agent or admin rows, so this cannot
--     grant anyone access to anything.
--   · Emails use the RFC 2606 reserved `.test` TLD, which cannot resolve. A demo
--     row must never carry an address that could receive mail or be mistaken for
--     a real contact.
--   · Phones are a sequential +2547999xxxxx block. Kenya reserves no test range,
--     so these are theoretically assignable — acceptable because nothing in demo
--     mode dispatches SMS (demo redemptions are inserted directly, not via the
--     OTP path), but do not wire an SMS provider to demo data without revisiting
--     this.
--   · No auth_uid and no clerk_user_id: these are data-only rows and cannot be
--     signed into.
--   · Idempotent — ON CONFLICT DO NOTHING on the fixed id block.
--   · Removed by `SELECT public.wipe_demo_data(TRUE)` like any other demo row.
--
-- Names are ordinary Nairobi/Eastleigh given and family names combined by index.
-- They describe nobody: no address, no claim, no quote, and the whole set is
-- disclosed as demo data by the banner wherever it surfaces.
--
-- Apply:  psql "$DATABASE_URL" -f supabase/seed/demo_shoppers_seed.sql
-- Then:   re-run demo_activity_seed.sql so redemptions redistribute across the
--         wider pool. This seed alone changes no existing redemption.
-- ============================================================================

BEGIN;

INSERT INTO public.users (
  id, email, phone, full_name, role, preferred_language,
  is_demo, demo_batch_id, demo_source
)
SELECT
  ('b3000000-0000-4000-a000-' || lpad(g::TEXT, 12, '0'))::UUID,
  'demo.shopper' || g || '@example.test',
  '+2547999' || lpad(g::TEXT, 5, '0'),
  (ARRAY['Amina','Yusuf','Halima','Abdi','Fatuma','Ibrahim','Zainab','Omar',
         'Khadija','Hassan','Mariam','Ali','Asha','Mohamed','Sagal','Farah',
         'Hodan','Bashir','Ruqiya','Ismail','Nasra','Aden','Ayan','Jamal',
         'Deqa','Suleiman','Warda','Kamau','Wanjiku','Otieno'])[1 + (g % 30)]
  || ' ' ||
  (ARRAY['Abdullahi','Hussein','Noor','Diriye','Osman','Sheikh','Elmi','Warsame',
         'Gedi','Aden','Hersi','Jama','Muse','Rage','Shire','Yare',
         'Njoroge','Mwangi','Ochieng','Kiptoo'])[1 + (g % 20)],
  'customer',
  -- Roughly a third Swahili-preferring, which matches the Node 0 audience
  -- better than an all-English pool.
  CASE WHEN g % 3 = 0 THEN 'sw' ELSE 'en' END,
  TRUE,
  'b3000000-0000-4000-a000-000000000000'::UUID,
  'demo_shoppers'
FROM generate_series(1, 120) g
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.users WHERE is_demo AND role = 'customer';
  RAISE NOTICE 'demo shoppers: % demo customers now available to the activity seed', v_n;

  -- Fail loudly rather than leaving the pool too small to matter.
  IF v_n < 50 THEN
    RAISE EXCEPTION 'demo shopper pool is still only % — the insert did not take', v_n;
  END IF;
END $$;

COMMIT;
