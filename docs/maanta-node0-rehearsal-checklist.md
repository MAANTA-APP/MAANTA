# MAANTA Node 0 rehearsal checklist (BBS Mall)

Last updated: 2026-07-24. Engineer-facing. One sitting ≈ 30 minutes.
App: **https://maanta.app** (Vercel prod, deploys from `main`). Supabase project
**`axrrslqssmbngbataejg`** — the live project the app points at (Clerk third-party
auth enabled; see `docs/skills/clerk-auth.md`). *(Corrected 2026-07-24: this
checklist previously named `vcrfqsevompqjazbwzyh`, which is the abandoned project —
do not rehearse against it.)*

## 0. Before you start

- [ ] **Seed applied** — run `maanta-app/supabase/seed/node0_rehearsal_seed.sql` in the
  Supabase SQL editor. Idempotent; re-running refreshes deal expiry windows (~21h standard,
  ~5h flash) and the live OTP ticket. Run it again whenever deals have expired.
- [ ] **Sign-in works** — auth is now **Clerk** (Clerk owns the session:
  `ClerkProvider` + `clerkMiddleware`, `src/lib/auth.ts`), *not* Supabase Auth.
  *(Corrected 2026-07-24 — the old Supabase-Auth email-OTP + Supabase-SMTP steps
  no longer apply.)* Configuration is a **Clerk-dashboard** task (human): enable
  email OTP for sign-in, and enable **phone SMS OTP** — phone stays optional at
  sign-up but is **required to claim a deal** (the `/verify-phone` gate, S2 ruling
  2026-07-23; `currentUserHasVerifiedPhone()` + `POST /api/redemptions`). Verify
  a real code lands and the claim gate bounces an email-only session through
  `/verify-phone` and back. Transactional email deliverability (Clerk + Resend)
  is a separate prod check — see the tracker.
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
1. `/login` as shopper (Email tab) → pick BBS Mall → `/feed` shows 3 deals (flash rail
   on top), each with a **YOU PAY** price (abayas KES 2,400 was 3,000; scarves 800;
   gift sets 1,950).
2. Open the abaya deal → Claim → 6-digit code ticket appears (also under `/tickets`).
   Expected: second claim on the same deal is blocked with "already have an active claim".

**B. Merchant redeem (happy path + fee debit)**
3. Incognito: `/login` as **nuur** → `/merchant/redeem`.
4. Type the shopper's code from step 2 — or the pre-seeded live ticket **431977**.
   Redeem is now two-step (2026-07-18): entering the code only RESOLVES it and
   shows the fee disclosure; nothing is charged until you tap **Confirm
   redemption**. Expected after confirm: success screen with KES 30 fee, a
   copyable reference ID, new balance (540 → 510), and a ledger row under
   `/merchant/wallet` linked to that same reference.
   - **"Collect from shopper KES N"** (2026-07-24): both the resolve/disclosure
     screen **and** the success screen show the shopper's YOU PAY amount (e.g.
     abaya **KES 2,400**) as the cash to take at the counter — shown separately
     from the KES 30 success fee and the wallet balance. It is **display-only**:
     the shopper pays the merchant **directly, in cash**; MAANTA never charges
     the shopper in-app. Omitted for any legacy deal with no snapshotted amount.
   - **Masked shopper phone** (2026-07-24): the disclosure and success screens
     show a **masked** shopper number (e.g. `+254 7xx xxx 678`) as a "is this your
     number?" sanity-check. It is masked server-side — the full number is never
     shown at the counter — and is absent for a shopper with no stored phone.
   - **Wallet header** (2026-07-24): the redeem screen carries a persistent
     "Wallet KES N" affordance (taps through to `/merchant/wallet`); the success
     line also reads **"Redeemed at HH:MM"** from a server-issued timestamp.
   - **6-digit code entry**: the shopper's `/verify-phone` step and the till both
     use segmented 6-box code inputs (paste a code or type digit-by-digit).

**C. Verify-anyway → dispute → admin review**
5. A disputed redemption is pre-seeded (geofence flag + merchant override at Nuur).
   `/login` as admin → `/admin/redemptions`: expect an unresolved **merchant_override**
   event. Approve or reject it; expect it to disappear from the open list.
   (Live re-creation of a mismatch needs real GPS + real what3words addresses —
   on-site task; seeded w3w addresses are placeholders.)

**D. Merchant activation (full lifecycle)**
6. As admin → `/admin/merchants` → Macmacaan Sweets & Café (pending) → Approve
   (optionally grant Elite trial). Expected: status flips to active AND the
   wallet shows **KES 300** — the Node 0 opening credit (2026-07-16) is granted
   automatically at activation (first 100 BBS merchants; config-driven, ledger
   row tagged `node0_opening_credit`).
7. Incognito: `/login` as **macmacaan** → merchant dashboard loads with the
   KES 300 balance, so deal creation works immediately (Standard = 1 active
   deal, no flash). Still rehearse the top-up: `/merchant/topup` — Stripe
   **sandbox**, test card `4242 4242 4242 4242`, any future expiry/CVC —
   balance rises after the webhook lands.

**E. Low-wallet + arrears behavior**
8. `/login` as **bilan** (wallet KES 20 < KES 30 fee) → `/merchant/redeem`.
   Since 2026-07-18 (G1 frozen rule) a low or empty wallet NEVER blocks the
   keypad: verifying still succeeds, the KES 30 fee is recorded as **arrears**
   (`success_fee_arrears` ledger row, `outstanding_arrears` on the merchant),
   settled at the next top-up. Have the shopper claim Bilan's gift-set deal,
   confirm it at Bilan's keypad, and check the arrears row in `/merchant/wallet`.

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

- Auth is Clerk (not Supabase Auth). Enabling email OTP + phone SMS OTP and
  confirming deliverability are one-time **Clerk-dashboard** tasks (human) —
  see step 0 above and `docs/skills/clerk-auth.md`.
- IntaSend / M-Pesa STK still blocked on account access (tracker E6).
- Seeded what3words addresses are placeholders; replace with each shop's real ///address
  during on-site onboarding, or geofence checks will be meaningless.
- Trial-expiry job scheduling in production not yet confirmed (tracker E11).
