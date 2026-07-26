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

## Live windows

Re-running the seed **refreshes** `starts_at` / `expires_at` so flash deals
are live for ~5h and standard/boosted for ~21h from apply time (Nairobi “now”
via Postgres `NOW()`). Safe to re-apply anytime rails go empty after expiry.

## Env (Vercel Production) — names only

| Area | Variables |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Resend | `RESEND_API_KEY` (+ any from-address vars already used for waitlist) |
| Seed only (local/CI) | `DATABASE_URL` — Postgres URI for `axrrslqssmbngbataejg`, `sslmode=require` |

`NEXT_PUBLIC_SUPABASE_URL` must be `https://axrrslqssmbngbataejg.supabase.co`.

## Agent note

Cloud agents without `DATABASE_URL` / unauthenticated Supabase MCP **cannot**
run this seed. Paste the connection string when prompted; do not paste it into chat
logs permanently.
