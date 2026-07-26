# Skill — Production auth + deals recovery (Clerk / Supabase / seed)

**Status:** runtime diagnosis + code hardening (2026-07-26).  
**Surface:** `www.maanta.app` Production on Vercel; Supabase `axrrslqssmbngbataejg`.  
**Related:** `docs/skills/clerk-auth.md`, `docs/ops/supabase-migrations.md`.

## Symptoms (observed)

| Surface | Symptom | Likely cause |
|---|---|---|
| Waitlist / Resend | Emails **Delivered** | Healthy — leave alone |
| `/login` | Claude shell: **Couldn’t load sign-in** | Clerk JS failed after load, or domain/instance mismatch (publishable key *was* present in HTML as `pk_live_…` + `clerk.maanta.app`) |
| `/feed`, `/browse` | **We couldn’t load deals** | Server `getLiveDeals` throws — missing `SUPABASE_*` env, wrong project, **or** `merchants.lat`/`lng` migration not applied while code selects those columns |
| Discover rails empty after fix | Empty state, not error | **100-deal seed never applied** to prod |

## What this cloud agent cannot do

- Vercel MCP and Supabase MCP require interactive auth (`needsAuth`) — cannot read/set Production env or run SQL from here.
- No `DATABASE_URL` in the agent environment — cannot run `./scripts/apply-100-deals-seed.sh` against prod.
- Operator must complete the checklist below (or auth the MCPs in Cursor desktop and re-run).

## Operator checklist (do in order)

### 1. Confirm Vercel Production env

In Vercel → Project → Settings → Environment Variables (**Production**):

| Variable | Must point at |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://axrrslqssmbngbataejg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Live project anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Live project **service_role** (server only) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production Clerk instance (`cheerful-sailfish-3` / custom domain) |
| `CLERK_SECRET_KEY` | Matching **secret** for that same instance |

Redeploy `main` after any change.

### 2. Admin probe (after you can sign in as admin)

```http
GET /api/healthz?detail=1&probe=1
```

Interpret `supabase.reason`:

| reason | Action |
|---|---|
| `missing_env` | Fix Vercel Supabase URL + service role; redeploy |
| `unreachable` | Wrong keys/URL, or project paused — fix credentials |
| `missing_lat_lng` | `supabase db push` / apply `20260726120000_merchant_lat_lng.sql` |
| `ok` | Connectivity fine — seed if rails are empty |

### 3. Apply pending migrations (especially lat/lng)

```bash
cd maanta-app
supabase link --project-ref axrrslqssmbngbataejg
supabase migration list
supabase db push --dry-run
supabase db push
```

Verify:

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260726120000';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'merchants'
  AND column_name IN ('lat', 'lng');
```

### 4. Seed 100 BBS deals (shell or SQL editor — not shell commands pasted as SQL)

```bash
cd maanta-app
export DATABASE_URL='postgresql://…?sslmode=require'  # Primary DB connection string
./scripts/apply-100-deals-seed.sh
```

Or paste `supabase/seed/node0_100_deals_seed.sql` into the Supabase SQL Editor.

Verify:

```sql
SELECT count(*) FROM deals WHERE id::text LIKE 'd1000000-%';
SELECT count(*) FROM merchants WHERE id::text LIKE 'c1000000-%';
SELECT * FROM deals WHERE is_active ORDER BY created_at DESC LIMIT 5;
```

Expect ~100 seeded deals and ~60 seeded merchants (plus any real merchants).

### 5. Clerk custom domain if keys are present but UI still fails

Production HTML already embeds `pk_live_…` and loads  
`https://clerk.maanta.app/npm/@clerk/clerk-js@5/...` (CDN reachable from ops probes).

If `ClerkFailed` persists after redeploy:

1. Clerk Dashboard → Domains: `clerk.maanta.app` healthy; `maanta.app` / `www.maanta.app` allowed.
2. Confirm **Production** instance keys (not Development) in Vercel Production.
3. Confirm `CLERK_SECRET_KEY` matches the publishable key’s instance.
4. Hard-refresh / try a private window (extension blockers can trip `ClerkFailed`).

## Code hardening shipped with this skill

- `getLiveDeals` / `getDeal` / search retry without `lat`/`lng` if those columns are missing (`selectDealsWithMerchants`).
- `createServiceClient` fails clearly when URL or service role is blank.
- Admin `GET /api/healthz?probe=1` reports coarse Supabase readiness.
- `ClerkAuthShell` distinguishes missing publishable key vs load/domain failure.
- Auth shell uses **one** Claude card; Clerk `cardBox`/`card`/`footer` chrome stripped (#91).

These reduce blast radius; they do **not** replace applying the migration or running the seed on prod.

## Clerk domains (if Sign-in still fails with keys present)

In Clerk Dashboard → **Domains** / **Allowed origins**, ensure:

- Frontend: `https://www.maanta.app` and `https://maanta.app`
- Clerk Frontend API / custom: `https://clerk.maanta.app`

Vercel Production must use the **Production** instance keys (`pk_live_…` + matching `sk_live_…`), not Development.

## Preferred language column

Migration `20260726180000_user_preferred_language` adds `users.preferred_language`
(`en` | `sw`). Push with other pending migrations before language preference
persists. Profile UI still works if the column is missing (defaults to English).

## Seed detail

See `docs/skills/node0-seed-bbs-mall.md` for apply + verify SQL.
