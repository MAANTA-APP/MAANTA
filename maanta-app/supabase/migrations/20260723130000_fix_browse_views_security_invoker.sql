-- H-1: anon browse views must run with the view owner's privileges.
--
-- security_invoker = true makes the view execute as the caller (anon). Anon
-- SELECT on merchants/deals was revoked in 20260720120000, so PostgREST queries
-- against merchants_public_browse / deals_public_browse always failed with
-- insufficient_privilege even though anon holds SELECT on the views themselves.
--
-- security_invoker = false (PostgreSQL default) runs the underlying SELECT as
-- the view owner while still projecting only the safe column list.

CREATE OR REPLACE VIEW public.merchants_public_browse
WITH (security_invoker = false) AS
  SELECT
    id,
    merchant_name,
    tier,
    status,
    node,
    what3words_address,
    mall_name,
    floor,
    unit_number,
    is_visible,
    is_featured,
    trust_metric
  FROM public.merchants;

CREATE OR REPLACE VIEW public.deals_public_browse
WITH (security_invoker = false) AS
  SELECT
    id,
    merchant_id,
    node,
    title,
    description,
    image_url,
    deal_type,
    flash_duration_hours,
    is_active,
    max_claims,
    claims_count,
    boost_active,
    price_kes,
    compare_at_kes,
    charges,
    starts_at,
    expires_at,
    created_at
  FROM public.deals;
