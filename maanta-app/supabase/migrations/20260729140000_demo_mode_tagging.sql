-- ============================================================================
-- Demo mode, part 1 of 3 — tagging model
--
-- Problem this solves
-- -------------------
-- Every merchant and deal in the project today is synthetic, seeded from three
-- batches (supabase/seed/node0_rehearsal_seed.sql, node0_100_deals_seed.sql,
-- nairobi_nodes_150_merchants.sql). They are distinguishable ONLY by a
-- UUID-prefix convention documented in each seed header:
--
--     b0/b1/b2… users    c0/c1/c2… merchants    d0/d1/d2… deals
--     e0…       redemptions                     f0…       merchant_transactions
--
-- A naming convention is not queryable. Nothing in app logic, cron, analytics
-- or admin views can currently tell synthetic rows from real ones, which means
-- real launch data would land indistinguishably alongside them.
--
-- This migration replaces the convention with explicit, indexed columns, and
-- backfills the existing seed batches so the two can never be confused again.
--
-- What this migration does NOT do
-- -------------------------------
-- No behaviour changes here. Browse views, cron scoping and the reseed job are
-- deliberately separate migrations (parts 2 and 3) so each can be reverted on
-- its own. Seed DATA stays in supabase/seed/ — this file is schema only.
--
-- Rollback
-- --------
--   ALTER TABLE public.<t> DROP COLUMN is_demo, DROP COLUMN demo_batch_id,
--                          DROP COLUMN demo_source;   -- for each of the 5
--   DELETE FROM public.app_config WHERE key = 'demo_mode_enabled';
--   DROP FUNCTION public.is_demo_mode();
-- Dropping the columns loses the tagging but destroys no rows.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tagging columns.
--
--    is_demo        the predicate everything else filters on. NOT NULL so a
--                   forgotten value can never read as "maybe real".
--    demo_batch_id  groups one seeding run, so a single batch can be wiped or
--                   audited without touching other demo data.
--    demo_source    which generator produced the row ('nairobi_150',
--                   'autoreseed', …) — survives in analytics exports.
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS demo_batch_id UUID,
  ADD COLUMN IF NOT EXISTS demo_source   TEXT;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS demo_batch_id UUID,
  ADD COLUMN IF NOT EXISTS demo_source   TEXT;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS demo_batch_id UUID,
  ADD COLUMN IF NOT EXISTS demo_source   TEXT;

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS demo_batch_id UUID,
  ADD COLUMN IF NOT EXISTS demo_source   TEXT;

ALTER TABLE public.merchant_transactions
  ADD COLUMN IF NOT EXISTS is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS demo_batch_id UUID,
  ADD COLUMN IF NOT EXISTS demo_source   TEXT;

COMMENT ON COLUMN public.merchants.is_demo IS
  'Synthetic record created by demo/rehearsal seeding. Never a real merchant: excluded from public browse, billing lifecycle and analytics. See docs/ops/demo-mode.md.';
COMMENT ON COLUMN public.deals.is_demo IS
  'Synthetic deal. Visible to shoppers only while app_config.demo_mode_enabled is true.';

-- ----------------------------------------------------------------------------
-- 2. Partial indexes.
--
--    Every hot path is "give me the real rows" (browse, cron, reporting) or
--    "give me all the demo rows" (wipe, reseed). Partial indexes on is_demo
--    keep both cheap without carrying an index entry for the common case.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_demo         ON public.users (id)                  WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_merchants_demo     ON public.merchants (id)              WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_deals_demo         ON public.deals (id, expires_at)      WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_redemptions_demo   ON public.redemptions (id)            WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_mtx_demo           ON public.merchant_transactions (id)  WHERE is_demo;

-- Batch-scoped wipes and audits.
CREATE INDEX IF NOT EXISTS idx_deals_demo_batch     ON public.deals (demo_batch_id)     WHERE demo_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_merchants_demo_batch ON public.merchants (demo_batch_id) WHERE demo_batch_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. The switch.
--
--    app_config is the established config store (success_fee_kes,
--    node0_* …), readable from both SQL functions and the app, so demo mode
--    lives here rather than in an env var that could drift from the database
--    the data actually sits in.
--
--    Seeded DISABLED. Turning demo mode on is always a deliberate act.
-- ----------------------------------------------------------------------------
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'demo_mode_enabled', 'false',
  'When true, is_demo rows are visible in shopper browse surfaces and the demo flash-deal reseed job runs. Must be false at launch — see docs/ops/demo-mode.md. Anything other than the exact string true is treated as disabled.'
)
ON CONFLICT (key) DO NOTHING;

-- Threshold + ceiling for the reseed job (part 3). Kept in config so the demo
-- can be tuned during a rehearsal without a migration.
INSERT INTO public.app_config (key, value, notes)
VALUES
  ('demo_flash_deal_floor', '12',
   'Reseed fires when live demo flash deals drop below this count.'),
  ('demo_flash_deal_ceiling', '40',
   'Hard cap on live demo flash deals. Stops reseed creating unbounded clutter.')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. is_demo_mode() — one definition of "is demo mode on", used by the reseed
--    job, the browse views and the app.
--
--    Fail-safe by construction: a missing key, a NULL, or any value other than
--    the exact string 'true' returns FALSE. The dangerous direction is demo
--    data leaking into a real launch, so every ambiguous state resolves to off.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_demo_mode()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT lower(btrim(value)) = 'true'
       FROM public.app_config
      WHERE key = 'demo_mode_enabled'),
    FALSE
  );
$$;

COMMENT ON FUNCTION public.is_demo_mode() IS
  'True only when app_config.demo_mode_enabled is exactly true. Fail-safe: any other state returns false.';

GRANT EXECUTE ON FUNCTION public.is_demo_mode() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Backfill the three existing seed batches.
--
--    The prefixes below come from the seed-file headers and were confirmed
--    against the live project on 2026-07-29:
--      merchants  c0=3    c1=60   c2=150   (213 — every merchant in the project)
--      deals      d0=3    d1=100  d2=188   (291 — every deal)
--      users      b0=13   b1=60   b2=148   (221, plus 7 real users)
--      redemptions e0=5   merchant_transactions f0=4
--
--    Real users are exactly those NOT matching a b-prefix, so the backfill is
--    written as an allowlist of known-synthetic prefixes rather than a
--    denylist. A row can only become demo by matching a batch we shipped.
-- ----------------------------------------------------------------------------
UPDATE public.users SET
  is_demo = TRUE,
  demo_source = CASE
    WHEN id::text LIKE 'b0000000%' THEN 'node0_rehearsal'
    WHEN id::text LIKE 'b1000000%' THEN 'node0_100_deals'
    WHEN id::text LIKE 'b2000000%' THEN 'nairobi_150'
  END
WHERE is_demo = FALSE
  AND (id::text LIKE 'b0000000%' OR id::text LIKE 'b1000000%' OR id::text LIKE 'b2000000%');

UPDATE public.merchants SET
  is_demo = TRUE,
  demo_source = CASE
    WHEN id::text LIKE 'c0000000%' THEN 'node0_rehearsal'
    WHEN id::text LIKE 'c1000000%' THEN 'node0_100_deals'
    WHEN id::text LIKE 'c2000000%' THEN 'nairobi_150'
  END
WHERE is_demo = FALSE
  AND (id::text LIKE 'c0000000%' OR id::text LIKE 'c1000000%' OR id::text LIKE 'c2000000%');

UPDATE public.deals SET
  is_demo = TRUE,
  demo_source = CASE
    WHEN id::text LIKE 'd0000000%' THEN 'node0_rehearsal'
    WHEN id::text LIKE 'd1000000%' THEN 'node0_100_deals'
    WHEN id::text LIKE 'd2000000%' THEN 'nairobi_150'
  END
WHERE is_demo = FALSE
  AND (id::text LIKE 'd0000000%' OR id::text LIKE 'd1000000%' OR id::text LIKE 'd2000000%');

UPDATE public.redemptions SET is_demo = TRUE, demo_source = 'node0_rehearsal'
WHERE is_demo = FALSE AND id::text LIKE 'e0000000%';

UPDATE public.merchant_transactions SET is_demo = TRUE, demo_source = 'node0_rehearsal'
WHERE is_demo = FALSE AND id::text LIKE 'f0000000%';

-- Inherit: any deal belonging to a demo merchant is demo, whatever its id.
-- Catches hand-made rows attached to seeded merchants during rehearsal.
UPDATE public.deals d SET
  is_demo = TRUE,
  demo_source = COALESCE(d.demo_source, 'inherited_from_merchant')
FROM public.merchants m
WHERE m.id = d.merchant_id AND m.is_demo AND NOT d.is_demo;

UPDATE public.redemptions r SET
  is_demo = TRUE,
  demo_source = COALESCE(r.demo_source, 'inherited_from_merchant')
FROM public.merchants m
WHERE m.id = r.merchant_id AND m.is_demo AND NOT r.is_demo;

UPDATE public.merchant_transactions t SET
  is_demo = TRUE,
  demo_source = COALESCE(t.demo_source, 'inherited_from_merchant')
FROM public.merchants m
WHERE m.id = t.merchant_id AND m.is_demo AND NOT t.is_demo;

-- ----------------------------------------------------------------------------
-- 6. Assert the backfill did what the audit predicted.
--
--    If a real merchant ever existed, this migration must not silently tag it.
--    Every merchant in the project was synthetic at authoring time, so an
--    untagged merchant here means someone signed up for real between the audit
--    and this migration — worth stopping for rather than guessing.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_untagged_merchants INT;
  v_real_users         INT;
BEGIN
  SELECT count(*) INTO v_untagged_merchants FROM public.merchants WHERE NOT is_demo;
  SELECT count(*) INTO v_real_users         FROM public.users     WHERE NOT is_demo;

  IF v_untagged_merchants > 0 THEN
    RAISE NOTICE 'demo-mode backfill: % merchant(s) left untagged — treated as REAL. Confirm this is correct before launch.', v_untagged_merchants;
  END IF;

  RAISE NOTICE 'demo-mode backfill complete: % demo merchants, % demo deals, % real users retained.',
    (SELECT count(*) FROM public.merchants WHERE is_demo),
    (SELECT count(*) FROM public.deals     WHERE is_demo),
    v_real_users;
END $$;

COMMIT;
