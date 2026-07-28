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

## Nairobi 3-node seed (150 merchants — 2026-07)

For multi-node rehearsal (BBS + CBD Galleria + Westlands Hub), use the newer seed:

```bash
make db-seed-nairobi-150      # 150 merchants + 188 deals
make db-seed-test-accounts    # @maanta.app role accounts
```

Docs: `docs/ops/nodes-nairobi-2026-07.md`, `docs/ops/test-accounts-seed-2026-07.md`,
`docs/ops/role-tasks-nairobi-150-2026-07.md`. Regenerate SQL:
`python3 maanta-app/scripts/generate-nairobi-merchants-seed.py`.
