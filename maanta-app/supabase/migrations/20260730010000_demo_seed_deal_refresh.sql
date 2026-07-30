-- ============================================================================
-- Demo mode — keep the seeded demo deals from aging out
--
-- What went wrong
-- ---------------
-- The three fixed seed batches (`node0_100_deals`, `nairobi_150`,
-- `node0_rehearsal`) were each applied in one run with a *relative* expiry, so
-- their deals all expire within minutes of each other roughly a day later.
-- Observed on production: 237 demo deals expired together at 2026-07-29 21:00Z,
-- taking the visible marketplace from 248 live deals to 25 — most demo shops
-- rendered empty.
--
-- `reseed_demo_flash_deals()` does not and cannot cover this. It maintains
-- FLASH deals only, on Elite-and-funded merchants, between a floor of 12 and a
-- ceiling of 40. It was never meant to replace ~290 standard and boosted deals,
-- and it correctly no-ops while live flash sits above the floor.
--
-- Until now the fix was "re-run the seed files by hand", which works and is what
-- the seeds are built for (`WHERE NOT EXISTS` insert + refresh UPDATE). But it
-- depends on somebody remembering, and the failure is silent and gradual: the
-- feed just gets thinner overnight.
--
-- What this does
-- --------------
-- `refresh_demo_seed_deals()` performs exactly the refresh UPDATE those seed
-- files already do, on a schedule. It is the same operation, not a new
-- behaviour — re-running the seeds by hand remains valid and produces the same
-- result.
--
-- Design decisions worth knowing
-- ------------------------------
--   · Keyed on `demo_source`, not UUID prefixes. The batches are already tagged
--     (`node0_100_deals`, `nairobi_150`, `node0_rehearsal`), so the function does
--     not need to know the seeds' id namespaces.
--
--   · `autoreseed` is deliberately EXCLUDED. Those rows belong to
--     `reseed_demo_flash_deals()`; extending their windows here would fight the
--     hourly job over the same deals.
--
--   · Standard and boosted get a 26-hour window, not the seed's 21. A daily cron
--     with a 21-hour window leaves a 3-hour dead zone every single day, which is
--     the bug this migration exists to prevent. 26 > 24 with margin for a late or
--     skipped run.
--
--   · Flash keeps the seed's short window (5 hours), because a "flash" deal with
--     a 26-hour countdown is not a flash deal — the urgency is the point. The
--     flash rail is already guaranteed hourly by `reseed_demo_flash_deals()`;
--     these seed flash deals are a bonus on top of it, not the floor.
--
--   · Two merchants are held dark on purpose. `nairobi_150` keeps
--     c2000000…059 (a shop with no live deals) and c2000000…149 (a shop whose
--     deals are all inactive) as fixtures for the empty-state and suspended-shop
--     surfaces. Their merchant rows look identical to any other active, visible,
--     standard merchant, so there is nothing to detect them by — the ids are
--     listed explicitly, exactly as the seed file itself does. Blanket-activating
--     them would silently delete two test cases.
--
--   · No-ops entirely unless demo mode is on, matching
--     `reseed_demo_flash_deals()`. In launch mode an operator may have
--     deliberately let synthetic deals lapse before a cutover; a cron that
--     resurrects them nightly would undo that quietly.
--
--   · Touches `is_demo` rows only. Never widens visibility: a merchant that is
--     suspended, hidden or shadow-banned still hides its deals through the
--     browse views regardless of what this sets.
--
-- Schedule: 02:30 UTC daily = 05:30 EAT, before BBS Mall opens, and clear of
-- `maanta_handle_trial_expiry` at 02:00 UTC.
--
-- Rollback:
--   SELECT cron.unschedule('maanta_demo_seed_refresh');
--   DROP FUNCTION public.refresh_demo_seed_deals();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_demo_seed_deals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- The fixed seed batches this function maintains. 'autoreseed' is absent on
  -- purpose — reseed_demo_flash_deals() owns those rows.
  v_batches CONSTANT TEXT[] := ARRAY['node0_100_deals', 'nairobi_150', 'node0_rehearsal'];

  -- nairobi_150's deliberate empty-state / suspended-shop fixtures. Mirrors the
  -- exclusion in supabase/seed/nairobi_nodes_150_merchants.sql.
  v_dark_merchants CONSTANT UUID[] := ARRAY[
    'c2000000-0000-4000-a000-000000000059'::UUID,
    'c2000000-0000-4000-a000-000000000149'::UUID
  ];

  v_refreshed INT := 0;
BEGIN
  IF NOT public.is_demo_mode() THEN
    RETURN 0;
  END IF;

  UPDATE public.deals d
     SET starts_at  = CASE WHEN d.deal_type = 'flash'
                             THEN NOW() - INTERVAL '1 hour'
                           ELSE NOW() - INTERVAL '3 hours' END,
         expires_at = CASE WHEN d.deal_type = 'flash'
                             THEN NOW() + INTERVAL '5 hours'
                           ELSE NOW() + INTERVAL '26 hours' END,
         is_active  = TRUE,
         is_paused  = FALSE,
         updated_at = NOW()
   WHERE d.is_demo
     AND d.demo_source = ANY (v_batches)
     AND NOT (d.merchant_id = ANY (v_dark_merchants));

  GET DIAGNOSTICS v_refreshed = ROW_COUNT;
  RETURN v_refreshed;
END;
$fn$;

COMMENT ON FUNCTION public.refresh_demo_seed_deals() IS
  'Re-opens the expiry windows on the fixed demo seed batches so the rehearsal marketplace does not age out overnight. Identical to the refresh UPDATE in the seed files. No-ops unless demo mode is on. Touches is_demo rows only, skips autoreseed rows, and preserves the two deliberately-dark fixture shops.';

REVOKE EXECUTE ON FUNCTION public.refresh_demo_seed_deals() FROM PUBLIC;

-- Schedule it. cron.schedule() upserts on job name, so this is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'maanta_demo_seed_refresh',
      '30 2 * * *',
      $job$SELECT public.refresh_demo_seed_deals();$job$
    );
    RAISE NOTICE 'scheduled maanta_demo_seed_refresh at 02:30 UTC daily';
  ELSE
    RAISE WARNING 'pg_cron not installed — refresh_demo_seed_deals() created but NOT scheduled. Schedule it manually or the demo deals will age out again.';
  END IF;
END $$;

COMMIT;
