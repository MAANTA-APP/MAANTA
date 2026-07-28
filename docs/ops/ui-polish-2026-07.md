# UI polish notes (July 2026)

## Browse / Map IA

- **Browse** is list/grid only — no embedded map toggle or Leaflet pane.
- **Map** remains its own route (`/map`) and bottom-nav entry.
- See [`maanta-browse-map.md`](./maanta-browse-map.md) for seed-visibility notes.

## Not changed in the Browse/Map separation pass

- Auth strategy toggle (`clerk` vs `supabase`)
- `/download` PWA install and `/app-bootstrap` role routing
- Claim / redeem / success-fee money path
