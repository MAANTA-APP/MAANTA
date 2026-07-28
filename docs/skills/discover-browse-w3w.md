# Skills: Discover / Browse / what3words precision

Last updated: 2026-07-26 · Status: **shipped in code** (apply migration + `W3W_API_KEY` before deploy).

## What shipped

TGTG-style Discover rails on `/feed`, a Leaflet Browse map+list on `/browse`,
and merchant GPS (`lat`/`lng`) alongside the existing `what3words_address`
string for precision pickup.

## Data model

- Migration: `maanta-app/supabase/migrations/20260726120000_merchant_lat_lng.sql`
  - `merchants.lat` / `merchants.lng` (nullable pair constraint)
  - `merchants_public_browse` exposes `lat`, `lng`
- Column name stays **`what3words_address`** (not `w3w_address`).
- Nodes stay in app registry [`src/lib/nodes.ts`](../../maanta-app/src/lib/nodes.ts)
  with centroid `lat`/`lng` for BBS Mall (no `nodes` table).

## what3words (server-only)

- Util: [`maanta-app/src/lib/what3words.ts`](../../maanta-app/src/lib/what3words.ts)
  - `convertToCoordinates(w3w)` → typed ok/error
  - `convertTo3Words(lat, lng)` → typed ok/error
  - Legacy `convertWhat3WordsToCoordinates` kept for claim geofence
- Env: **`W3W_API_KEY`** (already in `.env.example`). Never `NEXT_PUBLIC_`.
- Call sites that hit the API:
  - `GET /api/w3w/validate` (onboarding)
  - `POST /api/admin/merchants/[id]/location` (admin backfill)
- Shopper UI reads **stored** `lat`/`lng`/`what3words_address` only.

## Discover (`/feed`)

- Data: `getLiveDeals(node)` → flash / boosted / nearMe (`getLiveDeals` unchanged partition).
- Favourites rail: `getFavouriteMerchantIds` × live deals (`merchant_favourites`).
- Cards: `DiscoverDealCard` (distance via Haversine from node centroid when GPS present).
- Location pill: `ShopperTopBar` “Current location: {mall}”.

## Browse (`/browse`)

- Leaflet + OSM (no Mapbox key). `react-leaflet@4` for React 18.
- Filters: rail type (All/Flash/Boosted/Standard) + Collect now / Today.
- List synced to map viewport bounds (`lib/browse.ts` helpers).
- Deep link: `/map?lat=&lng=&dealId=` from deal detail “View on map” (legacy `/browse?lat=…` redirects to `/map`).
- Bottom nav: Search tab → **Browse** (`/search` remains via header icon on Browse).

## Onboarding / admin

- Wizard forwards `lat`/`lng` from validate → onboard route updates after RPC insert.
- Admin merchant detail: `MerchantLocationForm` (w3w → coords, or coords → optional reverse words).

## Deploy checklist

1. Set `W3W_API_KEY` in Vercel + local `.env`.
2. Apply `20260726120000_merchant_lat_lng.sql`.
3. Admin-set location (or re-onboard) for merchants missing GPS so pins/distances appear.
4. Smoke `/feed`, `/browse`, deal detail “View on map”.

## Tests

- `src/lib/__tests__/what3words.test.ts`
- `src/lib/__tests__/browse.test.ts`
- `src/components/__tests__/discover-deal-card.test.ts`
