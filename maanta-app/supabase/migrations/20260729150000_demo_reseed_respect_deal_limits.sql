-- ============================================================================
-- Demo mode — reseed must respect the tier deal rules
--
-- Follow-up to 20260729142000. That migration is already applied, so the fix
-- ships as its own CREATE OR REPLACE rather than an edit to applied history.
--
-- What went wrong
-- ---------------
-- `reseed_demo_flash_deals()` picked any active, visible, funded demo merchant.
-- Deal inserts are governed by `enforce_deal_limit()`, which enforces two rules
-- the reseed did not model:
--
--   1. Flash deals are ELITE-ONLY. On a Standard merchant the trigger raises
--      'Flash deals are only available on the Elite plan.' — and writes a
--      `tier_flags` row ('flash_not_allowed') on the way out.
--   2. Active-deal limits: Standard 1, Elite 2. The count is over
--      `is_active = TRUE` REGARDLESS OF EXPIRY, so the expired-but-active seed
--      deals still occupy a merchant's allowance.
--
-- The first run against production raised on rule 1 — 109 of the 210 visible
-- demo merchants are Standard. The whole reseed aborted (the transaction rolled
-- back cleanly, leaving no tier_flags behind), so the pool stayed empty.
--
-- The old per-merchant cap counted only live demo FLASH deals, which is not the
-- quantity the database limits. It is replaced by the trigger's own predicate,
-- so the two can no longer disagree.
--
-- Rollback: re-apply 20260729142000_demo_mode_reseed.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reseed_demo_flash_deals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
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

  -- Mirrors enforce_deal_limit()'s Elite allowance. Named for where the number
  -- comes from, so a tier change is a one-line edit here.
  v_elite_deal_limit CONSTANT INT := 2;

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
  v_enabled := public.is_demo_mode();
  IF NOT v_enabled THEN
    RETURN 0;
  END IF;

  SELECT COALESCE((SELECT value::INT FROM public.app_config WHERE key = 'demo_flash_deal_floor'),   12)
    INTO v_floor;
  SELECT COALESCE((SELECT value::INT FROM public.app_config WHERE key = 'demo_flash_deal_ceiling'), 40)
    INTO v_ceiling;

  SELECT count(*) INTO v_live
    FROM public.deals
   WHERE is_demo
     AND deal_type = 'flash'
     AND is_active
     AND NOT is_paused
     AND expires_at > NOW();

  IF v_live >= v_floor THEN
    RETURN 0;
  END IF;

  v_to_create := GREATEST(v_ceiling - v_live, 0);
  IF v_to_create = 0 THEN
    RETURN 0;
  END IF;

  FOR v_merchant IN
    SELECT m.id, m.node
      FROM public.merchants m
     WHERE m.is_demo
       AND m.status = 'active'
       AND m.is_visible
       AND NOT m.is_shadow_banned
       -- Flash is Elite-only (enforce_deal_limit). A Standard merchant would
       -- raise and abort the whole run, and leave a tier_flags row behind.
       AND m.tier = 'elite'
       -- Zero-balance gate (trg_enforce_zero_balance_gate).
       AND m.account_balance > 0
       -- enforce_deal_limit counts EVERY is_active deal, expired or not — so
       -- this must be the same count, not just live demo flash deals.
       AND (
         SELECT count(*) FROM public.deals d
          WHERE d.merchant_id = m.id AND d.is_active
       ) < v_elite_deal_limit
     ORDER BY random()
     LIMIT v_to_create
  LOOP
    v_idx  := floor(random() * jsonb_array_length(v_catalogue))::INT;
    v_item := v_catalogue -> v_idx;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.deals
       WHERE merchant_id = v_merchant.id
         AND title = (v_item->>'t')
         AND is_active
         AND expires_at > NOW()
    );

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
      (8 + floor(random() * 25))::INT,
      floor(random() * 6)::INT,
      (v_item->>'p')::NUMERIC,
      (v_item->>'c')::NUMERIC,
      NOW() - (random() * INTERVAL '90 minutes'),
      NOW() + (v_hours * INTERVAL '1 hour'),
      TRUE, v_batch, 'autoreseed'
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$fn$;

COMMENT ON FUNCTION public.reseed_demo_flash_deals() IS
  'Tops up live demo flash deals when they fall below the floor. No-ops unless demo mode is on. Touches is_demo rows only, and respects the Elite-only flash rule, the per-tier active-deal limit and the zero-balance gate.';

REVOKE EXECUTE ON FUNCTION public.reseed_demo_flash_deals() FROM PUBLIC;

COMMIT;
