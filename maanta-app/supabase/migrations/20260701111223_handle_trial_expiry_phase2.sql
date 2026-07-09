-- ============================================================
-- MAANTA: handle_trial_expiry_phase2 migration
-- Confirmed by Mohamed Elmi, 2026-07-01
--
-- Replaces handle_trial_expiry() with the full two-phase logic:
--
-- PHASE 1 — Node 0 launch period (NOW() <= node0_launch_period_ends_at):
--   Trial ends → grace_period_ends_at = trial_ends_at + 7 days
--               → agent conversion task created (due at grace end)
--   Grace ends → auto-downgrade + tier_flags row + WhatsApp notice (via Edge Function)
--
-- PHASE 2 — Post-launch-period, all nodes (NOW() > node0_launch_period_ends_at):
--   Trial ends → immediate auto-downgrade + tier_flags row + WhatsApp notice
--   No grace period. No agent task. Standard procedure.
--
-- The sentinel node0_launch_period_ends_at in app_config governs the switchover.
-- Admin can update this value when the launch date is confirmed.
-- ============================================================

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
-- Callable by Edge Function (service role) or pg_cron (superuser) only.

-- Register pg_cron job if extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    INSERT INTO cron.job (schedule, command, jobname)
    VALUES (
      '0 2 * * *',
      'SELECT public.handle_trial_expiry();',
      'maanta_handle_trial_expiry'
    )
    ON CONFLICT (jobname) DO UPDATE SET
      schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
