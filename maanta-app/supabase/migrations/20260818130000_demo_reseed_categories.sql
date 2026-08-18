-- ============================================================================
-- Demo reseed: file each catalogue item under the shopper taxonomy.
--
-- Categories landed in 20260818120000_deal_categories.sql. Every deal on
-- production is demo data (demo mode is still on), so with an uncategorised
-- catalogue the chip row would never render there and the filter would be
-- invisible until real merchants started publishing — a feature that only
-- exists in a branch is a feature nobody can review.
--
-- All sixteen items now carry a key. An earlier draft of this migration left
-- FOUR of them NULL — a screen protector, earbuds, a prayer mat and a suitcase
-- are not fashion, beauty or food, and forcing them into one of those three to
-- make the demo look tidy would have been lying with fixture data. That gap was
-- the evidence for drift D117, and the founder resolved it by widening the
-- taxonomy from three buckets to ten rather than by mis-filing the orphans. They
-- now sit in Phones & electronics, Home & living and Shoes & bags.
--
-- The catalogue spans NINE of the ten buckets; nothing here is a Health &
-- pharmacy deal. That is fine and deliberately not padded — fixture data exists
-- to exercise the code, not to hit every enum value, and inventing a pharmacy
-- deal for a mall whose three pilot merchants sell clothes, perfume and food
-- would put a shop on the demo feed that does not exist.
--
-- The uncategorised path is NOT untested as a result: `deals.category` stays
-- NULLable, every pre-taxonomy deal is in that state, and
-- `deal-categories.test.ts` covers it directly.
--
-- The rest of the function is copied VERBATIM from
-- 20260729180000_demo_reseed_retire_expired.sql — the current definition. Only
-- the catalogue's "k" keys and the INSERT's category column/value differ. The
-- retire-expired UPDATE, the Elite/flash guard, the zero-balance gate and the
-- deal-limit count are load-bearing and must survive this replace intact.
--
-- Version: after 20260818120000 (the column this depends on).
-- Rollback: re-apply 20260729180000_demo_reseed_retire_expired.sql.
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
    {"t":"Abaya restock — Dubai chiffon",        "d":"New rail just landed. Ask at the counter for the code price.", "p":2850, "c":3900, "k":"fashion"},
    {"t":"Two-piece jalabiya set",               "d":"Matching hijab included while stock lasts.",                   "p":3400, "c":4600, "k":"fashion"},
    {"t":"Attar oud — 12ml roll-on",             "d":"House blend, decanted in shop.",                              "p":950,  "c":1400, "k":"beauty"},
    {"t":"Bakhoor gift box",                     "d":"Six-piece box, wrapped free.",                                "p":1250, "c":1800, "k":"beauty"},
    {"t":"Somali tea and sambusa combo",         "d":"Two sambusa and spiced shaah.",                               "p":180,  "c":250, "k":"food"},
    {"t":"Camel milk — 1 litre, chilled",        "d":"Fresh delivery, limited each morning.",                       "p":320,  "c":420, "k":"food"},
    {"t":"Halwa tray — quarter kilo",            "d":"Cut fresh at the counter.",                                   "p":480,  "c":650, "k":"food"},
    {"t":"Phone screen protector fitted free",   "d":"Fitting included with any purchase.",                         "p":350,  "c":600, "k":"electronics"},
    {"t":"Wireless earbuds — counter demo",      "d":"Try before you pay. One-year shop warranty.",                 "p":1900, "c":2800, "k":"electronics"},
    {"t":"Prayer mat with carry bag",            "d":"Padded, machine-washable.",                                   "p":890,  "c":1300, "k":"home"},
    {"t":"Leather sandals — mens",               "d":"Sizes 39 to 45 in stock today.",                              "p":1450, "c":2100, "k":"shoes"},
    {"t":"Kids uniform bundle",                  "d":"Two shirts and one trouser.",                                 "p":1650, "c":2400, "k":"kids"},
    {"t":"Henna cones — pack of five",           "d":"Fresh batch, dark stain.",                                    "p":260,  "c":380, "k":"beauty"},
    {"t":"Gold-plated bangle set",               "d":"Six bangles, gift boxed.",                                    "p":2200, "c":3100, "k":"jewellery"},
    {"t":"Suitcase — 24 inch spinner",           "d":"Travel season stock.",                                        "p":4200, "c":5900, "k":"shoes"},
    {"t":"Barber cut and beard trim",            "d":"Walk-in, no booking needed.",                                 "p":400,  "c":550, "k":"services"}
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

  -- Free the allowance before selecting merchants. Without this the reseed
  -- strangles itself: its own expired inserts keep counting against
  -- enforce_deal_limit(), so every eligible merchant reaches the cap and the
  -- job returns 0 permanently. is_demo-scoped — a real merchant's expired-
  -- but-active deal is theirs to keep.
  UPDATE public.deals
     SET is_active = FALSE
   WHERE is_demo
     AND is_active
     AND expires_at <= NOW();

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

    -- Rounded and bounded ONCE, then used for both the stored duration and the
    -- expiry. Rounding only at the column left a countdown derived from
    -- flash_duration_hours drifting up to 30 minutes from the real expires_at.
    v_hours := GREATEST(1, LEAST(24, round(2 + (random() * 12))));

    INSERT INTO public.deals (
      merchant_id, node, title, description, image_url,
      deal_type, category, flash_duration_hours, is_active,
      max_claims, claims_count,
      price_kes, compare_at_kes,
      starts_at, expires_at,
      is_demo, demo_batch_id, demo_source
    ) VALUES (
      v_merchant.id,
      v_merchant.node,
      v_item->>'t',
      v_item->>'d',
      public.demo_placeholder_image(),
      'flash',
      v_item->>'k',
      v_hours::SMALLINT,
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
  'Tops up live demo flash deals when they fall below the floor, retiring expired demo deals first so the tier allowance is not permanently consumed. No-ops unless demo mode is on. Touches is_demo rows only, and respects the Elite-only flash rule, the per-tier active-deal limit and the zero-balance gate.';

REVOKE EXECUTE ON FUNCTION public.reseed_demo_flash_deals() FROM PUBLIC;

COMMIT;
