-- ============================================================================
-- Demo mode, part 3 of 3 — flash-deal reseed
--
-- Flash deals expire. Without replenishment a demo goes stale within a day and
-- the feed empties out mid-rehearsal. This job keeps a live pool of synthetic
-- flash deals topped up, with staggered expiries so the feed looks like a
-- working marketplace rather than a batch insert.
--
-- Safety properties, in order of importance
-- -----------------------------------------
--   1. No-ops entirely unless app_config.demo_mode_enabled is exactly 'true'.
--   2. Reads and writes ONLY rows where is_demo — the WHERE clause on every
--      statement includes it, and new rows are written with is_demo = TRUE.
--      It cannot see, modify or attach to a real merchant.
--   3. Threshold-driven, not "insert every run": fires only below a floor, and
--      never takes the live pool past a ceiling. A stuck cron cannot inflate
--      the pool indefinitely.
--   4. Skips titles already live for a merchant, so repeated runs don't stack
--      duplicates on the same shop.
--
-- Turning it off: set demo_mode_enabled to false (job runs and no-ops), or
-- unschedule the cron job entirely. Both are in the launch checklist.
--
-- Rollback
-- --------
--   SELECT cron.unschedule('maanta_demo_reseed');
--   DROP FUNCTION public.reseed_demo_flash_deals();
--   DROP FUNCTION public.wipe_demo_data(BOOLEAN);
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. reseed_demo_flash_deals()
--
--    Returns the number of deals created, so the cron log and manual runs both
--    show what happened rather than succeeding silently.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reseed_demo_flash_deals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Eastleigh / BBS Mall trade: textiles and abayas, perfume and attar,
  -- electronics, and the tea-and-sweets end of the food court. Prices are
  -- plausible mid-2026 Nairobi retail, not round numbers.
  v_catalogue CONSTANT JSONB := '[
    {"t":"Abaya restock — Dubai chiffon",        "d":"New rail just landed. Ask at the counter for the code price.", "p":2850, "c":3900},
    {"t":"Two-piece jalabiya set",               "d":"Matching hijab included while stock lasts.",                   "p":3400, "c":4600},
    {"t":"Attar oud — 12ml roll-on",             "d":"House blend, decanted in shop.",                              "p":950,  "c":1400},
    {"t":"Bakhoor gift box",                     "d":"Six-piece box, wrapped free.",                                "p":1250, "c":1800},
    {"t":"Somali tea and sambusa combo",         "d":"Two sambusa and spiced shaah.",                               "p":180,  "c":250},
    {"t":"Camel milk — 1 litre, chilled",        "d":"Fresh delivery, limited each morning.",                       "p":320,  "c":420},
    {"t":"Halwa tray — quarter kilo",            "d":"Cut fresh at the counter.",                                   "p":480,  "c":650},
    {"t":"Phone screen protector fitted free",   "d":"Fitting included with any purchase.",                         "p":350,  "c":600},
    {"t":"Wireless earbuds — counter demo",      "d":"Try before you pay. One-year shop warranty.",                 "p":1900, "c":2800},
    {"t":"Prayer mat with carry bag",            "d":"Padded, machine-washable.",                                   "p":890,  "c":1300},
    {"t":"Leather sandals — mens",               "d":"Sizes 39 to 45 in stock today.",                              "p":1450, "c":2100},
    {"t":"Kids uniform bundle",                  "d":"Two shirts and one trouser.",                                 "p":1650, "c":2400},
    {"t":"Henna cones — pack of five",           "d":"Fresh batch, dark stain.",                                    "p":260,  "c":380},
    {"t":"Gold-plated bangle set",               "d":"Six bangles, gift boxed.",                                    "p":2200, "c":3100},
    {"t":"Suitcase — 24 inch spinner",           "d":"Travel season stock.",                                        "p":4200, "c":5900},
    {"t":"Barber cut and beard trim",            "d":"Walk-in, no booking needed.",                                 "p":400,  "c":550}
  ]'::JSONB;

  -- A real shop does not run five simultaneous flash deals. Capping per
  -- merchant bounds the pool at (eligible demo merchants x 2) independently of
  -- the ceiling, so a small demo dataset saturates and the job starts
  -- returning 0 instead of stacking deals onto the same few shops every hour.
  v_max_per_merchant CONSTANT INT := 2;

  v_enabled      BOOLEAN;
  v_floor        INT;
  v_ceiling      INT;
  v_live         INT;
  v_to_create    INT;
  v_batch        UUID := gen_random_uuid();
  v_created      INT := 0;
  v_merchant     RECORD;
  v_item         JSONB;
  v_idx          INT;
  v_hours        NUMERIC;
BEGIN
  -- (1) Master switch. Nothing below this line runs when demo mode is off.
  v_enabled := public.is_demo_mode();
  IF NOT v_enabled THEN
    RETURN 0;
  END IF;

  SELECT COALESCE((SELECT value::INT FROM public.app_config WHERE key = 'demo_flash_deal_floor'),   12)
    INTO v_floor;
  SELECT COALESCE((SELECT value::INT FROM public.app_config WHERE key = 'demo_flash_deal_ceiling'), 40)
    INTO v_ceiling;

  -- (3) Threshold check — count only LIVE demo flash deals.
  SELECT count(*) INTO v_live
    FROM public.deals
   WHERE is_demo
     AND deal_type = 'flash'
     AND is_active
     AND NOT is_paused
     AND expires_at > NOW();

  IF v_live >= v_floor THEN
    RETURN 0;                      -- pool is healthy, nothing to do
  END IF;

  v_to_create := GREATEST(v_ceiling - v_live, 0);
  IF v_to_create = 0 THEN
    RETURN 0;
  END IF;

  -- (2) Source merchants: demo only, and only ones a shopper could actually
  --     see, so reseeded deals never dangle off a hidden or pending shop.
  FOR v_merchant IN
    SELECT m.id, m.node
      FROM public.merchants m
     WHERE m.is_demo
       AND m.status = 'active'
       AND m.is_visible
       AND NOT m.is_shadow_banned
       AND (
         SELECT count(*)
           FROM public.deals d
          WHERE d.merchant_id = m.id
            AND d.is_demo
            AND d.deal_type = 'flash'
            AND d.is_active
            AND d.expires_at > NOW()
       ) < v_max_per_merchant
     ORDER BY random()
     LIMIT v_to_create
  LOOP
    v_idx  := floor(random() * jsonb_array_length(v_catalogue))::INT;
    v_item := v_catalogue -> v_idx;

    -- (4) Don't stack the same title on a shop that already has it live.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.deals
       WHERE merchant_id = v_merchant.id
         AND title = (v_item->>'t')
         AND is_active
         AND expires_at > NOW()
    );

    -- Staggered expiry: 2h to ~14h out, in uneven steps, so the feed shows a
    -- natural spread of "ending soon" rather than a wall of identical timers.
    v_hours := 2 + (random() * 12);

    INSERT INTO public.deals (
      merchant_id, node, title, description, image_url,
      deal_type, flash_duration_hours, is_active,
      max_claims, claims_count,
      price_kes, compare_at_kes,
      starts_at, expires_at,
      is_demo, demo_batch_id, demo_source
    ) VALUES (
      v_merchant.id,
      v_merchant.node,
      v_item->>'t',
      v_item->>'d',
      '/demo/deal-placeholder.svg',
      'flash',
      GREATEST(1, LEAST(24, round(v_hours)::SMALLINT)),
      TRUE,
      (8 + floor(random() * 25))::INT,          -- max_claims 8..32
      floor(random() * 6)::INT,                 -- a few already claimed
      (v_item->>'p')::NUMERIC,
      (v_item->>'c')::NUMERIC,
      NOW() - (random() * INTERVAL '90 minutes'),  -- staggered "posted" times
      NOW() + (v_hours * INTERVAL '1 hour'),
      TRUE, v_batch, 'autoreseed'
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

COMMENT ON FUNCTION public.reseed_demo_flash_deals() IS
  'Tops up live demo flash deals to the configured ceiling when they fall below the floor. No-ops unless demo mode is on. Touches is_demo rows only.';

REVOKE EXECUTE ON FUNCTION public.reseed_demo_flash_deals() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 2. wipe_demo_data() — the launch-off switch.
--
--    Deletes in FK-dependency order. Defaults to a DRY RUN: it reports what it
--    would remove and changes nothing unless called with p_confirm => TRUE.
--    A destructive default on a function this easy to call is not worth the
--    keystrokes it saves.
--
--    Real rows are never in scope: every DELETE is guarded by is_demo.
-- ----------------------------------------------------------------------------
-- Dependent tables that reference merchants/deals/users with ON DELETE NO
-- ACTION. Each one BLOCKS the delete until its demo-scoped rows are cleared
-- first. Verified against the live FK graph on 2026-07-29 — with the shipped
-- seeds in place, `fraud_events` (1 row) and `agents` (1 row) already blocked
-- the wipe, so this is not defensive programming.
--
-- CASCADE dependents (archive_history, kpi_counters, merchant_favourites,
-- merchant_staff.merchant_id, tier_flags, boost_flags.deal_id,
-- notifications.user_id) clear themselves and are not listed.
CREATE OR REPLACE FUNCTION public.wipe_demo_data(p_confirm BOOLEAN DEFAULT FALSE)
RETURNS TABLE (table_name TEXT, rows_affected BIGINT, applied BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guardian    BIGINT;
  v_fraud       BIGINT;
  v_boost       BIGINT;
  v_audit       BIGINT;
  v_feerev      BIGINT;
  v_adminops    BIGINT;
  v_agents      BIGINT;
  v_leads       BIGINT;
  v_tierflags   BIGINT;
  v_tasks       BIGINT;
  v_redemptions BIGINT;
  v_mtx         BIGINT;
  v_deals       BIGINT;
  v_merchants   BIGINT;
  v_users       BIGINT;
BEGIN
  -- Count everything first so the dry run reports the full blast radius,
  -- including the dependent rows the caller never explicitly asked about.
  SELECT count(*) INTO v_guardian FROM public.guardian_events g
    WHERE g.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
       OR g.deal_id     IN (SELECT id FROM public.deals     WHERE is_demo)
       OR g.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
  SELECT count(*) INTO v_fraud FROM public.fraud_events f
    WHERE f.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
       OR f.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
  SELECT count(*) INTO v_boost FROM public.boost_flags
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_audit FROM public.audit_logs
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_feerev FROM public.fee_reversals
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_adminops FROM public.admin_ops_log
    WHERE admin_user_id IN (SELECT id FROM public.users WHERE is_demo);
  SELECT count(*) INTO v_agents FROM public.agents
    WHERE user_id IN (SELECT id FROM public.users WHERE is_demo);
  SELECT count(*) INTO v_leads FROM public.leads
    WHERE converted_to IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_tierflags FROM public.tier_flags
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_tasks FROM public.agent_tasks
    WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
  SELECT count(*) INTO v_redemptions FROM public.redemptions           WHERE is_demo;
  SELECT count(*) INTO v_mtx         FROM public.merchant_transactions WHERE is_demo;
  SELECT count(*) INTO v_deals       FROM public.deals                 WHERE is_demo;
  SELECT count(*) INTO v_merchants   FROM public.merchants             WHERE is_demo;
  SELECT count(*) INTO v_users       FROM public.users                 WHERE is_demo;

  IF p_confirm THEN
    -- 1. Blocking dependents, scoped to demo parents. These are audit and
    --    fraud trails FOR SYNTHETIC MERCHANTS — deleting them removes a record
    --    of events that never really happened. Real merchants' trails are not
    --    in scope: every predicate keys off a demo parent id.
    DELETE FROM public.guardian_events g
      WHERE g.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
         OR g.deal_id     IN (SELECT id FROM public.deals     WHERE is_demo)
         OR g.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
    DELETE FROM public.fraud_events f
      WHERE f.merchant_id IN (SELECT id FROM public.merchants WHERE is_demo)
         OR f.user_id     IN (SELECT id FROM public.users     WHERE is_demo);
    DELETE FROM public.boost_flags
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.audit_logs
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.fee_reversals
      WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.admin_ops_log
      WHERE admin_user_id IN (SELECT id FROM public.users WHERE is_demo);
    DELETE FROM public.agents
      WHERE user_id IN (SELECT id FROM public.users WHERE is_demo);

    -- 2. Leads are NEVER deleted — a lead can be a real prospect even when the
    --    merchant it converted to was synthetic. Detach instead.
    UPDATE public.leads SET converted_to = NULL
      WHERE converted_to IN (SELECT id FROM public.merchants WHERE is_demo);

    -- 3. A demo user staffing a real merchant: detach rather than delete, so
    --    the real merchant's staff list survives. (Rows on demo merchants
    --    cascade away with the merchant below.)
    UPDATE public.merchant_staff SET user_id = NULL
      WHERE user_id IN (SELECT id FROM public.users WHERE is_demo)
        AND merchant_id NOT IN (SELECT id FROM public.merchants WHERE is_demo);

    -- 4. Core rows, children before parents.
    DELETE FROM public.redemptions           WHERE is_demo;
    DELETE FROM public.merchant_transactions WHERE is_demo;
    DELETE FROM public.deals                 WHERE is_demo;
    DELETE FROM public.tier_flags  WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.agent_tasks WHERE merchant_id IN (SELECT id FROM public.merchants WHERE is_demo);
    DELETE FROM public.merchants             WHERE is_demo;
    DELETE FROM public.users                 WHERE is_demo;
  END IF;

  RETURN QUERY
    SELECT 'guardian_events'::TEXT,           v_guardian,    p_confirm
    UNION ALL SELECT 'fraud_events',          v_fraud,       p_confirm
    UNION ALL SELECT 'boost_flags',           v_boost,       p_confirm
    UNION ALL SELECT 'audit_logs',            v_audit,       p_confirm
    UNION ALL SELECT 'fee_reversals',         v_feerev,      p_confirm
    UNION ALL SELECT 'admin_ops_log',         v_adminops,    p_confirm
    UNION ALL SELECT 'agents',                v_agents,      p_confirm
    UNION ALL SELECT 'leads (detached)',      v_leads,       p_confirm
    UNION ALL SELECT 'tier_flags',            v_tierflags,   p_confirm
    UNION ALL SELECT 'agent_tasks',           v_tasks,       p_confirm
    UNION ALL SELECT 'redemptions',           v_redemptions, p_confirm
    UNION ALL SELECT 'merchant_transactions', v_mtx,         p_confirm
    UNION ALL SELECT 'deals',                 v_deals,       p_confirm
    UNION ALL SELECT 'merchants',             v_merchants,   p_confirm
    UNION ALL SELECT 'users',                 v_users,       p_confirm;
END;
$$;

COMMENT ON FUNCTION public.wipe_demo_data(BOOLEAN) IS
  'Removes every is_demo row in FK order. DRY RUN by default — pass TRUE to apply. Real rows are never in scope.';

REVOKE EXECUTE ON FUNCTION public.wipe_demo_data(BOOLEAN) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. Schedule the reseed.
--
--    Uses cron.schedule() rather than a direct INSERT INTO cron.job — the
--    2026-07-29 decisions-log entry records that the direct-INSERT pattern
--    silently failed on production and left handle_trial_expiry unscheduled
--    for weeks. Same mistake is not repeated here.
--
--    Hourly is enough: the floor is 12 and flash deals run 2-14h, so the pool
--    cannot drain to empty between runs. The job self-disables via the
--    demo-mode check, so leaving it scheduled in launch mode is inert — but
--    the checklist unschedules it anyway.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'maanta_demo_reseed',
      '7 * * * *',                        -- :07 past the hour, off the trial-expiry slot
      $cron$SELECT public.reseed_demo_flash_deals();$cron$
    );
    RAISE NOTICE 'demo reseed scheduled: maanta_demo_reseed (hourly at :07)';
  ELSE
    RAISE NOTICE 'pg_cron not installed — reseed function created but NOT scheduled.';
  END IF;
END $$;

COMMIT;
