-- ============================================================================
-- D206 — the active-deal cap must hold on ENTRY INTO SLOT OCCUPANCY, not only
--        on INSERT.
--
-- Locked commercial rule, unchanged: Standard = 1 active deal, Elite = 2.
--
-- ## The hole
--
-- `enforce_deal_limit_trigger` was `BEFORE INSERT` only. Setting
-- `is_active = TRUE` on an existing row therefore never met the cap, so any
-- reactivation of an archived or ended deal walked straight past the
-- commercial invariant the trigger exists to protect.
--
-- Not theoretical. Measured on production 2026-08-27: **28 merchants above
-- their plan's cap**, up from 0 hours earlier with no new deals inserted in
-- between. Attribution, all of it demo data and no genuine merchant affected:
--
--   * 27 Elite merchants at 3 active deals — 2 seed-batch rows plus 1
--     `autoreseed` flash row. `reseed_demo_flash_deals()` is cap-aware and had
--     legitimately inserted its row while the merchant was under cap (it
--     deactivates expired demo deals first, precisely to free the allowance);
--     the nightly `refresh_demo_seed_deals()` then blindly reactivated BOTH
--     seed rows on top of it.
--   * 1 Standard merchant at 2 active deals — the same blanket reactivation.
--
-- The same gap would apply to any future merchant-facing "reactivate a paused
-- deal" action, and it is why the founder ruling of 2026-08-26 ("no paused
-- deal may be reactivated if that would violate the cap") had no database
-- enforcement behind it.
--
-- ## Why this is not simply `BEFORE INSERT OR UPDATE`
--
-- A trigger that re-counts on every UPDATE would refuse ordinary edits to a
-- deal that is ALREADY occupying its own slot: a Standard merchant sitting at
-- 1/1 could not retitle, reprice, pause or extend their only deal, because the
-- count (1) would meet the limit (1) on every write. The guard therefore fires
-- only on the TRANSITION into occupancy — `OLD.is_active = FALSE` and
-- `NEW.is_active = TRUE` — and returns untouched for everything else.
--
-- INSERT behaviour is deliberately left EXACTLY as it was, including its
-- stricter-than-necessary shape: an insert while at cap is refused even when
-- the new row would arrive inactive. That is pinned by
-- `deal_limit_cap_test.sql` scenario C and is not this migration's to relax.
--
-- ## What is NOT changed
--
--   * the limits themselves (1 / 2, still hardcoded, still the authority);
--   * paused semantics — `is_paused` does not affect occupancy, and a paused
--     deal keeps its slot exactly as before (cap test scenario F);
--   * expiry/archive semantics — an expired-but-active deal keeps its slot,
--     archiving frees it (scenario E);
--   * repost behaviour — a repost is an INSERT and meets the unchanged INSERT
--     path;
--   * automatic trial-expiry grandfathering — `handle_trial_expiry()` changes
--     `merchants.tier` and never touches `deals`, so a downgraded merchant
--     keeps its existing active deals until they lapse. Untouched here, and
--     deliberately: this guard fires on a deal entering occupancy, never on a
--     plan changing underneath deals that already occupy their slots;
--   * `is_demo` gets NO exemption. Demo merchants obey the same plan limits so
--     the demo dataset keeps exercising real production behaviour.
--
-- Guard: supabase/tests/deal_limit_cap_test.sql
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_deal_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  active_count  INTEGER;
  merchant_tier TEXT;
  deal_limit    INTEGER;
BEGIN
  -- ENTRY INTO OCCUPANCY is the trigger's subject (D206).
  --
  -- On UPDATE, only a row crossing from not-occupying to occupying is checked.
  -- A row that was already active stays exempt no matter what else the update
  -- changes, so a merchant at cap can still edit, pause, extend or archive the
  -- deal that owns the slot. Leaving occupancy is always allowed.
  IF TG_OP = 'UPDATE' AND (OLD.is_active OR NOT NEW.is_active) THEN
    RETURN NEW;
  END IF;

  SELECT tier INTO merchant_tier FROM public.merchants WHERE id = NEW.merchant_id;
  IF merchant_tier = 'standard' THEN
    deal_limit := 1;
    -- Flash is Elite-only, and that holds on reactivation too: a Standard
    -- merchant must not be able to bring an old Elite-era flash deal back to
    -- life. Also covers a flip TO flash on a row entering occupancy.
    IF NEW.deal_type = 'flash' THEN
      INSERT INTO public.tier_flags (merchant_id, flag_type, notes)
        VALUES (NEW.merchant_id, 'flash_not_allowed', 'Flash deal attempted on Standard plan');
      RAISE EXCEPTION 'Flash deals are only available on the Elite plan.';
    END IF;
  ELSIF merchant_tier = 'elite' THEN
    deal_limit := 2;
  ELSE
    RAISE EXCEPTION 'Unknown merchant tier: %', merchant_tier;
  END IF;

  -- The row being updated is still committed as inactive at this point, so it
  -- never counts itself.
  SELECT COUNT(*) INTO active_count
    FROM public.deals
   WHERE merchant_id = NEW.merchant_id AND is_active = TRUE;

  IF active_count >= deal_limit THEN
    INSERT INTO public.tier_flags (merchant_id, flag_type, notes)
      VALUES (NEW.merchant_id, 'deal_limit_exceeded', FORMAT('Limit %s reached for %s plan', deal_limit, merchant_tier));
    RAISE EXCEPTION 'Deal limit reached. % plan allows % active deal(s).', merchant_tier, deal_limit;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enforce_deal_limit_trigger ON public.deals;
CREATE TRIGGER enforce_deal_limit_trigger
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deal_limit();

COMMENT ON FUNCTION public.enforce_deal_limit() IS
  'Authoritative per-plan active-deal cap (Standard 1, Elite 2). Fires on INSERT and on the UPDATE transition into slot occupancy (inactive -> active); an already-active row is never re-counted, so ordinary edits at cap are allowed. Flash stays Elite-only, including on reactivation. No is_demo exemption. D206.';

-- ---------------------------------------------------------------------------
-- The nightly demo refresh becomes cap-compliant BY CONSTRUCTION.
--
-- The old body was a single blanket `UPDATE ... SET is_active = TRUE` over
-- every seed-batch row. With the guard above, that statement would now raise on
-- the first over-cap row and ABORT THE WHOLE REFRESH — silently, in cron,
-- leaving the rehearsal marketplace to age out exactly as the 2026-07-29
-- incident this function was written to prevent.
--
-- So the function no longer attempts every activation and leans on the trigger
-- to reject the surplus. It chooses, per merchant, only as many deals as the
-- plan permits, deterministically:
--
--   1. slots already taken by rows this function does NOT own (autoreseed
--      flash rows, and any genuine row) are subtracted from the plan's cap
--      first — that interaction is what produced 27 of the 28 over-cap
--      merchants;
--   2. the remaining allowance is filled from the batch in a STABLE order
--      (created_at, id), so a second run picks the same deals as the first;
--   3. flash rows are never chosen for a Standard merchant;
--   4. batch rows beyond the allowance are set inactive rather than left
--      active — which is what lets the next scheduled run repair today's
--      over-cap state without anyone editing production rows by hand.
--
-- Idempotent: run twice and the same rows end active, the same rows inactive.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_demo_seed_deals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batches CONSTANT TEXT[] := ARRAY['node0_100_deals', 'nairobi_150', 'node0_rehearsal'];
  v_dark_merchants CONSTANT UUID[] := ARRAY[
    'c2000000-0000-4000-a000-000000000059'::UUID,
    'c2000000-0000-4000-a000-000000000149'::UUID
  ];
  v_refreshed INT := 0;
BEGIN
  IF NOT public.is_demo_mode() THEN
    RETURN 0;
  END IF;

  -- Which batch rows may be active after this run. Everything else in the
  -- batch is retired below.
  --
  -- Dropped first: ON COMMIT DROP only fires at COMMIT, so a second call
  -- inside the SAME transaction would hit "relation _refresh_keep already
  -- exists" and abort. The cron calls this once per transaction, but a manual
  -- double-run or a future caller batching both must not break — and an
  -- idempotency test is exactly where that surfaced.
  --
  -- Schema-qualified `pg_temp.` on every reference, deliberately. This function
  -- pins `search_path = public, pg_temp`, and an explicitly-listed pg_temp is
  -- searched LAST — so a table named `public._refresh_keep` would shadow the
  -- temp one, and this SECURITY DEFINER body would drop and then read the wrong
  -- relation. Qualifying removes the vector rather than trusting that the name
  -- is never taken in public.
  DROP TABLE IF EXISTS pg_temp._refresh_keep;
  CREATE TEMP TABLE _refresh_keep ON COMMIT DROP AS
  WITH candidate AS (
    SELECT d.id,
           d.merchant_id,
           d.deal_type,
           d.created_at,
           m.tier,
           CASE WHEN m.tier = 'elite' THEN 2 ELSE 1 END AS cap
      FROM public.deals d
      JOIN public.merchants m ON m.id = d.merchant_id
     WHERE d.is_demo
       AND d.demo_source = ANY (v_batches)
       AND NOT (d.merchant_id = ANY (v_dark_merchants))
       -- Flash is Elite-only; never offer a Standard merchant's flash row.
       AND (m.tier = 'elite' OR d.deal_type <> 'flash')
  ),
  -- Slots held by rows this function does not manage (autoreseed flash, and
  -- anything non-demo). They are subtracted before the batch is allocated.
  foreign_occupancy AS (
    SELECT d.merchant_id, COUNT(*) AS taken
      FROM public.deals d
     WHERE d.is_active
       -- "not one of the batches", NULL included: a genuine deal carries no
       -- demo_source at all and still occupies a slot.
       AND (d.demo_source IS NULL OR NOT (d.demo_source = ANY (v_batches)))
     GROUP BY d.merchant_id
  ),
  ranked AS (
    SELECT c.id,
           c.merchant_id,
           c.cap - COALESCE(f.taken, 0) AS allowance,
           ROW_NUMBER() OVER (
             PARTITION BY c.merchant_id ORDER BY c.created_at, c.id
           ) AS rn
      FROM candidate c
      LEFT JOIN foreign_occupancy f ON f.merchant_id = c.merchant_id
  )
  SELECT id, merchant_id FROM ranked WHERE rn <= allowance;

  -- Retire every batch row that is not being kept. Leaving occupancy is always
  -- permitted by the guard, so this never raises.
  UPDATE public.deals d
     SET is_active  = FALSE,
         updated_at = NOW()
   WHERE d.is_demo
     AND d.demo_source = ANY (v_batches)
     AND NOT (d.merchant_id = ANY (v_dark_merchants))
     AND d.is_active
     AND NOT EXISTS (SELECT 1 FROM pg_temp._refresh_keep k WHERE k.id = d.id);

  -- Re-open the windows on the chosen rows. Rows already active take the
  -- always-allowed path; rows currently inactive enter occupancy inside their
  -- allowance, so the guard passes.
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
    FROM pg_temp._refresh_keep k
   WHERE d.id = k.id;

  GET DIAGNOSTICS v_refreshed = ROW_COUNT;
  RETURN v_refreshed;
END;
$fn$;

COMMENT ON FUNCTION public.refresh_demo_seed_deals() IS
  'Re-opens the expiry windows on the fixed demo seed batches so the rehearsal marketplace does not age out overnight. Cap-compliant by construction (D206): per merchant it keeps only as many batch deals as the plan permits, after subtracting slots held by rows it does not manage (autoreseed flash), chooses them in a stable created_at/id order so repeat runs are idempotent, never activates a flash deal for a Standard merchant, and retires the surplus. No-ops unless demo mode is on. Touches is_demo rows only, skips autoreseed rows, and preserves the two deliberately-dark fixture shops.';

REVOKE EXECUTE ON FUNCTION public.refresh_demo_seed_deals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_demo_seed_deals() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_demo_seed_deals() TO service_role, postgres;

COMMIT;
