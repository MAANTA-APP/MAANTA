# Skills: frozen UI — overall handoff

Last updated: 2026-07-18 · Status: **repo-side seed — reconcile with the Notion
original on next documentation session.** This repo copy inventories the UI as
it exists in code; the Notion handoff holds the design intent and screenshots.

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
| `/deals` | `deals/page.tsx` | Browse live deals |
| `/deals/[id]` | `deals/[id]/page.tsx` + `redeem-button.tsx` | Deal detail; claim → OTP ticket |
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
