# MAANTA — Project Overview

## What MAANTA is

MAANTA is a Kenya mall-deals marketplace. Shoppers discover live deals in a
mall, claim a 6-digit code, and redeem it in person at the shop. Merchants
preload a wallet balance and pay a **KES 30 success fee per verified
redemption** — they only pay when a shopper actually shows up and redeems.

## Launch strategy

- **Node 0: BBS Mall, Nairobi.** The first three months are focused
  exclusively on product–market fit at this single mall before any
  expansion. Every merchant, deal, and redemption in the system defaults to
  the `BBS Mall` node.
- **Launch window: November**, preceded by a one-month waitlist campaign.
- Pre-launch, the public website's job is traction: collect **separate
  shopper and merchant waitlists** (plus mall-operator interest) so launch
  communications are segmented from day one.

## Business model

| Revenue line | Mechanics |
|---|---|
| Success fee | KES 30 debited from the merchant wallet per verified redemption. If the wallet can't cover it, the fee is recorded as arrears and the merchant's deals are gated until topped up. |
| Boosts | KES 500 for 24 hours of boosted deal placement. |
| Elite tier | Subscription tier; new merchants get a **30-day Elite trial** (with a grace period on expiry). |

## Payments — current state

- **Stripe (sandbox)** is live for merchant wallet top-ups during testing,
  including multi-currency top-ups (KES, USD, EUR, GBP) converted to KES at
  a live FX rate.
- **M-Pesa STK push must be ready by launch.** The integration code path
  exists (via IntaSend), but **IntaSend credentials are not yet available**
  — do not assume they exist. Provider decision research lives in
  `maanta-app/legal/payment-processor-comparison.md`.

## Roles in the system

| Role | What they do |
|---|---|
| Customer (shopper) | Browses deals, claims codes, redeems in person |
| Merchant admin / staff | Onboards the shop, posts deals, verifies redemption codes, tops up wallet |
| Agent | On-ground sales: locks merchant leads (48-hour exclusivity), attributed on onboarding |
| Admin | Approves merchants, handles fraud/dispute review, operates the admin panel |

## Founder testing model

The founder acts as admin, shopper, and merchant during testing, with
family-assisted testing if extra real-device participants are needed. The
detailed plan is in `maanta-launch-ops-runbook.md`.

## Documentation workflow

- **Notion is the source of truth** for drafting and approval.
- Approved docs are exported as markdown to **Google Drive**, and later
  mirrored into **Obsidian**. The `docs/` folder in this repo is the
  portable markdown set.

## The three workstreams

1. **Software engineer** — take the current build to launch-ready:
   stability of the shopper claim→redeem, merchant onboard→verify, and
   admin fraud/dispute journeys; waitlist capture; M-Pesa readiness. See
   `maanta-technical-handoff.md` and `maanta-launch-readiness-tracker.md`.
2. **AI lead** — turn MAANTA into a documented, analytics-ready operating
   system: segmentation logic, funnel definitions, decision log, durable
   skills-style docs. See `maanta-email-segmentation-plan.md` and the
   metrics sections of the tracker.
3. **Marketing agency** — run the one-month pre-launch waitlist campaign
   with role-segmented messaging. See `maanta-marketing-agency-brief.md`
   and the three email-sequence docs.
