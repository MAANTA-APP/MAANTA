-- ============================================================================
-- Demo activity seed — redemption traces for demo merchants
--
-- The existing seeds (node0_rehearsal, node0_100_deals, nairobi_nodes_150)
-- create synthetic merchants and deals. They do not create *history*, so
-- verified-redemption counts read zero everywhere and the marketplace looks
-- freshly installed rather than in use.
--
-- This seed backfills a plausible trailing week of completed redemptions
-- across demo merchants so those surfaces are populated.
--
-- Scope and safety
-- ----------------
--   · Only demo merchants and demo deals are touched. The INSERT selects from
--     `WHERE m.is_demo`, so a real merchant cannot be picked up even if this is
--     run by accident against a project with live data.
--   · Rows are written with is_demo = TRUE and demo_source = 'demo_activity'.
--   · Redemptions are inserted DIRECTLY, not via the redemption RPCs. Those
--     RPCs debit the merchant wallet, record arrears, and fire Guardian
--     evaluation — none of which should happen for synthetic history. No
--     wallet is touched and no fee is really charged.
--   · NOT fully inert, though: redemptions carries update_kpi_counters_trigger,
--     so these rows roll up into kpi_counters (and trust_metric) for the demo
--     merchants they belong to. That is scoped per merchant and kpi_counters
--     CASCADEs from merchants, so the wipe clears it — but admin KPI surfaces
--     will include this synthetic activity while demo mode is on.
--   · Idempotent: re-running replaces the previous demo_activity batch rather
--     than stacking a second week of history on top.
--
-- Apply:  make demo-seed        (or psql -f this file)
-- Remove: SELECT public.wipe_demo_data(TRUE);
-- ============================================================================

BEGIN;

-- Idempotence: clear the previous activity batch first. Scoped to this seed's
-- own demo_source so it never touches rehearsal or reseed rows.
DELETE FROM public.redemptions WHERE is_demo AND demo_source = 'demo_activity';

-- One trailing week of successful redemptions, weighted so recent days are
-- busier — a flat distribution reads as generated, an increasing one reads
-- like a mall that is picking up.
INSERT INTO public.redemptions (
  deal_id, merchant_id, user_id, otp_code,
  success_fee_charged, status, redeemed_at, expires_at,
  is_demo, demo_source
)
SELECT
  d.id,
  d.merchant_id,
  u.id,
  -- Six digits, zero-padded. Cannot collide with a live claim: these rows are
  -- already terminal ('success'), so no verify path can match them.
  lpad(((random() * 899999)::INT + 100000)::TEXT, 6, '0'),
  COALESCE((SELECT value::NUMERIC FROM public.app_config WHERE key = 'success_fee_kes'), 30.00),
  -- 'success' is the terminal-success status in the CHECK constraint
  -- (pending|success|failed|flagged) and the value verified_counts_by_merchant
  -- counts. 'verified' is the word the product uses at the counter, not a
  -- status value — using it here would fail the constraint.
  'success',
  ts.redeemed_at,
  -- expires_at is NOT NULL: the OTP window that was open when it was redeemed.
  ts.redeemed_at + INTERVAL '10 minutes',
  TRUE,
  'demo_activity'
FROM (
  -- Up to 3 redemptions per demo deal, on ~60% of deals, so verified counts
  -- vary between shops instead of every merchant showing the same number.
  SELECT d.id, d.merchant_id, generate_series(1, (1 + floor(random() * 3))::INT) AS n
    FROM public.deals d
    JOIN public.merchants m ON m.id = d.merchant_id
   WHERE d.is_demo
     AND m.is_demo
     AND m.status = 'active'
     AND random() < 0.6
) d
CROSS JOIN LATERAL (
  SELECT id FROM public.users
   WHERE is_demo AND role = 'customer'
   ORDER BY random()
   LIMIT 1
) u
-- squared random → recency bias, so the week reads as a mall picking up
-- rather than a flat generated distribution.
CROSS JOIN LATERAL (
  SELECT NOW() - (random() * random() * INTERVAL '7 days') AS redeemed_at
) ts;

DO $$
DECLARE v_n INT; v_m INT;
BEGIN
  SELECT count(*), count(DISTINCT merchant_id) INTO v_n, v_m
    FROM public.redemptions WHERE is_demo AND demo_source = 'demo_activity';
  RAISE NOTICE 'demo activity seed: % successful redemptions across % merchants', v_n, v_m;

  -- Fail loudly rather than leaving a half-populated demo: no shopper users
  -- means the CROSS JOIN LATERAL produced nothing and the seed silently no-oped.
  IF v_n = 0 THEN
    RAISE EXCEPTION 'demo activity seed produced no rows — are there demo merchants, demo deals, and demo users with role=customer?';
  END IF;
END $$;

COMMIT;
