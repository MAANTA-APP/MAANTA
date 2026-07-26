-- Merchant GPS for Browse map pins + Discover distance.
-- what3words_address remains the human-facing precision string; lat/lng are
-- derived server-side from the what3words API (or entered by admin) and never
-- required for legacy rows.

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_lat_lng_pair;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_lat_lng_pair
  CHECK (
    (lat IS NULL AND lng IS NULL)
    OR (lat IS NOT NULL AND lng IS NOT NULL)
  );

COMMENT ON COLUMN public.merchants.lat IS 'WGS84 latitude for map pins / distance; derived from what3words or admin entry.';
COMMENT ON COLUMN public.merchants.lng IS 'WGS84 longitude for map pins / distance; derived from what3words or admin entry.';

-- Recreate public browse view to expose coords (same security_invoker = false
-- pattern as 20260723130000).
CREATE OR REPLACE VIEW public.merchants_public_browse
WITH (security_invoker = false) AS
  SELECT
    id,
    merchant_name,
    tier,
    status,
    node,
    what3words_address,
    lat,
    lng,
    mall_name,
    floor,
    unit_number,
    is_visible,
    is_featured,
    trust_metric
  FROM public.merchants;

GRANT SELECT ON public.merchants_public_browse TO anon;
GRANT SELECT ON public.merchants_public_browse TO authenticated;
