# Elite merchants seed (100 synthetic merchants)

## What it creates

- **100 elite-tier merchants** at BBS Mall with realistic fictional names, categories, and location tags.
- **200 deals** — up to 2 per merchant:
  - **Flash** — short expiry (hours), strong discount, `FLASH` labelling.
  - **Standard** — longer expiry (days/weeks), moderate discount.
- **Stock cover images** under `public/deals/*.svg` (synthetic placeholders — no scraped assets).

All merchant emails are `elite.seed001@maanta.app` … `elite.seed100@maanta.app` (synthetic; not for login).

UUID namespace: `b3/c3/d3` (no collision with rehearsal `b0`, demo `b1`, or test accounts `b2`).

## Apply

```bash
export DATABASE_URL='<your-local-or-hosted-postgres-uri>'  # e.g. from `supabase start`
make db-seed-elite
# or: cd maanta-app && ./scripts/apply-elite-merchants-seed.sh
```

Regenerate SQL after editing the generator:

```bash
cd maanta-app && python3 scripts/generate-elite-merchants-seed.py > supabase/seed/elite_merchants_100.sql
```

## Browse

Set the `maanta_node` cookie to `BBS Mall` (default) and open `/feed` or `/browse`.

## RLS / permissions

The seed inserts via service-role or direct SQL (same pattern as `node0_100_deals_seed.sql`). On local `supabase start`, grant `service_role` table access if the shopper feed is empty — see `AGENTS.md`.

## Images

Category → image mapping (all under `/deals/`):

| Category | Files |
|----------|-------|
| restaurant / café | `food-01.svg`, `food-02.svg`, `food-03.svg` |
| grocery | `grocery-01.svg`, `grocery-02.svg` |
| fashion | `fashion-01.svg`, `fashion-02.svg` |
| services / pharmacy / electronics | `services-01.svg` |

Replace SVGs with licensed photography before production marketing — these are dev placeholders only.
