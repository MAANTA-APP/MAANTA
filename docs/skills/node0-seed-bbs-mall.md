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
2. Production `DATABASE_URL` — see **Connection string** below.

## Production `DATABASE_URL` (canonical)

Use the **Session pooler** URI (IPv4). Required for cloud agents and any client
without IPv6. Get the password from Supabase → Project settings → Database.

```text
postgresql://postgres.axrrslqssmbngbataejg:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
```

| Part | Value |
|---|---|
| User | `postgres.axrrslqssmbngbataejg` (project ref suffix — **not** bare `postgres`) |
| Host | `aws-0-eu-west-1.pooler.supabase.com` (session pooler, port `5432`) |
| Database | `postgres` |
| Query | `sslmode=require` |

**Wrong on the pooler** (causes `password authentication failed for user "postgres"`):

```text
postgresql://postgres:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Direct host** (`db.axrrslqssmbngbataejg.supabase.co`) is IPv6-only. Use only from
machines with IPv6 (e.g. local laptop with full network). Prefer the pooler URI above.

`DATABASE_URL` is **not** an HTTP app URL or the Supabase REST URL. Do not wrap
the URI in surrounding quotes when setting secrets.

## Apply (operator or agent with `DATABASE_URL`)

One-shot (migrations + seed + verify):

```bash
cd maanta-app
export DATABASE_URL='postgresql://postgres.axrrslqssmbngbataejg:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
./scripts/prod-schema-seed-fixup.sh
```

Or from repo root: `make db-prod-fixup`

Or seed only:

```bash
cd maanta-app
export DATABASE_URL='postgresql://postgres.axrrslqssmbngbataejg:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
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
run this seed. Set `DATABASE_URL` in the Cloud Agent environment (pooler URI
above, no surrounding quotes). Do not paste passwords into chat logs.
