# UI polish notes (July 2026)

## Browse / Map IA

- **Browse** is list/grid only — no embedded map toggle or Leaflet pane.
- Chip filters (Ending soon, Flash, Favourites, …) live on Browse; see
  [`browse-filters-2026-07.md`](./browse-filters-2026-07.md).
- **Map** remains its own route (`/map`) and bottom-nav / top-bar entry.
- See [`maanta-browse-map.md`](./maanta-browse-map.md) for seed-visibility notes.

## Not changed in the Browse/Map separation pass

- Auth strategy toggle (`clerk` vs `supabase`)
- `/download` PWA install and `/app-bootstrap` role routing
- Claim / redeem / success-fee money path
