# Skill — Node 0 BBS Mall 100-deal seed

**Status:** SQL + apply script on `main`; **must be executed against prod**  
(`axrrslqssmbngbataejg`) before Discover/Browse feel live.  
**Related:** `docs/ops/supabase-migrations.md` §4, `docs/skills/prod-auth-deals-recovery.md`.

## What it creates

| Entity | Count | Notes |
|---|---|---|
| Demo merchant users | 60 | `b1000000-…` UUIDs, `merchant_admin` |
| Merchants | 60 | 40 Elite + 20 Standard, BBS Mall, visible/active |
| Deals | 100 | 15 flash · 20 boosted · 65 standard |
| GPS | 60 | `lat`/`lng` near mall centroid when columns exist |

Idempotent: re-run refreshes expiry windows + GPS; does not duplicate fixed UUIDs.

## Prerequisites

1. Migrations applied, especially `20260726120000_merchant_lat_lng`.
2. Production `DATABASE_URL` (Supabase → Database → Connection string URI, `sslmode=require`).

## Apply (operator or agent with `DATABASE_URL`)

`DATABASE_URL` must be the **Postgres** URI from Supabase → Database → Connection string
(host `db.<project-ref>.supabase.co`, user `postgres`, `sslmode=require`).
It is **not** an HTTP app URL or the Supabase REST URL.

One-shot (migrations + seed + verify):

```bash
cd maanta-app
export DATABASE_URL='postgresql://…?sslmode=require'
./scripts/prod-schema-seed-fixup.sh
```

Or seed only:

```bash
cd maanta-app
export DATABASE_URL='postgresql://…?sslmode=require'
./scripts/apply-100-deals-seed.sh
```

Or paste `supabase/seed/node0_100_deals_seed.sql` into the SQL Editor  
(**not** shell commands).

## Verify

```sql
SELECT count(*) FROM merchants WHERE id::text LIKE 'c1000000-%';  -- ~60
SELECT count(*) FROM deals     WHERE id::text LIKE 'd1000000-%';  -- ~100
SELECT deal_type, boost_active, count(*) FROM deals
WHERE id::text LIKE 'd1000000-%'
GROUP BY 1, 2;
```

Then open `https://www.maanta.app/feed` and `/browse` with location **BBS Mall**.

## Agent note

Cloud agents without `DATABASE_URL` / unauthenticated Supabase MCP **cannot**
run this seed. Paste the connection string when prompted; do not paste it into chat
logs permanently.

## Validation record (2026-07-26)

The seed was replayed end-to-end against an ephemeral local Postgres 16 using the
**verbatim** table + trigger definitions from the real migrations
(`merchants`, `deals`, `tier_flags`, `users`, plus `set_deal_expiry`,
`enforce_deal_limit`, `enforce_zero_balance_gate`, and the later
`price_kes`/`compare_at_kes`/`charges`/`is_paused`/`lat`/`lng`/`outstanding_arrears`
column adds). Results:

| Check | Result |
|---|---|
| Merchants inserted | **60** (40 Elite + 20 Standard) |
| Deals inserted | **100** — 15 flash · 20 boosted · 65 standard |
| Trigger violations (`tier_flags` rows) | **0** — distribution honours Elite ≤2 / Standard ≤1 / flash Elite-only |
| Zero-balance gate | passes — seeded balances 1 500 (Elite) / 400 (Standard) |
| Idempotency (2nd run) | `INSERT 0 0` on users, merchants, deals; counts unchanged at 60 / 100 |
| Live universe (`is_active ∧ expires_at>now() ∧ node='BBS Mall' ∧ public merchant`) | **100** deals qualify |
| `getLiveDeals` (feed cap 60) grouping | 15 flash + 20 boosted + 25 near-me = 60 — all three rails populated |
| GPS coverage / bounding box | 60 merchants; lat ∈ [−1.27550, −1.27388], lng ∈ [36.84944, 36.85076] — tight cluster on BBS Mall, Eastleigh |
| Expiry windows | flash ≈ 5 h left · standard ≈ 21 h left (all live now, Nairobi) |
| YOU PAY sanity | 0 deals with `price_kes >= compare_at_kes` |

The live-deal contract mirrored from `src/lib/data.ts` (`getLiveDeals` +
`withPublicMerchant`) is: `deals.is_active = true`, `deals.expires_at > now()`,
`deals.node = 'BBS Mall'`, and merchant `status = 'active' AND is_visible AND NOT
is_shadow_banned`. The seed satisfies all of these on both first run and re-run.

> Note: the shopper feed itself caps at 60 deals (`.limit(60)`, `created_at DESC`),
> so ~60 of the 100 render at once — by design. Browse and Discover draw from the
> same live set; all 100 remain claimable.
