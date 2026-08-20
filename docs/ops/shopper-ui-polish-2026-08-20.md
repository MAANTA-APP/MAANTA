# Shopper UI polish pass — 2026-08-20

Builder session. Audit + fix pass over the live shopper surfaces, run with the
UI-UX-PRO-MAX skill workflow documented in `docs/ops/claude-stack-setup.md`
(`ux`-domain queries only; frozen UI rules held as the overriding constraint).

## Scope

Surfaces classified `live` in `design/current-reality/frames.json`: `/feed`,
`/browse`, `/map`, `/deals/[id]`, `/my-deals`, plus the gated `/tickets/[id]`
and the shared primitives in `src/components/ui/claude/`,
`src/components/ui/states.tsx`, `src/components/favourite-button.tsx`,
`src/components/nav/bottom-bars.tsx`.

## Audit checklist (from skill `ux`-domain queries) and verdicts

| Guideline | Verdict |
|---|---|
| Empty states show message + next action | PASS everywhere; **fixed** the one dishonest case (My deals Past tab, below) |
| Loading skeletons preserve layout + accessible busy status | Layout PASS; **fixed** missing screen-reader status |
| Touch targets ≥44px, ≥8px gaps | `IconButton` 44px PASS; **fixed** `FavouriteButton` (32–36px on card overlays) |
| Visible focus, keyboard-operable | Global `:focus-visible` ring PASS; **fixed** `FilterDropdown` (no Escape dismissal) |
| Active nav highlighted, `aria-current` | PASS (`bottom-bars.tsx`; amber underline is the allowed active-tab exception) |
| Alt text on meaningful images | PASS (vertical card `alt={title}`; horizontal decorative `alt=""` with adjacent text) |
| Heading hierarchy sequential | PASS (deal detail h1 → h2; cards h3/h4 under section headings) |
| Countdown honest, no per-second live region | PASS (`CountdownChip` 30s tick, no aria-live; claimed-code timer is aria-live="off") |
| Frozen rules 1–7 | PASS — no money colour, ≤1 amber, state = icon + word, closed vocabulary |

## Changes

1. **`src/components/ui/claude/controls.tsx`** — `FilterDropdown` now closes on
   Escape and returns focus to its trigger. Keyboard users could open the
   listbox but not dismiss it without selecting. Used by feed, browse, my-deals
   and map controls.
2. **`src/components/favourite-button.tsx`** — tap target extended to ≥44px via
   an invisible `after:-inset-1.5` overlay (visible heart unchanged; the
   horizontal deal-card overlay had shrunk it to ~32px). Added `aria-busy`
   while the toggle is in flight.
3. **`src/app/(shopper)/my-deals/page.tsx`** — Past tab empty state no longer
   claims "No claimed deals yet" (the shopper may hold active tickets on the
   other segment); it now reads "No past deals" with an honest sub-line. Shops
   tab empty state gained the next-step hint ("Tap the heart on a deal…").
4. **`src/app/(shopper)/loading.tsx`**, **`feed/loading.tsx`** — added an
   `sr-only` `role="status"` "Loading deals" line so the skeleton states are
   announced, not silent.
5. **`src/components/__tests__/shopper-ui-polish.test.ts`** — ratchet: the
   FavouriteButton hit-area class and toggle semantics now fail CI if removed.

Deliberately unchanged: `/deals/[id]` and `/tickets/[id]` money surfaces (audit
PASS, no edits on the code card), `CountdownChip`, bottom nav, browse client.

## Verification

From `maanta-app/`: `npm run lint` clean · `npm run typecheck` clean ·
`npm test` 114 files / 975 tests passed (frozen-ui-rules included) ·
`npm run build` passed with all three post-build gates (tokens, canonicals,
server forms) clean.

## Drift

None found — the gaps above were unclaimed polish debt, not claim-vs-reality
drift; no register rows opened. `IconButton`'s "44px touch target" comment is
accurate (h-11).

## Open decisions

None. Merchant/admin surfaces and the marketing pages are separate sessions
per the one-surface-family rule.
