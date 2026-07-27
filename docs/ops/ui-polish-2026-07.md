# UI polish pass (July 2026)

Visual consistency improvements without changing Maanta’s information architecture, routes, or core flows. No Glovo branding or assets were used.

## Scope (implemented)

### Global styles (`src/app/globals.css`)

- `card-interactive` — shared hover elevation and press timing via `--ease-standard`
- `animate-list-in` — subtle list entrance animation (respects `prefers-reduced-motion`)

### Cards (`src/components/ui/cards.tsx`)

- Deal cards (vertical + horizontal) and merchant deal rows use `card-interactive` for consistent hover/active feedback

### PWA surfaces

- `/download` — install page using Frozen UI tokens (`Page`, `HeadingLg`, `PrimaryButtonLink`)
- `/help/phone-login` — tester sign-in guidance

## Screens reviewed (structure unchanged)

- Shopper: feed, browse, map, my deals, deal detail, claim flow
- Merchant: dashboard, deal list, redeem, wallet
- Admin / agent / founder consoles

## Not changed

- Route map and role-based navigation
- Component hierarchy (Feed, Browse, Map, merchant dashboard, admin tables)
- Business copy and claim/redeem logic

## Future polish (out of scope)

- Theme variants (dark mode for merchant console)
- Advanced map clustering and mall-floor visuals
- Skeleton loaders on slow feeds
- Haptic feedback on OTP entry (native wrappers)
