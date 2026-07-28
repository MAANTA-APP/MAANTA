#!/usr/bin/env python3
"""Generate nairobi_nodes_150_merchants.sql — 150 synthetic merchants across 3 Nairobi nodes."""

from __future__ import annotations

import textwrap
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / "supabase/seed/nairobi_nodes_150_merchants.sql"

# Node layout: (name, slug, lat, lng, merchant_count, elite_count)
NODES = [
    ("BBS Mall", "bbs_mall", -1.2746, 36.8501, 60, 30),
    ("CBD Galleria", "cbd_galleria", -1.2864, 36.8172, 45, 15),
    ("Westlands Hub", "westlands_hub", -1.2674, 36.8075, 45, 15),
]

MERCHANT_NAMES = [
    "Eastleigh Spices", "Habibi Grill", "Soma Books", "Nairobi Threads", "Baraka Electronics",
    "Savanna Shoes", "Qorax Fashion", "Milk & Honey Café", "Amal Perfumes", "Juba Cuts",
    "Wajir Fresh", "Dirac House", "Gold Line Watches", "Coastal Snacks", "Horizon Optics",
    "Safari Prints", "Kismayo Kitchen", "Pearl Beauty", "Talisman Gifts", "City Phone Hub",
    "Nomad Leather", "Bloom Florist", "Starlight Fabrics", "Yasmin Sweets", "Atlas Sports",
    "Moonlight Henna", "Riverbank Tea", "Orchid Salon", "Mogadishu Fashion", "Lantern Home",
    "Cedar Pharmacy", "Summit Gadgets", "Oasis Juice", "Velvet Scarves", "Palm Dates Co",
    "Northgate Tailor", "Amber Lights", "Copper Pot", "Silk Road Bags", "Breeze Laundry",
    "Green Plate", "Ivory Beads", "Compass Travel", "Dune Desserts", "Echo Music",
    "Flame Grill", "Garden Fresh", "Harbor Fish", "Ivory Dental", "Jade Jewelry",
    "Karma Yoga", "Lotus Spa", "Maple Bakery", "Nest Homeware", "Olive Oil House",
    "Pepper Pot", "Quartz Clocks", "Rose Attar", "Saffron Mart", "Tulip Kids",
    "Urban Brew", "Violet Lane", "Willow Crafts", "Xenon Tech", "Yellow Door",
    "Zebra Prints", "Acacia Market", "Bamboo House", "Coral Bay", "Delta Shoes",
    "Ember Kitchen", "Falcon Optics", "Granite Home", "Harbor Spice", "Indigo Lane",
    "Juniper Spa", "Kite Surf Co", "Lumen Books", "Mosaic Gifts", "Nova Fitness",
    "Opal Beauty", "Prism Audio", "Quill Stationery", "Ridge Outfitters", "Slate Café",
    "Terra Plants", "Umber Tailor", "Vista Travel", "Wheat & Honey", "Xylia Jewels",
    "Yonder Market", "Zenith Phones", "Aloe Wellness", "Brook Bakery", "Citrus Bar",
    "Drift Denim", "Elmwood Home", "Fjord Fish", "Grove Market", "Haven Salon",
    "Iris Optics", "Jade Garden", "Kite Kids", "Lark Music", "Meadow Tea",
    "Nimbus Tech", "Onyx Barbers", "Pine Crafts", "Quest Books", "Ripple Juice",
    "Sage Pharmacy", "Thistle Gifts", "Uplift Yoga", "Vale Market", "Wren Café",
    "Yarrow Fabrics", "Zest Kitchen", "Apex Sports", "Bliss Spa", "Canyon Gear",
    "Dawn Bakery", "Echo Lane", "Fable Books", "Glimmer Jewels", "Hearth Home",
    "Inlet Fish", "Juniper Lane", "Kestrel Optics", "Luna Beauty", "Mirth Market",
    "Nectar Bar", "Olive Lane", "Prairie Tea", "Quartz Lane", "Ridge Market",
    "Summit Lane", "Tidal Spa", "Umber Lane", "Vivid Tech", "Willow Lane",
    "Xenon Lane", "Yonder Lane", "Zephyr Lane", "Amber Lane", "Breeze Lane",
    "Cedar Lane", "Delta Lane", "Ember Lane", "Fjord Lane", "Grove Lane",
    "Haven Lane", "Iris Lane", "Jade Lane", "Kite Lane", "Lark Lane",
]

CATEGORIES = [
    "restaurant", "grocery", "fashion", "electronics", "services",
    "beauty", "pharmacy", "books", "sports", "home",
]

W3W = [
    "stored.riches.shine", "lively.scent.corner", "market.square.entry", "bright.mango.lane",
    "calm.river.gate", "fresh.olive.path", "golden.spice.walk", "happy.lemon.yard",
    "ivory.palm.court", "jolly.cedar.row", "kind.amber.hall", "lunar.peach.bay",
    "mint.coral.dock", "noble.wheat.farm", "open.silver.mew", "proud.tiger.den",
    "quiet.umbra.vale", "rapid.violet.cove", "sunny.willow.glen", "tidal.xenon.peak",
]

FLOORS = ["Ground Floor", "1st Floor", "2nd Floor", "Food Court"]

DEAL_TITLES_FLASH = [
    "Flash: 2-for-1 samosas tray", "Flash: free juice with any wrap", "Flash: buy 2 get 1",
    "Flash: 40% off summer tees", "Flash: earbuds flash drop", "Flash: sneakers 30% off",
    "Flash: dirac evening cut", "Flash: latte + pastry hour", "Flash: oud sample trio",
    "Flash: fade + beard trim", "Flash: mango crate today", "Flash: abaya flash rack",
]

DEAL_TITLES_BOOST = [
    "Boosted: family grill platter", "Boosted: weekend spice bundle", "Boosted: school starter pack",
    "Boosted: denim + shirt combo", "Boosted: phone case bundle", "Boosted: school shoes deal",
    "Boosted: hijab 3-pack", "Boosted: brunch for two", "Boosted: perfume gift set",
    "Boosted: kids cut special", "Boosted: weekly veggie box", "Boosted: prayer set bundle",
]

DEAL_TITLES_STANDARD = [
    "Weekend lunch special", "Midweek bundle deal", "Store favourite pick",
    "Seasonal offer", "Counter special today", "Member value deal",
    "Fresh arrival discount", "Clearance corner pick", "Daily value meal",
    "Shopper favourite", "Limited window offer", "In-store only deal",
]

# 40 elite merchants (global index 1-based) get flash + boost
HIGHLY_ACTIVE_ELITE = set(range(1, 25)) | set(range(61, 69)) | set(range(106, 114))

# Lifecycle overrides: merchant index -> (status, onboarded_days_ago or None for pending)
LIFECYCLE_OVERRIDES: dict[int, tuple[str, int | None]] = {
    58: ("pending", None),       # BBS waitlist
    59: ("active", 75),          # BBS churn-risk (no live deals — handled separately)
    104: ("pending", None),      # CBD waitlist
    149: ("active", 80),         # Westlands churn-risk
}


def merchant_node(n: int) -> tuple[str, float, float, int]:
    """Return (node_name, lat, lng, index_within_node) for merchant n (1-based)."""
    offset = 0
    for name, _slug, lat, lng, count, _elite in NODES:
        if n <= offset + count:
            return name, lat, lng, n - offset
        offset += count
    raise ValueError(f"merchant index {n} out of range")


def is_elite(n: int) -> bool:
    offset = 0
    for _name, _slug, _lat, _lng, count, elite_count in NODES:
        if n <= offset + count:
            local = n - offset
            return local <= elite_count
        offset += count
    return False


def uuid_prefix(kind: str, n: int) -> str:
    return f"{kind}2000000-0000-4000-a000-{n:012d}"


def svg_url(title: str, color: str, node: str, price: int) -> str:
    safe = title[:28].replace("&", "%26").replace('"', "")
    return (
        f"data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" "
        f"viewBox=\"0 0 400 300\"><rect width=\"400\" height=\"300\" fill=\"%23{color}\"/>"
        f"<text x=\"200\" y=\"145\" font-family=\"sans-serif\" font-size=\"22\" "
        f"font-weight=\"bold\" fill=\"white\" text-anchor=\"middle\">{safe}</text>"
        f"<text x=\"200\" y=\"185\" font-family=\"sans-serif\" font-size=\"16\" "
        f"fill=\"white\" text-anchor=\"middle\">{node} · YOU PAY KES {price}</text></svg>"
    )


def generate() -> str:
    lines: list[str] = [
        "-- ============================================================================",
        "-- MAANTA Nairobi 3-node seed — 150 merchants + deals",
        "--",
        "-- Nodes: BBS Mall (60), CBD Galleria (45), Westlands Hub (45)",
        "-- Tiers: 60 elite + 90 standard",
        "-- Deals: 40 elite with flash+boost, 20 elite standard-only, 90 standard merchants",
        "--",
        "-- Generated by scripts/generate-nairobi-merchants-seed.py — do not edit by hand.",
        "-- Re-generate: python3 scripts/generate-nairobi-merchants-seed.py",
        "--",
        "-- Apply: make db-seed-nairobi-150  (or psql -f this file)",
        "-- UUID namespace: b2000000 users · c2000000 merchants · d2000000 deals",
        "-- ============================================================================",
        "",
    ]

    user_insert = textwrap.dedent("""
        INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
        SELECT
          ('b2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
          NULL,
          '+25471' || lpad((2000000 + n)::text, 7, '0'),
          'seed.nairobi' || lpad(n::text, 3, '0') || '@maanta.app',
          'Nairobi Seed ' || lpad(n::text, 3, '0'),
          'merchant_admin'
        FROM generate_series(1, 150) AS n
        WHERE NOT EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = ('b2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
        );
    """).strip()
    lines.append("BEGIN;")
    lines.append("")
    lines.append("-- 1. Demo merchant users (no auth — browse-only unless linked via test accounts seed)")
    lines.append(user_insert)
    lines.append("")

    merchant_insert = textwrap.dedent("""
        INSERT INTO public.merchants (
          id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at,
          node, what3words_address, mall_name, floor, unit_number, entrance_notes,
          phone, email, whatsapp, account_balance, outstanding_arrears,
          is_visible, is_shadow_banned, onboarded_at
        )
        SELECT
          ('c2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
          ('b2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
          name,
          CASE WHEN elite THEN 'elite' ELSE 'standard' END,
          COALESCE(status, 'active'),
          elite AND COALESCE(status, 'active') = 'active',
          CASE WHEN elite AND COALESCE(status, 'active') = 'active' THEN NOW() + INTERVAL '30 days' END,
          node_name,
          w3w,
          node_name,
          floor,
          chr(65 + ((n - 1) % 26)) || '-' || lpad(((n - 1) % 40 + 1)::text, 2, '0'),
          'Synthetic seed shop — ask for Maanta pickup',
          '+25471' || lpad((2000000 + n)::text, 7, '0'),
          'seed.nairobi' || lpad(n::text, 3, '0') || '@maanta.app',
          '+25471' || lpad((2000000 + n)::text, 7, '0'),
          CASE WHEN elite THEN 1500.00 ELSE 400.00 END,
          0,
          COALESCE(status, 'active') = 'active',
          false,
          CASE
            WHEN status = 'pending' THEN NULL
            WHEN days IS NOT NULL THEN NOW() - (days || ' days')::interval
            ELSE NOW() - INTERVAL '2 days'
          END
        FROM (
          SELECT
            n,
            (ARRAY[{names}])[n] AS name,
            {elite_expr} AS elite,
            {node_expr} AS node_name,
            (ARRAY[{w3w}])[1 + ((n - 1) % {w3w_len})] AS w3w,
            (ARRAY[{floors}])[1 + ((n - 1) % 4)] AS floor,
            ov.status,
            ov.days
          FROM generate_series(1, 150) AS n
          LEFT JOIN LATERAL (
            SELECT
              CASE n {override_cases} END AS status,
              CASE n {days_cases} END AS days
          ) ov ON true
        ) src
        WHERE NOT EXISTS (
          SELECT 1 FROM public.merchants m
          WHERE m.id = ('c2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
        );
    """)

    # Build elite expression
    elite_parts = []
    offset = 0
    for name, _slug, _lat, _lng, count, elite_count in NODES:
        start = offset + 1
        end = offset + count
        elite_parts.append(
            f"WHEN n BETWEEN {start} AND {end} THEN n <= {offset + elite_count}"
        )
        offset += count
    elite_expr = "CASE " + " ".join(elite_parts) + " ELSE false END"

    node_parts = []
    offset = 0
    for name, _slug, _lat, _lng, count, _elite in NODES:
        start = offset + 1
        end = offset + count
        node_parts.append(f"WHEN n BETWEEN {start} AND {end} THEN '{name}'")
        offset += count
    node_expr = "CASE " + " ".join(node_parts) + " END"

    override_cases = " ".join(
        f"WHEN {idx} THEN '{status}'::text" for idx, (status, _days) in LIFECYCLE_OVERRIDES.items()
    )
    days_cases = " ".join(
        f"WHEN {idx} THEN {days}" for idx, (_status, days) in LIFECYCLE_OVERRIDES.items() if days is not None
    )

    names_sql = ", ".join(f"'{n}'" for n in MERCHANT_NAMES[:150])
    w3w_sql = ", ".join(f"'{w}'" for w in W3W)
    floors_sql = ", ".join(f"'{f}'" for f in FLOORS)

    lines.append(
        merchant_insert.format(
            names=names_sql,
            elite_expr=elite_expr,
            node_expr=node_expr,
            w3w=w3w_sql,
            w3w_len=len(W3W),
            floors=floors_sql,
            override_cases=override_cases or "WHEN false THEN NULL",
            days_cases=days_cases or "WHEN false THEN NULL",
        ).strip()
    )
    lines.append("")

    # GPS update
    lines.append(textwrap.dedent("""
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'lat'
          ) THEN
            UPDATE public.merchants m
            SET
              lat = CASE
                WHEN n BETWEEN 1 AND 60 THEN -1.2746 + ((n % 10) - 5) * 0.00018
                WHEN n BETWEEN 61 AND 105 THEN -1.2864 + ((n % 10) - 5) * 0.00018
                ELSE -1.2674 + ((n % 10) - 5) * 0.00018
              END,
              lng = CASE
                WHEN n BETWEEN 1 AND 60 THEN 36.8501 + ((n % 7) - 3) * 0.00022
                WHEN n BETWEEN 61 AND 105 THEN 36.8172 + ((n % 7) - 3) * 0.00022
                ELSE 36.8075 + ((n % 7) - 3) * 0.00022
              END,
              updated_at = NOW()
            FROM generate_series(1, 150) AS n
            WHERE m.id = ('c2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid;
          END IF;
        END $$;
    """).strip())
    lines.append("")

    # Build deal catalogue
    deals: list[tuple[int, int, str, str, bool, int, int, str]] = []
    deal_n = 0
    churn_no_deal = {59, 149}  # churn-risk merchants get expired deal only

    for n in range(1, 151):
        if n in {58, 104}:  # waitlist — no deals
            continue
        node_name, _, _, _ = merchant_node(n)
        elite = is_elite(n)

        if n in churn_no_deal:
            deal_n += 1
            deals.append((
                deal_n, n,
                "Expired: previous season offer",
                "standard", False, 500, 800, "4b5563"
            ))
            continue

        if elite and n in HIGHLY_ACTIVE_ELITE:
            deal_n += 1
            deals.append((
                deal_n, n,
                DEAL_TITLES_FLASH[(n - 1) % len(DEAL_TITLES_FLASH)],
                "flash", False,
                350 + (n % 20) * 50, 700 + (n % 20) * 80, "b45309"
            ))
            deal_n += 1
            deals.append((
                deal_n, n,
                DEAL_TITLES_BOOST[(n - 1) % len(DEAL_TITLES_BOOST)],
                "standard", True,
                800 + (n % 15) * 100, 1200 + (n % 15) * 150, "0f766e"
            ))
        elif elite:
            deal_n += 1
            deals.append((
                deal_n, n,
                DEAL_TITLES_STANDARD[(n - 1) % len(DEAL_TITLES_STANDARD)],
                "standard", False,
                600 + (n % 12) * 80, 900 + (n % 12) * 120, "334155"
            ))
        else:
            deal_n += 1
            deals.append((
                deal_n, n,
                DEAL_TITLES_STANDARD[(n - 1) % len(DEAL_TITLES_STANDARD)],
                "standard", False,
                400 + (n % 10) * 60, 650 + (n % 10) * 90, "334155"
            ))

    deal_values = []
    for d in deals:
        deal_n, merchant_n, title, deal_type, boost, price, compare, color = d
        safe_title = title.replace("'", "''")
        deal_values.append(
            f"({deal_n}, {merchant_n}, '{safe_title}', '{deal_type}', {str(boost).lower()}, "
            f"{price}, {compare}, {1 if deal_type == 'flash' else 3}, '{color}')"
        )

    lines.append("-- 3. Deals catalogue")
    lines.append("WITH catalogue AS (")
    lines.append("  SELECT * FROM (VALUES")
    lines.append(",\n".join(f"    {v}" for v in deal_values))
    lines.append("  ) AS t(deal_n, merchant_n, title, deal_type, boost, price, compare, hours_ago, color)")
    lines.append(")")
    lines.append("INSERT INTO public.deals (")
    lines.append("  id, merchant_id, node, title, description, image_url,")
    lines.append("  discount_type, discount_value, deal_type, flash_duration_hours,")
    lines.append("  is_active, boost_active, max_claims, claims_count, starts_at,")
    lines.append("  price_kes, compare_at_kes, charges")
    lines.append(")")
    lines.append("SELECT")
    lines.append("  ('d2000000-0000-4000-a000-' || lpad(c.deal_n::text, 12, '0'))::uuid,")
    lines.append("  ('c2000000-0000-4000-a000-' || lpad(c.merchant_n::text, 12, '0'))::uuid,")
    lines.append("  m.node,")
    lines.append("  c.title,")
    lines.append("  'Synthetic Nairobi seed deal — show Maanta code at counter.',")
    lines.append("  'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\">"
                 "<rect width=\"400\" height=\"300\" fill=\"%23' || c.color || '\"/>"
                 "<text x=\"200\" y=\"145\" font-family=\"sans-serif\" font-size=\"20\" fill=\"white\" "
                 "text-anchor=\"middle\">' || replace(left(c.title, 26), '&', '%26') || '</text></svg>',")
    lines.append("  'fixed',")
    lines.append("  GREATEST(c.compare - c.price, 0),")
    lines.append("  c.deal_type,")
    lines.append("  6,")
    lines.append("  CASE WHEN c.merchant_n IN (59, 149) THEN false ELSE true END,")
    lines.append("  c.boost,")
    lines.append("  CASE WHEN c.deal_type = 'flash' THEN 12 ELSE 25 END,")
    lines.append("  0,")
    lines.append("  CASE")
    lines.append("    WHEN c.merchant_n IN (59, 149) THEN NOW() - INTERVAL '69 days'")
    lines.append("    WHEN c.deal_type = 'flash' THEN NOW() - INTERVAL '1 hour'")
    lines.append("    ELSE NOW() - INTERVAL '3 hours'")
    lines.append("  END,")
    lines.append("  c.price::numeric,")
    lines.append("  c.compare::numeric,")
    lines.append("  '[]'::jsonb")
    lines.append("FROM catalogue c")
    lines.append("JOIN public.merchants m ON m.id = ('c2000000-0000-4000-a000-' || lpad(c.merchant_n::text, 12, '0'))::uuid")
    lines.append("WHERE NOT EXISTS (")
    lines.append("  SELECT 1 FROM public.deals d")
    lines.append("  WHERE d.id = ('d2000000-0000-4000-a000-' || lpad(c.deal_n::text, 12, '0'))::uuid")
    lines.append(")")
    lines.append("ORDER BY c.merchant_n, c.deal_n;")
    lines.append("")

    # Refresh live deals on re-run
    lines.append(textwrap.dedent("""
        UPDATE public.deals d
        SET
          starts_at = CASE
            WHEN d.merchant_id IN (
              SELECT id FROM public.merchants WHERE id = ('c2000000-0000-4000-a000-000000000059'::uuid)
                 OR id = ('c2000000-0000-4000-a000-000000000149'::uuid)
            ) THEN d.starts_at
            WHEN d.deal_type = 'flash' THEN NOW() - INTERVAL '1 hour'
            ELSE NOW() - INTERVAL '3 hours'
          END,
          expires_at = CASE
            WHEN d.merchant_id IN (
              'c2000000-0000-4000-a000-000000000059'::uuid,
              'c2000000-0000-4000-a000-000000000149'::uuid
            ) THEN d.expires_at
            WHEN d.deal_type = 'flash' THEN NOW() + INTERVAL '5 hours'
            ELSE NOW() + INTERVAL '21 hours'
          END,
          is_active = CASE
            WHEN d.merchant_id IN (
              'c2000000-0000-4000-a000-000000000059'::uuid,
              'c2000000-0000-4000-a000-000000000149'::uuid
            ) THEN false
            ELSE true
          END,
          is_paused = false,
          updated_at = NOW()
        WHERE d.id >= 'd2000000-0000-4000-a000-000000000001'::uuid
          AND d.id <= 'd2000000-0000-4000-a000-000000000999'::uuid;

        COMMIT;

        -- Summary
        SELECT node, tier, count(*) AS merchants
        FROM public.merchants
        WHERE id >= 'c2000000-0000-4000-a000-000000000001'::uuid
          AND id <= 'c2000000-0000-4000-a000-000000000150'::uuid
        GROUP BY node, tier
        ORDER BY node, tier;

        SELECT
          m.node,
          count(*) FILTER (WHERE d.deal_type = 'flash' AND d.is_active AND d.expires_at > NOW()) AS flash,
          count(*) FILTER (WHERE d.boost_active AND d.deal_type = 'standard' AND d.is_active AND d.expires_at > NOW()) AS boosted,
          count(*) FILTER (WHERE NOT d.boost_active AND d.deal_type = 'standard' AND d.is_active AND d.expires_at > NOW()) AS standard,
          count(*) FILTER (WHERE d.is_active AND d.expires_at > NOW()) AS total_live
        FROM public.deals d
        JOIN public.merchants m ON m.id = d.merchant_id
        WHERE d.id >= 'd2000000-0000-4000-a000-000000000001'::uuid
        GROUP BY m.node
        ORDER BY m.node;
    """).strip())

    return "\n\n".join(lines) + "\n"


def main() -> None:
    sql = generate()
    OUTPUT.write_text(sql, encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(sql):,} bytes)")


if __name__ == "__main__":
    main()
