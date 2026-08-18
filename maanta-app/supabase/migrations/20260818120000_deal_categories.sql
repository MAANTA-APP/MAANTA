-- Shopper-facing deal categories (founder ruling 2026-08-18).
--
-- Three buckets, locked: fashion (Fashion & fabric), beauty (Beauty & perfume),
-- food (Food). The column stores the KEY, never the label — relabelling a chip
-- must not require rewriting rows. The app mirror is
-- `maanta-app/src/lib/deal-categories.ts`; the CHECK below and that array are
-- the two places a fourth bucket has to be added, and a test pins them together.
--
-- The category is attached to the DEAL, not the merchant: a fabric shop that
-- also sells snacks files each deal where a shopper would look for it, and a
-- merchant changing what they sell does not silently re-file their history.
--
-- NULLable on purpose. Every deal that exists today predates the column, and
-- back-filling them into a bucket by guessing from the title would put real
-- deals in the wrong place and make the filter lie to shoppers. Uncategorised
-- deals stay visible under "All" and appear under no category chip. The app
-- requires a category on new deals, so the uncategorised set only shrinks.
-- NOT NULL is a later migration, once the tail is zero — not this one.
--
-- Version: after 20260816020000 (admin-assisted onboarding attribution).
-- See docs/ops/supabase-migrations.md before choosing a version number.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Named constraint: an anonymous CHECK gets a generated name that differs
-- between a fresh `db reset` and production, which makes the later widening
-- migration unable to name what it is dropping.
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_category_check;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_category_check
  CHECK (category IS NULL OR category IN ('fashion', 'beauty', 'food'));

COMMENT ON COLUMN public.deals.category IS
  'Shopper-facing category key: fashion | beauty | food. NULL = uncategorised (pre-2026-08-18 deals); shows under All only. Labels live in src/lib/deal-categories.ts — this column stores keys, never labels.';

-- Partial index matching the shopper read: live, unpaused, unexpired deals for
-- one node, narrowed to a category. Partial because uncategorised and inactive
-- rows are never the target of this predicate, and the pilot's live set is a
-- small slice of the table.
CREATE INDEX IF NOT EXISTS idx_deals_node_category_live
  ON public.deals (node, category, expires_at DESC)
  WHERE is_active = TRUE AND is_paused IS NOT TRUE AND category IS NOT NULL;

-- ------------------------------------------------------------------
-- deals_public_browse must carry the column too.
--
-- The Next.js shopper surfaces read the base table through the service client,
-- so they would see `category` without this. The view is the anon/deep-client
-- surface, and a discovery view that cannot express the filter the product
-- offers is exactly the kind of gap that only shows up from outside the app.
--
-- DROP + CREATE, not CREATE OR REPLACE: inserting a column into the middle of
-- the SELECT list renames every later column under OR REPLACE and fails 42P16.
-- Body copied verbatim from 20260730190000_paused_deals_discovery_filter.sql
-- with `d.category` added — the pause predicate is load-bearing and must not be
-- lost in the recreate (drift D25/D32).
-- ------------------------------------------------------------------

DROP VIEW IF EXISTS public.deals_public_browse;

CREATE VIEW public.deals_public_browse
WITH (security_invoker = false) AS
  SELECT
    d.id,
    d.merchant_id,
    d.node,
    d.title,
    d.description,
    d.image_url,
    d.deal_type,
    d.category,
    d.flash_duration_hours,
    d.is_active,
    d.is_paused,
    d.max_claims,
    d.claims_count,
    d.boost_active,
    d.price_kes,
    d.compare_at_kes,
    d.charges,
    d.starts_at,
    d.expires_at,
    d.created_at
  FROM public.deals d
  INNER JOIN public.merchants m ON m.id = d.merchant_id
  WHERE d.is_active = TRUE
    AND d.is_paused IS NOT TRUE
    AND d.expires_at > NOW()
    AND m.status = 'active'
    AND m.is_visible = TRUE
    AND m.is_shadow_banned = FALSE
    AND (NOT d.is_demo OR public.is_demo_mode())
    AND (NOT m.is_demo OR public.is_demo_mode());

COMMENT ON VIEW public.deals_public_browse IS
  'Public discovery deals: active, unpaused, unexpired, merchant publicly visible. Pause hides from discovery only — claimed tickets remain redeemable via verify_redemption until ticket expiry. Carries category (fashion | beauty | food | NULL).';

GRANT SELECT ON public.deals_public_browse TO anon, authenticated;
