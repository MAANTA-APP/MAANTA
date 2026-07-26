# Skills: Claude-inspired shopper design system

Last updated: 2026-07-26 · Status: **shipped in code**.

## Intent

Calm, high-contrast, generous-whitespace UI (Claude) + TGTG rail/map layouts,
applied to Maanta shopper surfaces **without changing** `getLiveDeals`, favourites,
Clerk, or what3words server wiring. Frozen hard rules still apply (YOU PAY in ink,
amber CTA + black label, closed vocabulary).

## Components (`maanta-app/src/components/ui/claude/`)

| Module | Exports |
|---|---|
| `layout.tsx` | `Page`, `Section`, `RailScroller` |
| `typography.tsx` | `HeadingLg`, `HeadingMd`, `HeadingSm`, `Body`, `Label`, `Meta` |
| `controls.tsx` | `PrimaryButton(Link)`, `SecondaryButton(Link)`, `IconButton`, `Chip`, `FilterChip`, `LocationPill` |
| `deal-card.tsx` | `DealCard` (+ `DiscoverDealCard` alias) |
| `index.ts` | barrel |

## Tokens / type

- Tailwind: `stone` / `stone-soft`, `shadow-card`, `rounded-card` 1.25rem, spacing `section` / `rail`.
- Font: **DM Sans** (`--font-dm-sans`) primary; Inter variable kept as fallback; JetBrains Mono for codes.
- Flash badge = `rust`; Boosted = `verified`; Standard = stone chip. Money never `text-brand`.

## Surfaces updated

- `/feed` — LocationPill, rails: Top picks / Local heroes / Deals near me / Your favourites.
- `/browse` — **list first** (“Deals around you” + search + FilterChips), map
  below with recenter; filters affect list + pins.
- ClerkAuthShell + login/sign-up — heading + copy above **one** Claude card;
  Clerk `cardBox`/`card`/`footer` chrome is neutralized so forms don’t stack a
  second box inside the shell.
- `/you` (canonical profile) — Edit profile, Language (English / Kiswahili coming soon),
  favourites, mall, settings (Notifications, Help & support, Sign out only).
  `/profile` redirects here.
- `/you/notifications` — three notification toggles + Back → `/you`.
  `/notifications/preferences` redirects here; bell icon opens activity list at `/notifications`.
- `/you/help` — FAQ + WhatsApp CTA (re-exports `/help`).
- `/my-deals` — compact `SegmentedLinks` (Deals/Shops, Active/Past). `/deals` redirects here.

- Public landing — hero “Claim in‑mall deals before you pay.” + story sections + early-access → waitlist.

## Deploy note

No new env vars. DM Sans loads via `next/font/google` in root layout (needs network at build).
