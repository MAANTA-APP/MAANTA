# Browse map + list filters

Last updated: 2026-07-30

## Browse (`/browse`) — map + list

Per Discover/Browse/w3w plan: Leaflet map on top, deal-card list below
filtered to the current map viewport.

### Filters (over map)

| Control | Values | Behaviour |
|---|---|---|
| Rail | All / Flash / Boosted / Standard | Deal rail type |
| Time | Any time / Collect now / Today | Live window / calendar day |

Search box filters pins + list by title/merchant. Full `/search` stays reachable
from the header icon.

### Deep links

`/browse?lat=&lng=&dealId=` centers and highlights a pin (deal detail
“View on map”). `/map?…` redirects here with the same query.

### Bottom nav

Search → **Browse**. Separate Map tab removed; Browse is the map+list surface.

## Code pointers

- Page: `src/app/(shopper)/browse/page.tsx`
- Client: `src/components/browse/browse-client.tsx`
- Map: `src/components/browse/browse-map.tsx`
- Filter helpers: `src/lib/browse.ts` (`filterBrowseDeals`, `dealsToPins`, bounds)
- Map alias redirect: `src/app/(shopper)/map/page.tsx`
