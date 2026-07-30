# Skills: frozen UI — overall handoff

> **Design truth:** for *current-state* screens, routes and runtime rules the
> canonical source is `maanta-app/design/current-reality/` (see
> `docs/design-truth-protocol.md`). This document is a dated handoff — treat it
> as provenance and design intent, not as current-state authority.

Last updated: 2026-07-26 · Status: **repo-side seed — reconcile with the Notion
original on next documentation session.** This repo copy inventories the UI as
it exists in code; the Notion handoff holds the design intent and screenshots.

### Update — 2026-07-26: Discover rails + Browse map (within Frozen tokens)

Shopper Discover (`/feed`) gained TGTG-style rail copy, a current-location pill,
distance on cards when merchant GPS exists, a favourites rail, and a Browse map
route (`/browse`, Leaflet/OSM). Bottom nav Search → Browse; `/search` remains
reachable from Browse. Merchant `lat`/`lng` added (migration
`20260726120000_merchant_lat_lng`); what3words stays server-only via
`W3W_API_KEY`. See `docs/skills/discover-browse-w3w.md`.

### Update — 2026-07-26: Claude-inspired design system (shopper polish)

Shared primitives in `src/components/ui/claude/` (`Page`, `Section`, typography,
`LocationPill`, `FilterChip`, `DealCard`). Discover rails retitled Top picks /
Priority placements / Deals Near Me / Favourites (rail names settled by D-01, 2026-07-29); Browse map chrome + profile + landing
hero restyled. DM Sans for UI; Frozen money/CTA/vocab rules unchanged. See
`docs/skills/claude-design-system.md`.

## Pass 2 — Frozen UI (Shopper) applied 2026-07-18

The shopper surface was migrated from the Pass-1 palette to the **Frozen UI
(Pass 2)** tokens in `maanta-design-brief.md`. This was a **visual reskin only**
— no schema or price-model changes (the brief's `YOU PAY` model has no backing
table; the wireframes were adapted to the code, not the reverse). Key moves:

- **Fonts:** Geist → **Inter** (sans) + **JetBrains Mono** (codes). Loaded via
  `next/font/google` in `src/app/layout.tsx`; slashed-zero + tabular figures via
  the `.font-code` / `.tnum` utilities in `globals.css`.
- **Tokens** (`tailwind.config.ts`, never raw hex in components):
  amber `#FDBF2D` (fill/border only, the one action + R1–R4) · paper
  `--bg-app #FAFAF8` (shopper page) · cards `#FFF` · disabled `cream-dark
  #F1F1F1`/`faint #6B6B6B` (L9b) · text scale `ink #111` / `secondary #3D3D3D`
  (money context) / `muted #5C5C5C` / `faint #6B6B6B` · **warning = rust
  `#9A4A0C`, never red/yellow (L6)** · error `flame #8C1D18` · success
  `verified #0A5C34` · hairline `line #E5E2DA`.
- **Rules enforced:** CTA = amber fill + **black** label (L4); disabled is never
  amber (L9b); ≤1 amber action/screen (selection tabs, boosted/flash/live chips,
  the notification badge and the deal-detail claims bar were all de-ambered);
  every state carries icon + word (L12) via `ClaimChip` and rust `InlineAlert`s;
  no emoji on money/loading surfaces (L9 — button spinner, claim-check spinner).
- **S5 claimed-code hero** (`tickets/[id]/claimed-code.tsx`): white card, **R3**
  breathing amber border (`animate-r3` keyframe), ink slashed-zero code, a
  **live per-second ticking countdown** (anti-screenshot; ships with "If the
  timer isn't moving, it's a screenshot"), price/context outside the card, zero
  amber actions. `CodeDisplay` in `overlays.tsx` was likewise moved off the
  amber fill.
- **TabBar** now uses the R1 amber top-indicator bar, not an amber pill.

### YOU PAY price model (2026-07-18, follow-up)

The visual reskin was followed by wiring the brief's central **YOU PAY** model
(decisions-log 2026-07-18). Migration
`20260718120000_shopper_you_pay_price_model.sql` adds `deals.price_kes /
compare_at_kes / charges` and `redemptions.amount_kes` (claim snapshot).
`src/lib/pricing.ts` is the **single** place YOU PAY is computed (tile, deal
detail, claimed code all read `dealPricing`). The create-deal wizard gained the
mandatory **M9 charge-disclosure** step (price + A/B extras + live preview +
Publish-carries-number). Itemised breakdown appears **only** in deal detail;
elsewhere extras collapse to "Includes KES N in taxes and charges". Columns are
NULLable so legacy deals keep working with no price shown. **Deploy note:** the
migration must be applied to the Supabase project before deploying, or the deal
queries selecting the new columns will error.

Verified: `npm run build` (all routes), `tsc --noEmit`, `next lint`, and
`npm test` (**33**, incl. 12 pricing tests) all pass. A live render needs
Supabase env vars (middleware builds a client per request), absent in the build
sandbox.

## Update — 2026-07-25: "simplest but impressive" quiet-precision polish pass

Branch `claude/maanta-mobile-wireframes-7am001`. A UI/UX-only quality pass with
the founder's chosen frame: **polish within the freeze · "impressive" = quiet
precision (not flash) · money moments first.** No surface moved; no
money/price/fee/RLS/auth/migration touched; all new motion gated behind
`motion-safe:`. Verified after every phase with `tsc --noEmit`, `next lint`,
`npm test` (**188**, incl. the `frozen-ui-rules` ratchet), `npm run build`, plus
a headless-Chromium render of both money moments in default and reduced-motion.

**Phase 0 — motion foundation.** `globals.css` gains a `prefers-reduced-motion`
guard (the R3 pulse, spinners, sheet/modal, fades, presses were previously
unconditional) + a shared `--ease-standard`. `overlays.tsx` `BottomSheet`/`Modal`
now animate on **exit** as well as enter (mount→paint→visible→exit) and share a
keyboard **focus trap** + Esc + scroll-lock (they used to hard-unmount and vanish).
Tactile press (`motion-safe:active:scale`) on `Button`/`NumericKeypad`/deal cards.

**Phase 1 — shopper Claim.** Reuse `InlineAlert` (flagged ticket) and
`StickyCtaBar` (ended-deal bar) instead of hand-rolled dupes; `fade-in` on the
location-check takeover, the "Deal claimed" banner, and `CoverImage`. S5 hero
untouched.

**Phase 2 — merchant Till.** `NumericKeypad`: icon backspace (`IconBackspace`)
replacing the raw `⌫`, + a short `vibrate()` tick on press. OTP cells pop each
landed digit (`otp-pop`). `RedemptionResult` gains an optional **"Next customer"**
skip (white-outline, still no amber). `MerchantBottomBar` widened to `lg:max-w-3xl`
to align with the till-tablet two-pane frame.

**Phase 3 — loading/error everywhere.** Only the feed had boundaries; added
segment-level `loading.tsx`+`error.tsx` for `(shopper)`, `merchant/(app)`,
`admin`, `agent` (reusing `Skeleton`/`ErrorState`, reporting to Sentry) and
restyled `global-error.tsx` to the tokens.

**Phase 4 — one system.** Emoji purge (L9): `⚡`/`✓`→`IconBolt`/`IconCheck` in the
plan-compare table, `⏸`→`IconPause`, `⏳`→spinner (topup). Active-filter pills →
ink (A6) on merchant redemptions + admin support. `CoverImage`/shop-photo →
`IconImage` glyph (no more literal "img"/"shop photo"). Feed rails scroll-snap.
Retired the dead duplicate `OtpCells` (`otp-input.tsx` is the one OTP component).

**Phase 5 — honest bugs/copy.** `SettingsRow` gains a non-interactive display
variant; merchant Settings + shopper Profile no longer have tap-to-self dead rows
(dropped the light-only "Theme" row). Upgrade CTA "Pay via M-Pesa STK" →
"Request Elite upgrade". Search results now show YOU PAY via the exported
canonical `DEAL_SELECT` + `lib/pricing`. Removed dead Geist font files.

**Phase 6 — first touch.** `fade-in` + staggered step cards on the public landing
(the only motion on `(public)`).

### Deferred to founder sign-off (cross the freeze line — NOT shipped here)

Each is a real improvement but is a feature/flow/marketing decision, so it needs
a `maanta-decisions-log.md` entry, not a polish diff:
- **Success/error haptic** on the Till takeover (the keypad-press tick shipped;
  the outcome buzz sits closest to "Money moved; it is not a party").
- **Contact form** is a no-op returning a false "we'll get back within 24 hours".
- **PWA install quality** (raster 192/512 icons; `sw.js` `/favicon.ico` vs
  `/icon.svg`; OfflineBanner promises "saved deals" but the SW has no caching).
- **Route first-run users into `/onboarding`** (the 3-pane intro looks orphaned).
- **Public conversion + imagery**: hero `/feed` vs nav `/sign-up` target, the
  secondary (non-amber) merchant CTA, marketing "screenshot" placeholders, and a
  mobile hamburger nav (How-it-works/Pricing/FAQ are unreachable on mobile).
- **Admin card-rows → a shared table** and **three tab components → one** (either
  can visibly restructure a screen).

## What "frozen" means

The launch UI is feature-frozen: pre-launch work is bug fixes and copy only.
Anything that adds/moves/redesigns a surface needs a `maanta-decisions-log.md`
entry first. Product-track prompt already encodes this: "Do not redesign. Focus
on launch readiness."

## UI surfaces in code (`maanta-app/src/app/`)

### Shopper

| Route | File | Purpose |
|---|---|---|
| `/` | `page.tsx` | Landing / entry, sign-out + enable-notifications controls in layout |
| `/feed` | `(shopper)/feed/page.tsx` | Discover rails (flash / boosted / standard / favourites) |
| `/browse` | `(shopper)/browse/page.tsx` | Map + list of live deals (Leaflet); filters by rail / collect time |
| `/deals` | `deals/page.tsx` | Redirects to `/feed` |
| `/deals/[id]` | `deals/[id]/page.tsx` + `claim-flow.tsx` | Deal detail; pick-up + View on map; claim → OTP ticket |
| `/search` | `(shopper)/search/page.tsx` | Text filter (secondary; linked from Browse) |
| `/login` | `login/page.tsx` | Phone or email sign-in |

### Merchant

| Route | File | Purpose |
|---|---|---|
| `/merchant/onboard` | `merchant/onboard/page.tsx` | Onboarding submission |
| `/merchant/topup` | `merchant/topup/page.tsx` | Wallet top-up (Stripe Checkout redirect; `?stripe=success/cancelled` return states) |
| `/merchant/redeem` | `merchant/redeem/page.tsx` | Enter shopper OTP to verify a redemption |

### Admin

| Route | File | Purpose |
|---|---|---|
| `/admin` | `admin/page.tsx` + `approve-button.tsx` | Merchant approval queue; fraud-review tasks surface here |

### Shared

- `layout.tsx`, `globals.css`, Tailwind config — global shell.
- `enable-notifications-button.tsx` — Web Push opt-in.
- Deal images served from Supabase storage (migration `20260701125545`).

## UI-visible business rules (do not soften in copy)

- Redemption code expiry (deal expiry + 15 min) — the error states in
  `/merchant/redeem` map to invalid / expired / already-redeemed (see
  `redemption-disputes.md`).
- Verify-anyway: merchant sees the fee status (`charged`/`owed`/`unknown`) but
  the shopper-facing outcome is success.
- Zero-balance merchants can't create deals — the top-up CTA is the fix, not an
  override.

## Not built (post-launch or external)

- Public waitlist pages (external site).
- Boost purchase UI, mall-operator dashboard.

## Handoff checklist for the next session touching UI

1. Read this file + `maanta-decisions-log.md`.
2. Bug fix or copy change → go ahead; new surface or redesign → decisions-log
   entry first.
3. After the change, update this file's inventory and "Last updated".
4. Reconcile with the Notion frozen-UI doc and export per the documentation track.
