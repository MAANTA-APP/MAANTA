-- ============================================================================
-- handle_trial_expiry(): stop a missing launch sentinel from silently disabling
-- half the trial lifecycle
--
-- The trap
-- --------
-- The function reads its phase from one governance key:
--
--   SELECT value::TIMESTAMPTZ INTO v_launch_period_end
--     FROM public.app_config WHERE key = 'node0_launch_period_ends_at';
--   v_in_launch_period := (NOW() <= v_launch_period_end);
--
-- If that key is ever deleted, renamed, or set to NULL, `SELECT ... INTO` leaves
-- the variable NULL and the comparison yields **NULL, not FALSE**. Three-valued
-- logic then quietly removes two of the three things this function does:
--
--   · `IF v_in_launch_period THEN` — NULL is not true, so PHASE 1 is skipped:
--     no grace period is opened when a trial ends, and no agent conversion task
--     is created.
--   · `NOT v_in_launch_period` — NOT NULL is NULL, so that OR arm never matches
--     and PHASE 2's immediate post-launch downgrade never fires.
--   · The `CASE WHEN v_in_launch_period` in the tier_flags note falls to ELSE,
--     so a Phase 1 grace expiry would be recorded with post-launch-period
--     wording — a wrong audit trail, not just a missing one.
--
-- What *does* keep working is the grace-expiry downgrade, because its arm
-- (`grace_period_ends_at IS NOT NULL AND grace_period_ends_at < NOW()`) never
-- references the sentinel. So the failure is partial, which is worse than total:
-- merchants already in grace still get downgraded on schedule, while merchants
-- whose trial expires from then on are frozen in Elite indefinitely, with no
-- grace row, no agent task, and no error anywhere. A nightly cron reports
-- success the whole time.
--
-- The fix, and why it defaults to "in launch period"
-- -------------------------------------------------
-- COALESCE the comparison to TRUE. Two reasons it is TRUE and not FALSE:
--
--   1. Defaulting to FALSE would mean a missing config key **downgrades
--      merchants with no grace period at all** — directly violating the frozen
--      rule (30-day trial → 7-day grace → auto-downgrade) on nothing more than
--      an operator slip. Defaulting to TRUE only delays a downgrade by 7 days.
--      Between "acts wrongly on money" and "acts late", late wins.
--   2. It matches how `activate_merchant` already reads the same key:
--      `(v_launch_end IS NULL OR NOW() < v_launch_end)` — missing is treated as
--      still inside the window. One key should not mean opposite things in two
--      functions.
--
-- And it RAISEs a WARNING, because a safe default that hides the cause is how
-- this bug survived in the first place. The warning lands in the Postgres log
-- and in cron.job_run_details for the nightly `maanta_handle_trial_expiry` run.
-- WARNING rather than EXCEPTION on purpose: aborting would also take out the
-- grace-expiry downgrades that are still correct, trading a partial silent
-- failure for a total loud one. Degrade safely, say so loudly.
--
-- No behaviour change while the key is present and valid, which is every
-- environment today. This is purely about the failure mode.
--
-- Rollback: re-apply 20260701111223_handle_trial_expiry_phase2.sql.
-- ============================================================================

BEGIN;

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

  IF v_launch_period_end IS NULL THEN
    RAISE WARNING
      'handle_trial_expiry: app_config.node0_launch_period_ends_at is missing or NULL. '
      'Assuming the launch period is still OPEN, so expiring trials still get their '
      '7-day grace period and no merchant is downgraded without one. Restore the key '
      'to resume post-launch behaviour.';
  END IF;

  -- COALESCE, not a bare comparison: `NOW() <= NULL` is NULL, and a NULL here
  -- poisons both `IF v_in_launch_period` (skips grace + agent task) and
  -- `NOT v_in_launch_period` (skips the post-launch downgrade), silently.
  -- TRUE is the safe default — see the header for why not FALSE.
  v_in_launch_period := COALESCE(NOW() <= v_launch_period_end, TRUE);

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

COMMENT ON FUNCTION public.handle_trial_expiry() IS
  'Nightly trial lifecycle: opens the 7-day grace period and an agent conversion task during the Node 0 launch period, downgrades on grace expiry, and downgrades immediately once the launch period has ended. A missing or NULL app_config.node0_launch_period_ends_at is treated as "launch period still open" and raises a WARNING — never as post-launch, which would downgrade merchants with no grace and breach the frozen trial rule.';

COMMIT;
