-- ============================================================
-- MAANTA: elite_trial_grace_period migration
-- Confirmed by Mohamed Elmi, 2026-07-01
--
-- When a 30-day Elite trial ends:
--   1. grace_period_ends_at = trial_ends_at + 7 days
--   2. Agent task auto-created (agent has 7 days to convert)
--   3. If no paid subscription after grace: auto-downgrade to Standard
--
-- Applies ONLY during the Node 0 launch period (3 months post-launch).
-- launch_period_ends_at is a configurable sentinel stored in app_config.
-- Post-launch-period behaviour is NOT implemented here — separate decision.
-- ============================================================

-- 1. grace_period_ends_at on merchants
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

-- 2. app_config table — singleton config rows, not user data
--    Used for the launch_period_ends_at sentinel and future config values.
--    Not user-facing; admin-managed only.
CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_config_admin ON public.app_config
  FOR ALL USING (public.current_user_role() = 'admin');

-- Seed: Node 0 launch period ends 3 months after target launch (2026-09-15).
-- Admin can update this via the admin dashboard when the date is confirmed.
INSERT INTO public.app_config (key, value, notes)
VALUES (
  'node0_launch_period_ends_at',
  '2026-12-15T00:00:00Z',
  'Node 0 (BBS Mall) launch period end. Trial grace+auto-downgrade applies only before this date. Update when launch date is confirmed.'
)
ON CONFLICT (key) DO NOTHING;

-- 3. handle_trial_expiry function
--    Called by pg_cron nightly. For each merchant where:
--      - elite_trial_active = true
--      - trial_ends_at has passed
--      - grace_period_ends_at is NULL (grace not yet started)
--      - We are within the Node 0 launch period
--    → Set grace_period_ends_at = trial_ends_at + 7 days
--    → Create an agent task for conversion
--
--    For each merchant where:
--      - grace_period_ends_at has passed
--      - tier is still 'elite' (no paid subscription confirmed)
--      - elite_trial_active = true (still on trial, not converted)
--    → Auto-downgrade: tier = 'standard', elite_trial_active = false
--    → Write tier_flags row (subscription_lapsed)
--    → WhatsApp notice is handled by the calling Edge Function, not here

CREATE OR REPLACE FUNCTION public.handle_trial_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_launch_period_end  TIMESTAMPTZ;
  v_merchant           RECORD;
  v_grace_ends         TIMESTAMPTZ;
BEGIN
  -- Read the Node 0 launch period sentinel
  SELECT value::TIMESTAMPTZ INTO v_launch_period_end
    FROM public.app_config
    WHERE key = 'node0_launch_period_ends_at';

  -- Only apply grace+downgrade logic during launch period
  IF NOW() > v_launch_period_end THEN
    RETURN;
  END IF;

  -- Step 1: trial just expired → start grace period + create agent task
  FOR v_merchant IN
    SELECT id, trial_ends_at, onboarded_by
    FROM public.merchants
    WHERE elite_trial_active = TRUE
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < NOW()
      AND grace_period_ends_at IS NULL  -- grace not yet started
  LOOP
    v_grace_ends := v_merchant.trial_ends_at + INTERVAL '7 days';

    UPDATE public.merchants
      SET grace_period_ends_at = v_grace_ends,
          updated_at = NOW()
      WHERE id = v_merchant.id;

    -- Auto-create conversion task for the onboarding agent
    INSERT INTO public.agent_tasks (
      merchant_id, assigned_to, task_type, priority, description, due_at
    )
    VALUES (
      v_merchant.id,
      v_merchant.onboarded_by,  -- NULL is fine — unassigned tasks are visible to all agents
      'onboarding_followup',
      'high',
      'Elite trial has expired. 7-day grace period active. Convert to paid Elite (KES 3,500/month) before grace ends to prevent auto-downgrade.',
      v_grace_ends
    );
  END LOOP;

  -- Step 2: grace period expired, no subscription confirmed → auto-downgrade
  FOR v_merchant IN
    SELECT id
    FROM public.merchants
    WHERE elite_trial_active = TRUE
      AND grace_period_ends_at IS NOT NULL
      AND grace_period_ends_at < NOW()
      AND tier = 'elite'  -- still on Elite (no paid sub confirmed)
  LOOP
    UPDATE public.merchants
      SET tier               = 'standard',
          elite_trial_active = FALSE,
          updated_at         = NOW()
      WHERE id = v_merchant.id;

    INSERT INTO public.tier_flags (merchant_id, flag_type, notes)
    VALUES (
      v_merchant.id,
      'subscription_lapsed',
      'Elite trial grace period expired with no paid subscription confirmed. Auto-downgraded to Standard. WhatsApp notice should be dispatched by the calling job.'
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_trial_expiry() FROM PUBLIC;
-- Callable by Edge Function (service role) or pg_cron (superuser) only.
-- No authenticated grant — this is an internal scheduled/admin function.

-- 4. Index to make the nightly cron scan fast
CREATE INDEX IF NOT EXISTS idx_merchants_trial_grace
  ON public.merchants (elite_trial_active, trial_ends_at, grace_period_ends_at)
  WHERE elite_trial_active = TRUE;

-- ============================================================
-- pg_cron registration (run once — idempotent via ON CONFLICT)
-- Requires pg_cron extension enabled in Supabase dashboard.
-- Fires daily at 02:00 UTC (before East Africa business hours).
-- ============================================================
-- NOTE: pg_cron must be enabled in the Supabase dashboard under
-- Database > Extensions before this INSERT will work.
-- If pg_cron is not yet enabled, this will silently skip due to
-- the DO block's exception handler and must be re-run after enabling.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    INSERT INTO cron.job (schedule, command, jobname)
    VALUES (
      '0 2 * * *',
      'SELECT public.handle_trial_expiry();',
      'maanta_handle_trial_expiry'
    )
    ON CONFLICT (jobname) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not enabled yet — job must be registered manually after enabling
  NULL;
END $$;
