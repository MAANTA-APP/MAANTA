# Browse filters and Map separation

Last updated: 2026-07-28

## Browse chips (`/browse`)

The chip row replaces the legacy **Any time** control with focused filters. Chips are **single-select**; tap an active chip again to clear back to showing all deals.

| Chip | Behaviour |
|---|---|
| **Ending soon** | Live deals expiring within **6 hours** (aligned with flash deal windows) |
| **Flash** | Deals on the flash rail (`deal_type = flash`) |
| **Favourites** | Deals from merchants the signed-in user has saved (same source as My deals / saved shops) |
| **Live now** | Deals currently running (started, not past grace) |
| **Today** | Deals overlapping today's local calendar day |

Sort and Filter dropdowns (Nearest, Flash rail, etc.) still apply via URL params (`?sort=&filter=`) and stack with the active chip.

## Browse vs Map

| Surface | Route | Experience |
|---|---|---|
| **Browse** | `/browse` | List/grid only — node header, search, chips, deal cards. No embedded map. |
| **Map** | `/map` | Full-screen map with pins, bounds filtering, and legacy **Any time / Live now / Today** time chips. |

The **Map** link in the shopper top bar (`ShopperTopBar`) navigates to `/map`. Browse empty states use list-focused copy:

> 0 deals match your filters here · try adjusting filters or switching node.

## Code pointers

- Chips + list: `src/components/browse/browse-client.tsx`
- Filter logic: `src/lib/browse.ts` (`BrowseChipFilter`, `filterBrowseDeals`)
- Standalone map: `src/app/(shopper)/map/map-client.tsx`
- Shared map component: `src/components/browse/browse-map.tsx` (Map route only)
