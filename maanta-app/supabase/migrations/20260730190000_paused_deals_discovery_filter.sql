-- Pause semantics (founder rule 2026-07-30):
--   * claim_deal already raises deal_paused for new claims
--     (20260730180000_restore_claim_deal_pause_gate.sql — still pending human
--     `db push` on production; see drift D25).
--   * Already-claimed tickets stay valid until redemption.expires_at;
--     verify_redemption must NOT consult deals.is_paused.
--   * Discovery must not advertise paused deals. App rails (getLiveDeals)
--     already filter is_paused=false; this migration mirrors that on the
--     SQL browse view so anon/deep clients cannot see paused rows either.
--
-- Baseline before this change (documented for ops):
--   deals_public_browse filtered is_active + expires_at + merchant visibility
--   but NOT is_paused — a paused deal could still appear via the view even
--   though claim_deal would reject and the Next.js feed hid it.
--
-- Version: after 180000 pause-gate restore. Do not reuse 160000/170000
-- (ledger / opening-credit reservations — docs/ops/supabase-migrations.md).
--
-- DROP + CREATE (not CREATE OR REPLACE): inserting is_paused into the SELECT
-- list would rename later columns under OR REPLACE and fail with 42P16.

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
  'Public discovery deals: active, unpaused, unexpired, merchant publicly visible. Pause hides from discovery only — claimed tickets remain redeemable via verify_redemption until ticket expiry.';

GRANT SELECT ON public.deals_public_browse TO anon, authenticated;

-- Ops verification of the claim gate (independent of this view):
--   SELECT pg_get_functiondef('public.claim_deal(uuid,uuid,text,extensions.geography)'::regprocedure);
-- Must contain RAISE EXCEPTION 'deal_paused'.
