-- Architecture now-fixes (2026-07-26):
--   1) Accurate verified redemption counts (avoid PostgREST 1000-row silent truncation)
--   2) Admin report aggregates in SQL (same truncation class of bug)
--   3) Hot-path indexes for merchant status counts + live deal listing
--   4) Browse views project only publicly-visible merchants / live deals
--
-- No money-path behavior change. Read-model + visibility + reporting only.

-- ---------------------------------------------------------------------------
-- 1) verified_counts_by_merchant — GROUP BY in Postgres
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verified_counts_by_merchant(p_merchant_ids uuid[])
RETURNS TABLE (merchant_id uuid, verified_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT r.merchant_id, COUNT(*)::bigint AS verified_count
  FROM public.redemptions r
  WHERE r.status = 'success'
    AND r.merchant_id = ANY (p_merchant_ids)
  GROUP BY r.merchant_id;
$$;

COMMENT ON FUNCTION public.verified_counts_by_merchant(uuid[]) IS
  'All-time successful redemption counts per merchant. Used by shopper feed ranking and verified badges — must not rely on PostgREST row caps.';

REVOKE ALL ON FUNCTION public.verified_counts_by_merchant(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verified_counts_by_merchant(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.verified_counts_by_merchant(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verified_counts_by_merchant(uuid[]) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 2) Admin platform report aggregates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_success_fee_revenue(p_since timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(SUM(ABS(amount)), 0)::numeric
  FROM public.merchant_transactions
  WHERE transaction_type = 'success_fee'
    AND created_at >= p_since;
$$;

CREATE OR REPLACE FUNCTION public.admin_redemptions_per_day(p_days integer)
RETURNS TABLE (day date, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (r.redeemed_at AT TIME ZONE 'UTC')::date AS day,
         COUNT(*)::bigint AS cnt
  FROM public.redemptions r
  WHERE r.status = 'success'
    AND r.redeemed_at >= (NOW() - make_interval(days => GREATEST(COALESCE(p_days, 14), 1)))
  GROUP BY 1
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.admin_success_fee_revenue(timestamptz) IS
  'Sum of success_fee ledger amounts since p_since (admin reports).';
COMMENT ON FUNCTION public.admin_redemptions_per_day(integer) IS
  'Daily successful redemption counts for the last p_days (admin chart).';

REVOKE ALL ON FUNCTION public.admin_success_fee_revenue(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_success_fee_revenue(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_success_fee_revenue(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_success_fee_revenue(timestamptz) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.admin_redemptions_per_day(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_redemptions_per_day(integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_redemptions_per_day(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_redemptions_per_day(integer) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 3) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_redemptions_merchant_status
  ON public.redemptions (merchant_id, status);

CREATE INDEX IF NOT EXISTS idx_deals_node_live_created
  ON public.deals (node, created_at DESC)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 4) Browse views — row-filtered to match withPublicMerchant* predicates
-- ---------------------------------------------------------------------------
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
    trust_metric,
    lat,
    lng
  FROM public.merchants
  WHERE status = 'active'
    AND is_visible = TRUE
    AND is_shadow_banned = FALSE;

CREATE OR REPLACE VIEW public.deals_public_browse
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
    AND d.expires_at > NOW()
    AND m.status = 'active'
    AND m.is_visible = TRUE
    AND m.is_shadow_banned = FALSE;

GRANT SELECT ON public.merchants_public_browse TO anon;
GRANT SELECT ON public.merchants_public_browse TO authenticated;
GRANT SELECT ON public.deals_public_browse TO anon;
GRANT SELECT ON public.deals_public_browse TO authenticated;
