# Skills: frozen UI — overall handoff

Last updated: 2026-07-09 · Status: **repo-side seed — reconcile with the Notion
original on next documentation session.** This repo copy inventories the UI as
it exists in code; the Notion handoff holds the design intent and screenshots.

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
