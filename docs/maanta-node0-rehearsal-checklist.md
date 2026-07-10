# MAANTA Node 0 rehearsal checklist (BBS Mall)

Last updated: 2026-07-10. Engineer-facing. One sitting ≈ 30 minutes.
App: **https://maanta.app** (Vercel prod, deploys from `main`). Supabase project `vcrfqsevompqjazbwzyh` (eu-west-1).

## 0. Before you start

- [ ] **Seed applied** — run `maanta-app/supabase/seed/node0_rehearsal_seed.sql` in the
  Supabase SQL editor. Idempotent; re-running refreshes deal expiry windows (~21h standard,
  ~5h flash) and the live OTP ticket. Run it again whenever deals have expired.
- [ ] **Email OTP works** — login is OTP-only (phone SMS is NOT configured; always pick
  the **Email** tab). Supabase's built-in SMTP allows only ~2 auth emails/hour, which will
  stall a 5-account rehearsal. Before the first serious run, set custom SMTP in
  Supabase → Auth → SMTP settings (Resend SMTP works: host `smtp.resend.com`, user
  `resend`, password = Resend API key, sender on the verified maanta.app domain).
- [ ] Use one normal browser window + incognito windows (or separate devices) so
  shopper / merchant / admin sessions don't evict each other.

## 1. Accounts (all OTP codes arrive in the aragagency@gmail.com inbox)

| Role | Email | State |
|---|---|---|
| Admin | `aragagency@gmail.com` | role `admin` |
| Merchant — Nuur Fashion House | `aragagency+nuur@gmail.com` | active, Elite trial, wallet KES 540 |
| Merchant — Bilan Beauty & Cosmetics | `aragagency+bilan@gmail.com` | active, Standard, wallet KES 20 (below fee) |
| Merchant — Macmacaan Sweets & Café | `aragagency+macmacaan@gmail.com` | **pending** — for activation rehearsal |
| Shopper | `aragagency+shopper@gmail.com` | customer |

Seeded deals (all BBS Mall): Nuur "20% off all abayas & dirac" (standard) and
"Flash: buy 1 get 1 free — scarves & hijabs" (flash); Bilan "KES 300 off oud & perfume
gift sets" (standard).

## 2. Rehearsal steps

**A. Shopper browse → claim**
1. `/login` as shopper (Email tab) → pick BBS Mall → `/feed` shows 3 deals (flash rail on top).
2. Open the abaya deal → Claim → 6-digit code ticket appears (also under `/tickets`).
   Expected: second claim on the same deal is blocked with "already have an active claim".

**B. Merchant redeem (happy path + fee debit)**
3. Incognito: `/login` as **nuur** → `/merchant/redeem`.
4. Type the shopper's code from step 2 — or the pre-seeded live ticket **431977**.
   Expected: "Verified — KES 30 success fee applied", new balance shown (540 → 510),
   ledger row visible under `/merchant/wallet`.

**C. Verify-anyway → dispute → admin review**
5. A disputed redemption is pre-seeded (geofence flag + merchant override at Nuur).
   `/login` as admin → `/admin/redemptions`: expect an unresolved **merchant_override**
   event. Approve or reject it; expect it to disappear from the open list.
   (Live re-creation of a mismatch needs real GPS + real what3words addresses —
   on-site task; seeded w3w addresses are placeholders.)

**D. Merchant activation (full lifecycle)**
6. As admin → `/admin/merchants` → Macmacaan Sweets & Café (pending) → Approve
   (optionally grant Elite trial). Expected: status flips to active.
7. Incognito: `/login` as **macmacaan** → merchant dashboard loads. Wallet is 0:
   expect deal creation blocked (zero-balance gate) and redeem keypad blocked
   ("balance too low"). Top up via `/merchant/topup` — Stripe **sandbox**, test card
   `4242 4242 4242 4242`, any future expiry/CVC. Expected: balance appears after the
   webhook lands, then deal creation works (Standard = 1 active deal, no flash).

**E. Low-wallet + arrears behavior**
8. `/login` as **bilan** (wallet KES 20 < KES 30 fee) → `/merchant/redeem` shows the
   "Wallet balance too low — top up" gate. (Arrears path — verify with empty wallet —
   only triggers via admin/service verification; the keypad gate blocks it by design.)

**F. Waitlist signup**
9. Waitlist lives in the email platform, not this app (decision 2026-07-10). Nothing
   to rehearse in-app; public pages `/`, `/for-merchants`, `/malls/bbs-mall` should load.

## 3. Resetting state

- Deals expired / flash over → re-run the seed (refreshes windows).
- Live ticket 431977 used → shopper just claims again in-app (new code).
- To hard-reset the rehearsal dataset: delete rows whose IDs start with
  `a0/b0/c0/d0/e0/f0/f1/a1` + `00000000` pattern (see ID table at the top of the seed
  file), then re-run the seed. Don't do this mid-rehearsal.

## 4. Known gaps (founder / later work)

- Phone-OTP login needs an SMS provider wired into Supabase Auth — email OTP until then.
- Custom SMTP (above) is a one-time dashboard task; without it OTP emails rate-limit.
- IntaSend / M-Pesa STK still blocked on account access (tracker E6).
- Seeded what3words addresses are placeholders; replace with each shop's real ///address
  during on-site onboarding, or geofence checks will be meaningless.
- Trial-expiry job scheduling in production not yet confirmed (tracker E11).
