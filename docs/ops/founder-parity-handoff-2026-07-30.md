# Founder handoff — backend/frontend/wireframe parity (2026-07-30)

## What is now aligned (in this branch / repo)

- Critical shopper money path is honest: YOU PAY, phone gate (Clerk), claim
  pause + live-only new claims, ticket +15m grace, feed locked order.
- Merchant till: resolve→charge, verify-anyway, staff gate, Stripe-primary top-up.
- Admin: optional Elite trial + cap UI, fee reverse note+audit, hold/release.
- Route aliases: `/otp` → `/verify-phone`, `/founder/reports` → `/admin/reports`,
  `/merchant/onboarding` → `/merchant/onboard`, `/tickets` → `/my-deals`.
- Design inventory exists: `maanta-app/design/current-reality/frames.json`.
- Durables: `docs/skills/backend-frontend-parity-audit-2026-07-30.md`,
  matrix + drift register under `docs/skills/parity-*`.

## What is merged in repo ≠ live on prod until you confirm

- Migrations dated `20260730*` (Elite trial cap, fee notes, pause gate restore,
  etc.) — **confirm applied** on hosted Supabase before trusting trial cap /
  pause in production.
- This parity PR’s code (pause filter, claimable live-only, alerts copy, aliases)
  ships only after merge + deploy.

## What needs env / keys / ops

| Need | Why |
|---|---|
| Real Clerk publishable **and** secret | Interactive browser + phone OTP |
| Stripe sandbox keys | Card top-up walkthrough |
| IntaSend keys (optional) | M-Pesa STK secondary — not required for Phase 1 |
| Playwright `E2E_*` secrets | Browser golden path (suite is authored but inert) |
| Local Docker GRANT for `service_role` | Otherwise empty shopper feed on `supabase start` |

## Do not mistake for shipped UI

- `/contact` “send” — no backend.
- Admin deal “reason” taxonomy — not live (fraud-signal queue only).
- Feed titles “Top picks / Neighbourhood favourites / Deals near me” — marketing
  labels; locked structure still Flash → Priority → All Active in data.
- Wireframe PDF / external `.dc.html` frames beyond claim-and-till — may be
  design-ahead; check `frames.json` status before assuming a backend gap.
- `/map` is a real route today; it is **not** a redirect to `/browse`.

## Suggested founder walkthrough order

1. Apply/confirm hosted migrations → `elite_trial_cap_status()`.
2. Shopper: feed → deal → verify-phone (Clerk) → claim → ticket timer.
3. Merchant: redeem with fee disclosure → low wallet arrears path → top-up card.
4. Admin: approve with/without trial at cap → redemption reverse with note.
5. Confirm paused deal disappears from feed and shows “Deal paused” on deep link.

Checklist companion: `docs/ops/founder-e2e-checklist-2026-07-30.md`.
