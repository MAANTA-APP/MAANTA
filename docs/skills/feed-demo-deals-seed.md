# Skill — Feed demo deals seed (2026-07-25)

## Purpose
Populate production/staging `/feed` with 100 demo deals at **BBS Mall** so the
shopper rails are not empty during launch demos.

## Counts
| Rail | DB shape | Count |
|---|---|---|
| Flash Deals | `deals.deal_type = 'flash'` | 20 |
| Boosted Deals | `deal_type = 'standard'` + `boost_active = true` | 30 |
| Deals Near Me | `deal_type = 'standard'` + `boost_active = false` | 50 |

## Tables / columns
- `public.users` — one `merchant_admin` per seeded shop (`seed-feed-N@demo.maanta.local`)
- `public.merchants` — `node = 'BBS Mall'`, `status = 'active'`, `account_balance = 5000`
  - Merchants 1–10: `tier = 'elite'` (two flash deals each)
  - Merchants 11–90: `tier = 'standard'` (one deal each)
- `public.deals` — `node = 'BBS Mall'`, titles prefixed `[SEED]`, fixed UUIDs `d0000000-…-be00-…`

## Run (operator only)
```bash
cd maanta-app
export NEXT_PUBLIC_SUPABASE_URL="https://axrrslqssmbngbataejg.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="…"   # from dashboard, never commit
npm install   # once, for tsx
npm run db:seed:deals
```

Re-run refreshes `starts_at` / `expires_at`. Wipe first with `--clean`.

## Feed query limit
`getLiveDeals` limit raised to 120 so all 100 seeded deals can load in one fetch.
