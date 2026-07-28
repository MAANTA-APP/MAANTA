# Browse vs Map (July 2026)

## Separation

- **Browse** (`/browse`) is list/grid only: sort, filter, search, time chips, deal cards.
- **Map** (`/map`) is a dedicated shopper persona (bottom nav + top-bar “Map” link).
- Deal detail “View on map” deep-links to `/map?lat=&lng=&dealId=`.
- Feed “Map ›” links to `/map`, not Browse.

Do not re-embed Leaflet inside Browse. The shared `BrowseMap` component lives under
`src/components/browse/browse-map.tsx` for the Map route only.

## Seeded data visibility (after sign-in)

Once a persona lands via `/app-bootstrap` (shopper → `/feed`, merchant →
`/merchant/dashboard`, admin → `/admin`, agent → `/agent`, founder → `/founder`):

| Surface | Expectation |
|---------|-------------|
| Shopper Feed / Browse / Map | Live deals from `getLiveDeals` for the selected node (`maanta_node`, default BBS Mall) — caps sized for elite seed (100 flash + 100 standard) plus node0 inventory |
| Merchant dashboard / deals | Rows for that merchant’s `merchant_id` (test Merchant A/B + any owned seed shops) |
| Admin merchants / billing | Directory limits ≥ 300 so 100 elite + rehearsal merchants appear |
| Admin deals | Flagged-moderation list only (unchanged IA) |
| Agent | Lead + onboarded-merchant candidates (cap raised for seed volume) |

Lifecycle still applies: `status = active`, `is_visible`, not shadow-banned, `is_active`, unexpired. Pending elite seed merchants (every 23rd) stay in admin approval, not the shopper feed.

Apply seeds with `make db-seed-elite` / test-accounts scripts when available (see `docs/skills/elite-merchants-seed.md` / `docs/ops/test-accounts-seed-2026-07.md` on the seed PR).
