-- ============================================================
-- MAANTA: schedule handle_trial_expiry() via the SUPPORTED cron.schedule() API
-- Audit follow-up, 2026-07-29 (docs/skills/full-state-audit-2026-07-29.md §7.2)
--
-- WHY THIS EXISTS
-- Migrations 20260701110443 and 20260701111223 each tried to register the
-- nightly trial-expiry job with a *direct* `INSERT INTO cron.job (...)`, wrapped
-- in `EXCEPTION WHEN OTHERS THEN NULL`. On production (axrrslqssmbngbataejg) that
-- registration silently failed: as of 2026-07-29 pg_cron is INSTALLED but
-- `cron.job` held ZERO rows, so `public.handle_trial_expiry()` was never being
-- invoked. With ~101 merchants on an Elite trial, none would ever move to grace
-- or auto-downgrade — the KES 3,500/month conversion path (a frozen rule) was
-- inert. See the decisions log entry dated 2026-07-29.
--
-- THE FIX
-- Use `cron.schedule(job_name, schedule, command)` — the supported pg_cron API,
-- which UPSERTS by job name, so this migration is safe to re-run. No blanket
-- error-swallowing: if pg_cron is present we register (and RAISE NOTICE); if it
-- is genuinely absent (e.g. a local/CI Postgres without the extension) we skip
-- with a NOTICE, so a future silent failure cannot hide the same way again.
--
-- This changes NO business logic and NO frozen rule — `handle_trial_expiry()`
-- itself is unchanged (defined in 20260701111223). It only ensures the function
-- is actually scheduled. Nightly at 02:00 UTC, before East-Africa business hours.
--
-- OPERATOR NOTE: applying this migration to production registers the job. Verify
-- afterwards with:  SELECT jobname, schedule, active FROM cron.job;
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: cron.schedule() upserts on job name.
    PERFORM cron.schedule(
      'maanta_handle_trial_expiry',
      '0 2 * * *',
      'SELECT public.handle_trial_expiry();'
    );
    RAISE NOTICE 'cron job "maanta_handle_trial_expiry" registered (schedule: 0 2 * * *).';
  ELSE
    RAISE NOTICE 'pg_cron extension not installed — trial-expiry job NOT scheduled. Enable pg_cron (Database > Extensions) and re-run this migration in production.';
  END IF;
END $$;
