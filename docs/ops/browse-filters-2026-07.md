# Browse filters and Map separation

Last updated: 2026-07-28

## Browse chips (`/browse`)

The chip row replaces the legacy **Any time** control with focused filters. Chips are **single-select**, persisted in `?chip=`, and **mutually exclusive** with the Filter dropdown (rail type). Tap an active chip again to clear it.

| Chip | URL value | Behaviour |
|---|---|---|
| **Expiring soon** | `ending_soon` | Live deals expiring within **6 hours** (flash-aligned window) |
| **Flash** | `flash` | Deals on the flash rail (`deal_type = flash`) |
| **Favourites** | `favourites` | Deals from saved merchants (requires sign-in) |
| **Live now** | `now` | Deals currently running (started, not past grace) |
| **Today** | `today` | Deals overlapping today's local calendar day |

Sort (`?sort=`) stacks with chips. The Filter dropdown (`?filter=flash|boosted|standard`) clears an active chip when changed, and selecting a chip clears `?filter=`.

**Favourites empty states:**
- Signed out → sign-in prompt linking to `/login?next=/browse`
- Signed in, no saved shops → link to `/my-deals?tab=shops`
- Saved shops but no live deals in node → neutral empty copy

Note: Sort **Ending soon** orders by expiry time; the **Expiring soon** chip filters to a 6-hour window — different behaviours, distinct labels.

## Browse vs Map

| Surface | Route | Experience |
|---|---|---|
| **Browse** | `/browse` | List/grid only — node header, search, chips, deal cards. No embedded map. |
| **Map** | `/map` | Full-screen map with pins, viewport bounds filtering, Category + When dropdowns. |

The **Map** link in the shopper top bar (`ShopperTopBar`) navigates to `/map`. Legacy `/browse?lat=&lng=&dealId=` deep links redirect to `/map?…`.

Browse empty states use list-focused copy:

> 0 deals match your filters here · try adjusting filters or switching node.

## Code pointers

- Chips (URL): `src/app/(shopper)/browse/browse-chips.tsx`
- List: `src/components/browse/browse-client.tsx`
- Filter logic: `src/lib/browse.ts` (`BrowseChipFilter`, `filterBrowseDeals`, `parseBrowseChip`)
- Standalone map: `src/app/(shopper)/map/map-client.tsx`
- Shared map component: `src/components/browse/browse-map.tsx`
