-- ============================================================================
-- MAANTA Node 0 — 100 live deals seed (BBS Mall)
--
-- Creates 60 demo merchants + 100 active deals for Discover/Browse rails:
--   · 15 flash
--   · 20 boosted (standard + boost_active)
--   · 65 standard ("near me")
--
-- Respects enforce_deal_limit: Elite ≤2 active, Standard ≤1, flash Elite-only.
-- Idempotent: fixed UUID namespaces; re-run refreshes expiry windows + GPS.
--
-- Apply (production or local):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/node0_100_deals_seed.sql
-- Or paste into the Supabase SQL editor (project axrrslqssmbngbataejg).
--
-- UUID namespaces (do not collide with node0_rehearsal_seed):
--   users:     b1000000-0000-4000-a000-0000000000NN  (NN = 01..60)
--   merchants: c1000000-0000-4000-a000-0000000000NN
--   deals:     d1000000-0000-4000-a000-0000000000NN  (NN = 01..100)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. App users for demo merchants (merchant_admin)
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
SELECT
  ('b1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  NULL,
  '+25470' || lpad((1000000 + n)::text, 7, '0'),
  'aragagency+seed' || lpad(n::text, 2, '0') || '@gmail.com',
  'Seed Merchant ' || lpad(n::text, 2, '0'),
  'merchant_admin'
FROM generate_series(1, 60) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = ('b1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
);

-- ----------------------------------------------------------------------------
-- 2. Merchants (40 Elite + 20 Standard), BBS Mall, with GPS near mall centroid
-- ----------------------------------------------------------------------------
INSERT INTO public.merchants (
  id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at,
  node, what3words_address, mall_name, floor, unit_number, entrance_notes,
  phone, email, whatsapp, account_balance, outstanding_arrears,
  is_visible, is_shadow_banned, onboarded_at
)
SELECT
  ('c1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  ('b1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  (ARRAY[
    'Eastleigh Spices','Habibi Grill','Soma Books','Nairobi Threads','Baraka Electronics',
    'Savanna Shoes','Qorax Fashion','Milk & Honey Café','Amal Perfumes','Juba Cuts',
    'Wajir Fresh','Dirac House','Gold Line Watches','Coastal Snacks','Horizon Optics',
    'Safari Prints','Kismayo Kitchen','Pearl Beauty','Talisman Gifts','City Phone Hub',
    'Nomad Leather','Bloom Florist','Starlight Fabrics','Yasmin Sweets','Atlas Sports',
    'Moonlight Henna','Riverbank Tea','Orchid Salon','Mogadishu Fashion','Lantern Home',
    'Cedar Pharmacy','Summit Gadgets','Oasis Juice','Velvet Scarves','Palm Dates Co',
    'Northgate Tailor','Amber Lights','Copper Pot','Silk Road Bags','Breeze Laundry',
    'Green Plate','Ivory Beads','Compass Travel','Dune Desserts','Echo Music',
    'Flame Grill','Garden Fresh','Harbor Fish','Ivory Dental','Jade Jewelry',
    'Karma Yoga','Lotus Spa','Maple Bakery','Nest Homeware','Olive Oil House',
    'Pepper Pot','Quartz Clocks','Rose Attar','Saffron Mart','Tulip Kids'
  ])[n],
  CASE WHEN n <= 40 THEN 'elite' ELSE 'standard' END,
  'active',
  (n <= 40),
  CASE WHEN n <= 40 THEN NOW() + INTERVAL '30 days' END,
  'BBS Mall',
  (ARRAY[
    'stored.riches.shine','lively.scent.corner','market.square.entry','bright.mango.lane',
    'calm.river.gate','fresh.olive.path','golden.spice.walk','happy.lemon.yard',
    'ivory.palm.court','jolly.cedar.row','kind.amber.hall','lunar.peach.bay',
    'mint.coral.dock','noble.wheat.farm','open.silver.mew','proud.tiger.den',
    'quiet.umbra.vale','rapid.violet.cove','sunny.willow.glen','tidal.xenon.peak',
    'ultra.yellow.reef','vivid.zebra.sand','warm.apple.ridge','xenon.berry.hill',
    'young.cloud.isle','zesty.daisy.park','amber.eagle.rock','brave.fjord.stone',
    'crisp.grape.trail','deep.hazel.brook','eager.iris.field','fancy.jade.shore',
    'gentle.kite.bay','honest.lotus.cove','iron.maple.grove','jolly.nectar.pond',
    'keen.opal.stream','lush.pearl.cliff','merry.quartz.dune','nifty.robin.ford',
    'omega.sage.bluff','plush.tulip.bend','quick.umber.pass','royal.violet.spur',
    'soft.walnut.knoll','true.xylia.ridge','urban.yarrow.glen','vital.zinnia.cove',
    'witty.acorn.mead','xenon.basil.croft','amber.clove.hurst','brisk.dahlia.mere',
    'crisp.elder.wick','dusky.fern.leigh','ember.guava.holt','flint.holly.mere',
    'grain.indigo.vale','hazel.jasmine.row','ivory.kelp.shore','jade.lilac.bank'
  ])[n],
  'BBS Mall',
  (ARRAY['Ground Floor','1st Floor','2nd Floor','Food Court'])[1 + ((n - 1) % 4)],
  chr(65 + ((n - 1) % 26)) || '-' || lpad(((n - 1) % 40 + 1)::text, 2, '0'),
  'Seed shop — ask for Maanta pickup',
  '+25470' || lpad((1000000 + n)::text, 7, '0'),
  'aragagency+seed' || lpad(n::text, 2, '0') || '@gmail.com',
  '+25470' || lpad((1000000 + n)::text, 7, '0'),
  CASE WHEN n <= 40 THEN 1500.00 ELSE 400.00 END,
  0,
  true,
  false,
  NOW() - INTERVAL '2 days'
FROM generate_series(1, 60) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchants m
  WHERE m.id = ('c1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
);

UPDATE public.merchants m
SET
  is_visible = true,
  is_shadow_banned = false,
  status = 'active',
  updated_at = NOW()
FROM generate_series(1, 60) AS n
WHERE m.id = ('c1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid;

-- GPS when lat/lng columns exist (migration 20260726120000_merchant_lat_lng).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'lat'
  ) THEN
    UPDATE public.merchants m
    SET
      lat = -1.2746 + ((n % 10) - 5) * 0.00018,
      lng = 36.8501 + ((n % 7) - 3) * 0.00022,
      updated_at = NOW()
    FROM generate_series(1, 60) AS n
    WHERE m.id = ('c1000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Deal catalogue (100 rows) mapped to merchants within tier limits
--
-- Merchant slots:
--   Elite  1–15:  flash + boosted     → 15 flash, 15 boosted
--   Elite 16–20:  boosted + standard  →  5 boosted,  5 standard
--   Elite 21–40:  2× standard         → 40 standard
--   Std   41–60:  1× standard         → 20 standard
-- Totals: flash 15 · boosted 20 · standard 65 = 100
-- ----------------------------------------------------------------------------
WITH catalogue AS (
  SELECT * FROM (VALUES
    -- deal_n, merchant_n, title, deal_type, boost, price, compare, hours_ago_start, color
    (1,  1,  'Flash: 2-for-1 samosas tray',           'flash',    false, 350,  700,  1,  'b45309'),
    (2,  1,  'Boosted: family grill platter',         'standard', true,  1200, 1800, 2,  '0f766e'),
    (3,  2,  'Flash: free juice with any wrap',       'flash',    false, 450,  900,  1,  'b45309'),
    (4,  2,  'Boosted: weekend spice bundle',         'standard', true,  800,  1200, 2,  '0f766e'),
    (5,  3,  'Flash: buy 2 notebooks get 1',          'flash',    false, 400,  800,  1,  'b45309'),
    (6,  3,  'Boosted: school starter pack',          'standard', true,  1500, 2200, 3,  '0f766e'),
    (7,  4,  'Flash: 40% off summer tees',            'flash',    false, 900,  1500, 1,  'b45309'),
    (8,  4,  'Boosted: denim + shirt combo',          'standard', true,  2200, 3200, 2,  '0f766e'),
    (9,  5,  'Flash: earbuds flash drop',             'flash',    false, 1800, 3500, 1,  'b45309'),
    (10, 5,  'Boosted: phone case bundle',            'standard', true,  600,  1000, 3,  '0f766e'),
    (11, 6,  'Flash: sneakers 30% off',               'flash',    false, 2800, 4000, 1,  'b45309'),
    (12, 6,  'Boosted: school shoes deal',            'standard', true,  1600, 2400, 2,  '0f766e'),
    (13, 7,  'Flash: dirac evening cut',              'flash',    false, 3500, 5500, 1,  'b45309'),
    (14, 7,  'Boosted: hijab 3-pack',                 'standard', true,  900,  1500, 2,  '0f766e'),
    (15, 8,  'Flash: latte + pastry hour',            'flash',    false, 350,  600,  1,  'b45309'),
    (16, 8,  'Boosted: brunch for two',               'standard', true,  1100, 1600, 3,  '0f766e'),
    (17, 9,  'Flash: oud sample trio',                'flash',    false, 700,  1400, 1,  'b45309'),
    (18, 9,  'Boosted: perfume gift set',             'standard', true,  1950, 2800, 2,  '0f766e'),
    (19, 10, 'Flash: fade + beard trim',              'flash',    false, 500,  900,  1,  'b45309'),
    (20, 10, 'Boosted: kids cut special',             'standard', true,  400,  700,  2,  '0f766e'),
    (21, 11, 'Flash: mango crate today',              'flash',    false, 600,  1000, 1,  'b45309'),
    (22, 11, 'Boosted: weekly veggie box',            'standard', true,  900,  1300, 3,  '0f766e'),
    (23, 12, 'Flash: abaya flash rack',               'flash',    false, 2400, 3600, 1,  'b45309'),
    (24, 12, 'Boosted: prayer set bundle',            'standard', true,  1300, 2000, 2,  '0f766e'),
    (25, 13, 'Flash: watch strap upgrade',            'flash',    false, 800,  1500, 1,  'b45309'),
    (26, 13, 'Boosted: classic quartz deal',          'standard', true,  3200, 4800, 2,  '0f766e'),
    (27, 14, 'Flash: chapati + stew lunch',           'flash',    false, 300,  550,  1,  'b45309'),
    (28, 14, 'Boosted: family snack pack',            'standard', true,  750,  1100, 3,  '0f766e'),
    (29, 15, 'Flash: blue-light glasses',             'flash',    false, 1500, 2500, 1,  'b45309'),
    (30, 15, 'Boosted: frames + case set',            'standard', true,  2800, 4000, 2,  '0f766e'),
    -- Elite 16–20: boosted + standard
    (31, 16, 'Boosted: Ankara print yard',            'standard', true,  1000, 1600, 2,  '0f766e'),
    (32, 16, 'Canvas tote two-pack',                  'standard', false, 650,  1000, 3,  '334155'),
    (33, 17, 'Boosted: camel milk latte',             'standard', true,  400,  650,  2,  '0f766e'),
    (34, 17, 'Mandazi dozen deal',                    'standard', false, 350,  550,  3,  '334155'),
    (35, 18, 'Boosted: henna + glow kit',             'standard', true,  1200, 1800, 2,  '0f766e'),
    (36, 18, 'Lip kit essentials',                    'standard', false, 900,  1400, 3,  '334155'),
    (37, 19, 'Boosted: souvenir mug set',             'standard', true,  800,  1200, 2,  '0f766e'),
    (38, 19, 'Postcard + stamp pack',                 'standard', false, 250,  400,  3,  '334155'),
    (39, 20, 'Boosted: football boots care',          'standard', true,  1100, 1700, 2,  '0f766e'),
    (40, 20, 'Gym towel duo',                         'standard', false, 500,  800,  3,  '334155'),
    -- Elite 21–40: two standards each (41–80)
    (41, 21, 'Henna night special',                   'standard', false, 700,  1100, 3,  '334155'),
    (42, 21, 'Bridal trial session',                  'standard', false, 2500, 4000, 4,  '475569'),
    (43, 22, 'Pot of masala chai',                    'standard', false, 200,  350,  3,  '334155'),
    (44, 22, 'Afternoon tea for two',                 'standard', false, 900,  1400, 4,  '475569'),
    (45, 23, 'Wash + blow dry',                       'standard', false, 1200, 1800, 3,  '334155'),
    (46, 23, 'Nail art mini set',                     'standard', false, 800,  1300, 4,  '475569'),
    (47, 24, 'Khamis / macawiis deal',                'standard', false, 1800, 2800, 3,  '334155'),
    (48, 24, 'Kids eid outfit',                       'standard', false, 2200, 3400, 4,  '475569'),
    (49, 25, 'Lantern home set',                      'standard', false, 1500, 2300, 3,  '334155'),
    (50, 25, 'Cushion cover pair',                    'standard', false, 900,  1400, 4,  '475569'),
    (51, 26, 'Cold & flu kit',                        'standard', false, 650,  1000, 3,  '334155'),
    (52, 26, 'Vitamins month pack',                   'standard', false, 1100, 1600, 4,  '475569'),
    (53, 27, 'Power bank 20k mAh',                    'standard', false, 2200, 3200, 3,  '334155'),
    (54, 27, 'USB-C cable 2-pack',                    'standard', false, 500,  900,  4,  '475569'),
    (55, 28, 'Detox juice flight',                    'standard', false, 600,  950,  3,  '334155'),
    (56, 28, 'Smoothie meal deal',                    'standard', false, 450,  700,  4,  '475569'),
    (57, 29, 'Velvet scarf duo',                      'standard', false, 1400, 2100, 3,  '334155'),
    (58, 29, 'Modal everyday hijab',                  'standard', false, 700,  1100, 4,  '475569'),
    (59, 30, 'Medjool date box',                      'standard', false, 900,  1400, 3,  '334155'),
    (60, 30, 'Date + nut mix',                        'standard', false, 550,  850,  4,  '475569'),
    (61, 31, 'Alterations same-day',                  'standard', false, 400,  700,  3,  '334155'),
    (62, 31, 'Suit press special',                    'standard', false, 600,  950,  4,  '475569'),
    (63, 32, 'LED desk lamp',                         'standard', false, 1300, 2000, 3,  '334155'),
    (64, 32, 'String lights 5m',                      'standard', false, 700,  1100, 4,  '475569'),
    (65, 33, 'Biryani for two',                       'standard', false, 1100, 1600, 3,  '334155'),
    (66, 33, 'Soup + chapati lunch',                  'standard', false, 350,  550,  4,  '475569'),
    (67, 34, 'Weekend tote',                          'standard', false, 1600, 2400, 3,  '334155'),
    (68, 34, 'Crossbody mini bag',                    'standard', false, 1200, 1800, 4,  '475569'),
    (69, 35, 'Wash & fold 5kg',                       'standard', false, 500,  800,  3,  '334155'),
    (70, 35, 'Dry clean blazer',                      'standard', false, 700,  1100, 4,  '475569'),
    (71, 36, 'Veggie bowl lunch',                     'standard', false, 550,  850,  3,  '334155'),
    (72, 36, 'Salad + juice combo',                   'standard', false, 650,  1000, 4,  '475569'),
    (73, 37, 'Beaded bracelet set',                   'standard', false, 800,  1300, 3,  '334155'),
    (74, 37, 'Prayer bead upgrade',                   'standard', false, 600,  950,  4,  '475569'),
    (75, 38, 'Day trip daypack',                      'standard', false, 1800, 2700, 3,  '334155'),
    (76, 38, 'Travel pouch trio',                     'standard', false, 700,  1100, 4,  '475569'),
    (77, 39, 'Kunafa slice deal',                     'standard', false, 350,  550,  3,  '334155'),
    (78, 39, 'Baklava box small',                     'standard', false, 900,  1400, 4,  '475569'),
    (79, 40, 'Earphone tip pack',                     'standard', false, 300,  500,  3,  '334155'),
    (80, 40, 'Guitar string set',                     'standard', false, 800,  1200, 4,  '475569'),
    -- Standard merchants 41–60: one deal each (81–100)
    (81, 41, 'Nyama choma for two',                   'standard', false, 1400, 2100, 3,  '334155'),
    (82, 42, 'Farm egg crate',                        'standard', false, 450,  700,  3,  '334155'),
    (83, 43, 'Tilapia Friday special',                'standard', false, 900,  1400, 3,  '334155'),
    (84, 44, 'Teeth whitening consult',               'standard', false, 1500, 2500, 4,  '475569'),
    (85, 45, 'Silver hoop pair',                      'standard', false, 1200, 1900, 3,  '334155'),
    (86, 46, 'Drop-in yoga class',                    'standard', false, 600,  1000, 3,  '334155'),
    (87, 47, 'Express facial',                        'standard', false, 1800, 2800, 3,  '334155'),
    (88, 48, 'Sourdough loaf + butter',               'standard', false, 450,  700,  3,  '334155'),
    (89, 49, 'Kitchen towel set',                     'standard', false, 700,  1100, 3,  '334155'),
    (90, 50, 'Extra virgin 500ml',                    'standard', false, 900,  1400, 3,  '334155'),
    (91, 51, 'Pilipili sauce trio',                   'standard', false, 500,  800,  3,  '334155'),
    (92, 52, 'Wall clock classic',                    'standard', false, 1600, 2400, 3,  '334155'),
    (93, 53, 'Rose attar vial',                       'standard', false, 1100, 1700, 3,  '334155'),
    (94, 54, 'Saffron 1g tin',                        'standard', false, 1400, 2200, 3,  '334155'),
    (95, 55, 'Kids lunch box set',                    'standard', false, 800,  1300, 3,  '334155'),
    (96, 56, 'Grill marinade kit',                    'standard', false, 550,  900,  3,  '334155'),
    (97, 57, 'Herb planter starter',                  'standard', false, 650,  1000, 3,  '334155'),
    (98, 58, 'Smoked fish snack pack',                'standard', false, 700,  1100, 3,  '334155'),
    (99, 59, 'Check-up polish',                       'standard', false, 900,  1500, 4,  '475569'),
    (100,60, 'Charm bracelet',                        'standard', false, 1000, 1600, 3,  '334155')
  ) AS t(deal_n, merchant_n, title, deal_type, boost, price, compare, hours_ago, color)
)
INSERT INTO public.deals (
  id, merchant_id, node, title, description, image_url,
  discount_type, discount_value, deal_type, flash_duration_hours,
  is_active, boost_active, max_claims, claims_count, starts_at,
  price_kes, compare_at_kes, charges
)
SELECT
  ('d1000000-0000-4000-a000-' || lpad(c.deal_n::text, 12, '0'))::uuid,
  ('c1000000-0000-4000-a000-' || lpad(c.merchant_n::text, 12, '0'))::uuid,
  'BBS Mall',
  c.title,
  'Seed deal at BBS Mall — show your Maanta code at the counter before paying.',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23'
    || c.color
    || '"/><text x="200" y="145" font-family="sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">'
    || replace(replace(left(c.title, 28), '&', '%26'), '"', '')
    || '</text><text x="200" y="185" font-family="sans-serif" font-size="16" fill="white" text-anchor="middle">BBS Mall · YOU PAY KES '
    || c.price::text
    || '</text></svg>',
  'fixed',
  GREATEST(c.compare - c.price, 0),
  c.deal_type,
  CASE WHEN c.deal_type = 'flash' THEN 6 ELSE 6 END,
  true,
  c.boost,
  CASE WHEN c.deal_type = 'flash' THEN 12 ELSE 25 END,
  0,
  NOW() - (c.hours_ago || ' hours')::interval,
  c.price::numeric,
  c.compare::numeric,
  '[]'::jsonb
FROM catalogue c
WHERE NOT EXISTS (
  SELECT 1 FROM public.deals d
  WHERE d.id = ('d1000000-0000-4000-a000-' || lpad(c.deal_n::text, 12, '0'))::uuid
)
ORDER BY c.merchant_n, c.deal_n;

-- Refresh windows on every re-run so rails stay live.
--
-- Cap-aware since D206. The active-deal cap now holds on the UPDATE transition
-- INTO occupancy, not only on INSERT, so a blanket `is_active = true` over this
-- whole range aborts the seed transaction the moment one of these merchants has
-- a slot held by a row OUTSIDE the range — an `autoreseed` flash deal from
-- reseed_demo_flash_deals() is exactly that, and it is reachable on any database
-- where the hourly flash job has run. Measured: the blanket form raises
-- "Deal limit reached. elite plan allows 2 active deal(s)." and rolls the whole
-- seed back.
--
-- Same construction as refresh_demo_seed_deals():
--   * rows already active are refreshed unconditionally — they hold their own
--     slot and the guard never re-counts an already-occupying row;
--   * inactive rows are activated only within the allowance left after slots
--     held inside and outside this range, oldest id first, so repeat runs pick
--     the same rows and the seed stays idempotent.
WITH in_range AS (
  SELECT d.id,
         d.merchant_id,
         d.is_active,
         CASE WHEN m.tier = 'elite' THEN 2 ELSE 1 END AS cap
    FROM public.deals d
    JOIN public.merchants m ON m.id = d.merchant_id
   WHERE d.id BETWEEN 'd1000000-0000-4000-a000-000000000001'::uuid
                  AND 'd1000000-0000-4000-a000-000000000100'::uuid
),
allowance AS (
  SELECT r.merchant_id,
         MAX(r.cap)
           - COUNT(*) FILTER (WHERE r.is_active)
           - COALESCE((
               SELECT COUNT(*) FROM public.deals o
                WHERE o.merchant_id = r.merchant_id
                  AND o.is_active
                  AND o.id NOT BETWEEN 'd1000000-0000-4000-a000-000000000001'::uuid
                                   AND 'd1000000-0000-4000-a000-000000000100'::uuid
             ), 0) AS slots_left
    FROM in_range r
   GROUP BY r.merchant_id
),
ranked AS (
  SELECT r.id,
         a.slots_left,
         ROW_NUMBER() OVER (PARTITION BY r.merchant_id ORDER BY r.id) AS rn
    FROM in_range r
    JOIN allowance a ON a.merchant_id = r.merchant_id
   WHERE NOT r.is_active
)
UPDATE public.deals d
SET
  starts_at = CASE
    WHEN d.deal_type = 'flash' THEN NOW() - INTERVAL '1 hour'
    ELSE NOW() - INTERVAL '3 hours'
  END,
  expires_at = CASE
    WHEN d.deal_type = 'flash' THEN NOW() + INTERVAL '5 hours'
    ELSE NOW() + INTERVAL '21 hours'
  END,
  is_active = true,
  is_paused = false,
  updated_at = NOW()
WHERE d.id IN (
  SELECT id FROM in_range WHERE is_active
  UNION ALL
  SELECT id FROM ranked WHERE rn <= slots_left
);

COMMIT;

-- Summary (runs after commit)
SELECT
  count(*) FILTER (WHERE deal_type = 'flash') AS flash,
  count(*) FILTER (WHERE boost_active AND deal_type = 'standard') AS boosted,
  count(*) FILTER (WHERE NOT boost_active AND deal_type = 'standard') AS standard,
  count(*) AS total_live
FROM public.deals
WHERE id BETWEEN 'd1000000-0000-4000-a000-000000000001'::uuid
            AND 'd1000000-0000-4000-a000-000000000100'::uuid
  AND is_active
  AND expires_at > NOW();
