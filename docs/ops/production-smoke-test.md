# Production smoke test checklist

**Date:** 2026-07-28  
**Audience:** Founder + engineer on real devices  
**When:** After prod sync (migrations + env + redeploy) and before inviting real merchants/shoppers.

**Test accounts:** `docs/ops/test-accounts.md` (rehearsal) · `docs/ops/test-accounts-seed-2026-07.md` (`@maanta.app`)  
**Auth:** Production = Clerk (`MAANTA_AUTH_STRATEGY=clerk`). Phone OTP required to claim.

---

## Prerequisites

- [ ] `GET /api/healthz?ready=1` → `"status":"ready"`, `"strategy":"clerk"`
- [ ] Feed not empty **or** empty-for-known-reason (no deals / wrong node) documented
- [ ] Two phones or two browsers (shopper + merchant)
- [ ] Known merchant OTP path (seeded OTP only on rehearsal seeds — live merchants use real codes)

---

## 1. Public / install

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 1.1 | Open `/` | Landing loads, brand visible | 5xx / blank |
| 1.2 | Open `/download` | Install CTA + iOS/Android instructions | Missing copy |
| 1.3 | (Android Chrome) Install PWA if prompted | Icon on home screen | Install fails — note browser |
| 1.4 | Open installed app | Lands on `/app-bootstrap` → role home or login | Stuck spinner / Clerk Invalid host |
| 1.5 | Open `/waitlist` | Form submits; confirmation email if Resend wired | Silent drop (check honeypot / healthz) |

## 2. Auth + bootstrap

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 2.1 | `/login` | Clerk sign-in UI | Wrong strategy UI / Invalid host |
| 2.2 | Sign in as shopper | Redirect `/app-bootstrap` → `/feed` | Loop to login |
| 2.3 | Sign out → `/sign-up` | Sign-up works | Session stuck |
| 2.4 | Sign in as merchant | `/app-bootstrap` → `/merchant/dashboard` | Wrong role destination |
| 2.5 | Sign in as admin | `/admin` | 401/403 |

## 3. Shopper discovery

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 3.1 | `/feed` | Rails render or clear empty state | Error boundary / permission denied |
| 3.2 | `/browse` | Filters work | Crash on chip |
| 3.3 | `/map` | Pins if lat/lng present | Blank map forever |
| 3.4 | Switch mall via top bar / `/select-mall` | Cookie updates; feed scopes | Stale empty feed |
| 3.5 | Open a deal `/deals/[id]` | Detail + Claim CTA | 404 for live deal |

## 4. Claim → OTP ticket

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 4.1 | Claim without verified phone | 403 `phone_required` → `/verify-phone` | Claim succeeds without phone (clerk mode) |
| 4.2 | Complete `/verify-phone` | Return to deal; claim works | SMS not delivered |
| 4.3 | Claim again | Ticket `/tickets/[id]` with 6-digit OTP | Rate limit / 500 |
| 4.4 | Note OTP + expiry | Visible on ticket | Blank code |

## 5. Merchant redeem / verify

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 5.1 | Merchant `/merchant/redeem` | Keypad UI | Layout broken |
| 5.2 | Enter OTP → verify | Success takeover; “Collect from shopper KES N” | Money-path 500 / protected_column |
| 5.3 | Wallet balance | Decremented by KES 30 **or** arrears recorded | Double charge / no ledger |
| 5.4 | Shopper ticket | Shows verified / redeemed | Stuck pending |

## 6. Wallet / top-up

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 6.1 | `/merchant/topup` Stripe test | Checkout session opens | Missing Stripe env |
| 6.2 | Complete test payment | Webhook credits wallet (settle arrears first) | No credit / webhook failure |
| 6.3 | M-Pesa STK (if IntaSend live) | STK prompt on phone | Skip if E6 still blocked — note |

## 7. Admin critical

| # | Step | Expected | Failure signal |
|---|---|---|---|
| 7.1 | `/admin` pending merchants | Queue loads | Empty when pending exists |
| 7.2 | Approve a pending merchant | Status → active | RPC error |
| 7.3 | `/admin/redemptions` | History + Guardian held items | Missing tables (migration drift) |
| 7.4 | Fee reversal (sandbox only) | Note required; wallet credit | Reversal without note accepted |

## 8. Monitoring spot-check

| # | Step | Expected |
|---|---|---|
| 8.1 | Sentry receives recent errors if any | Dashboard not empty after intentional test |
| 8.2 | PostHog Live sees pageviews | Or deferred documented |

---

## Automation note

- Unit/SQL: `npm test` + CI `db-tests` — **not** a substitute for this checklist.
- Playwright golden path: `docs/ops/e2e-golden-path.md` — opt-in; needs dedicated non-prod env (charges KES 30 on real verify).

---

## Sign-off

| Role | Name | Date | Pass? |
|---|---|---|---|
| Engineer | | | |
| Founder | | | |

**Blockers found:** _(list)_
