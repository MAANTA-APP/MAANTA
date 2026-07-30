-- ============================================================================
-- Demo mode, part 2 of 3 — isolation
--
-- Part 1 tagged synthetic rows. This migration makes the rest of the system
-- act on that tag, in the two places where it matters most:
--
--   A. Public browse surfaces  — demo rows are hidden unless demo mode is on.
--   B. Trial lifecycle cron    — demo merchants are never managed as real ones.
--
-- (B) is a live defect, not a hypothetical. On 2026-07-29 the project held 213
-- merchants, ALL synthetic, and `maanta_handle_trial_expiry` was active with no
-- demo predicate — so grace periods, auto-downgrades, tier_flags rows and
-- agent_tasks were being generated against fake merchants. Those side effects
-- are indistinguishable from real ones in the admin queues.
--
-- Design note on the browse views
-- -------------------------------
-- The predicate is `(NOT is_demo OR public.is_demo_mode())`, which means:
--   demo mode OFF → real rows only, always.
--   demo mode ON  → real rows plus demo rows.
-- Real rows are never hidden by this change, in either state. The only thing
-- the flag controls is whether synthetic rows join them.
--
-- is_demo_mode() is STABLE, so it is evaluated once per query, not per row.
--
-- Rollback
-- --------
-- Re-run 20260726200000_architecture_now_fixes.sql (browse views) and
-- 20260701111223_handle_trial_expiry_phase2.sql (cron function). Both are
-- CREATE OR REPLACE and restore the pre-demo definitions exactly.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A1. merchants_public_browse
--
--     Projection copied verbatim from 20260726200000_architecture_now_fixes.sql
--     (which appended lat/lng). Only the demo predicate is new.
-- ----------------------------------------------------------------------------
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
    AND is_shadow_banned = FALSE
    AND (NOT is_demo OR public.is_demo_mode());

-- ----------------------------------------------------------------------------
-- A2. deals_public_browse
--
--     A deal is hidden if EITHER the deal or its merchant is synthetic — a real
--     deal can never hang off a demo merchant in launch mode.
-- ----------------------------------------------------------------------------
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
    AND m.is_shadow_banned = FALSE
    AND (NOT d.is_demo OR public.is_demo_mode())
    AND (NOT m.is_demo OR public.is_demo_mode());

GRANT SELECT ON public.merchants_public_browse TO anon, authenticated;
GRANT SELECT ON public.deals_public_browse     TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- B. handle_trial_expiry — skip demo merchants.
--
--    Reproduced verbatim from 20260701111223_handle_trial_expiry_phase2.sql.
--    The ONLY change is `AND NOT is_demo` on each of the two merchant loops,
--    marked inline. No change to grace length, downgrade conditions, task copy,
--    tier_flags wording, or the launch-period sentinel.
--
--    Unconditional by design: demo merchants must be skipped whether or not
--    demo mode is currently on, because a synthetic merchant is never a real
--    subscription to manage regardless of what the UI is showing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_trial_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_launch_period_end  TIMESTAMPTZ;
  v_in_launch_period   BOOLEAN;
  v_merchant           RECORD;
  v_grace_ends         TIMESTAMPTZ;
BEGIN
  -- Read the Node 0 launch period sentinel
  SELECT value::TIMESTAMPTZ INTO v_launch_period_end
    FROM public.app_config
    WHERE key = 'node0_launch_period_ends_at';

  v_in_launch_period := (NOW() <= v_launch_period_end);

  -- --------------------------------------------------------
  -- PHASE 1 ONLY: trial just expired → start grace + agent task
  -- --------------------------------------------------------
  IF v_in_launch_period THEN
    FOR v_merchant IN
      SELECT id, trial_ends_at, onboarded_by
      FROM public.merchants
      WHERE elite_trial_active = TRUE
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < NOW()
        AND grace_period_ends_at IS NULL  -- grace not yet started
        AND NOT is_demo                   -- demo mode: never manage synthetic merchants
    LOOP
      v_grace_ends := v_merchant.trial_ends_at + INTERVAL '7 days';

      UPDATE public.merchants
        SET grace_period_ends_at = v_grace_ends,
            updated_at = NOW()
        WHERE id = v_merchant.id;

      -- Conversion task for the merchant's onboarding agent
      -- (NULL assigned_to = visible to all walking agents if onboarded_by is NULL)
      INSERT INTO public.agent_tasks (
        merchant_id, assigned_to, task_type, priority, description, due_at
      )
      VALUES (
        v_merchant.id,
        v_merchant.onboarded_by,
        'onboarding_followup',
        'high',
        'Elite trial expired. 7-day grace period is active. Convert to paid Elite (KES 3,500/month) via STK push before grace ends — merchant auto-downgrades to Standard otherwise.',
        v_grace_ends
      );
    END LOOP;
  END IF;

  -- --------------------------------------------------------
  -- BOTH PHASES: auto-downgrade expired trials/grace periods
  --
  -- Phase 1: grace_period_ends_at < NOW() (grace window closed)
  -- Phase 2: trial_ends_at < NOW() AND grace_period_ends_at IS NULL
  --          (no grace was ever started — immediate downgrade)
  --
  -- Both cases: tier still 'elite', elite_trial_active still TRUE
  -- --------------------------------------------------------
  FOR v_merchant IN
    SELECT id
    FROM public.merchants
    WHERE elite_trial_active = TRUE
      AND tier = 'elite'
      AND NOT is_demo                     -- demo mode: never downgrade synthetic merchants
      AND (
        -- Phase 1: grace period has now expired
        (grace_period_ends_at IS NOT NULL AND grace_period_ends_at < NOW())
        OR
        -- Phase 2: trial expired, no grace was started (post-launch-period)
        (
          NOT v_in_launch_period
          AND trial_ends_at IS NOT NULL
          AND trial_ends_at < NOW()
          AND grace_period_ends_at IS NULL
        )
      )
  LOOP
    UPDATE public.merchants
      SET tier               = 'standard',
          elite_trial_active = FALSE,
          updated_at         = NOW()
      WHERE id = v_merchant.id;

    -- Tier flag for audit trail and admin visibility
    INSERT INTO public.tier_flags (merchant_id, flag_type, notes)
    VALUES (
      v_merchant.id,
      'subscription_lapsed',
      CASE
        WHEN v_in_launch_period
        THEN 'Elite trial grace period (7 days) expired with no paid subscription confirmed. Auto-downgraded to Standard. WhatsApp notice dispatched by Edge Function.'
        ELSE 'Elite trial expired with no paid subscription confirmed (post-launch-period standard procedure). Auto-downgraded to Standard. WhatsApp notice dispatched by Edge Function.'
      END
    );

    -- Note: WhatsApp notice is dispatched by the Edge Function that calls
    -- this function (or by the pg_cron wrapper), not within this transaction.
    -- This keeps the function pure DB logic with no external HTTP calls.
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_trial_expiry() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- C. Reporting isolation.
--
--    A convenience view so admin/reporting surfaces can state demo counts
--    explicitly rather than silently folding them into real totals. Reporting
--    that wants real-only numbers filters `WHERE NOT is_demo`; this view exists
--    so "how much of what I'm looking at is fake?" is one query, not a guess.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.demo_data_census AS
  SELECT 'merchants' AS table_name, count(*) FILTER (WHERE is_demo) AS demo_rows,
         count(*) FILTER (WHERE NOT is_demo) AS real_rows FROM public.merchants
  UNION ALL SELECT 'deals', count(*) FILTER (WHERE is_demo), count(*) FILTER (WHERE NOT is_demo) FROM public.deals
  UNION ALL SELECT 'users', count(*) FILTER (WHERE is_demo), count(*) FILTER (WHERE NOT is_demo) FROM public.users
  UNION ALL SELECT 'redemptions', count(*) FILTER (WHERE is_demo), count(*) FILTER (WHERE NOT is_demo) FROM public.redemptions
  UNION ALL SELECT 'merchant_transactions', count(*) FILTER (WHERE is_demo), count(*) FILTER (WHERE NOT is_demo) FROM public.merchant_transactions;

COMMENT ON VIEW public.demo_data_census IS
  'Demo vs real row counts per table. Used by the launch cleanup checklist — all demo_rows must read 0 before go-live.';

COMMIT;
