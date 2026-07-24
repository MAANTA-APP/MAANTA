# Codebase for founders (plain language)

Last updated: 2026-07-26 · Audience: non-technical founder / operators

This is a plain-English map of what lives in the MAANTA repo — not an
engineering handoff. For product rules and launch status, see
`docs/maanta-project-overview.md` and `docs/maanta-launch-readiness-tracker.md`.

## The one-sentence version

The codebase is **one web app** that serves shoppers, merchants, on-ground
agents, and admins — plus a **database** that holds deals, wallets, and
redemption records, and enforces the money rules so they cannot be skipped
by a buggy screen.

## How to picture the system

Think of three layers:

1. **Screens people use** — the pages in the phone/browser (feed, claim,
   merchant keypad, admin review).
2. **The brain / filing cabinet** — Postgres (via Supabase): every deal,
   claim, OTP, wallet balance, and fee lives here.
3. **Payment rails** — Stripe (card top-ups) and IntaSend (M-Pesa STK).
   They move money in; MAANTA’s ledger records what happened to merchant
   wallets.

Auth (who is logged in) is handled by **Clerk**. The app does not invent
its own password system.

## Who uses which part of the app

| Who | What they do in the product | Where it lives in the app |
|---|---|---|
| Shopper | Browse mall deals, claim, show OTP at the till | Feed / deals / tickets |
| Merchant | Onboard, top up wallet, create deals, enter OTP to verify | `/merchant/*` |
| Agent | Lock merchant leads (48h), get credit when merchant onboarded | `/agent/*` |
| Admin | Approve merchants, review redemptions/disputes, reporting | `/admin/*` |
| Public | Marketing pages + waitlist | Public site routes |

Launch proving ground is **BBS Mall (Node 0)** — the feed is scoped to a
mall (“node”). Wrong mall cookie ⇒ empty feed, not a bug in deals data.

## The core money loop (what actually earns MAANTA money)

1. Merchant puts money in a **prepaid wallet**.
2. Merchant publishes a deal.
3. Shopper **claims** the deal → gets a short-lived **OTP ticket**.
4. At the counter, merchant **verifies** that OTP.
5. On successful verification, MAANTA debits **KES 30** (success fee) from
   the wallet — or records **arrears** if the wallet cannot cover it
   (**verify-anyway**: shopper still walks away redeemed; finance follows
   up later).
6. Merchants at **zero balance** cannot create new deals.

That claim → verify → fee path is the product’s spine. Everything else
(plans, boosts, trials, admin tools) supports or protects it.

## What “the code” is protecting (business rules baked in)

These are not just slide-deck rules; they are enforced in the database /
app logic:

- KES 30 success fee on verified redemption (all plans).
- Elite trial = 30 days, then 7-day grace, then auto-downgrade to Standard
  if unpaid.
- Verify-anyway + arrears rather than blocking the shopper at the till.
- Zero-balance gate on new deal creation.
- Role self-escalation blocked (a shopper cannot quietly become admin).
- Ledger entries for money movements are atomic and idempotent (same
  payment provider reference cannot double-credit a wallet).

If someone asks “can we change X?”, check `docs/maanta-decisions-log.md`
first — frozen rules need a new decision entry.

## What is *not* in this repo

- The live **waitlist / email automation** system (lives in the email
  platform; schema notes are documented separately).
- Draft legal docs are in the repo but are **not** lawyer-reviewed /
  published product terms yet.
- Notion remains the ops source of truth; `docs/` mirrors approved exports.

## How to “test like a founder” without reading code

Use separate accounts per role (admin / shopper / merchant). For
redemption, you need **two phones**: one shopper claim ticket, one merchant
keypad. See `docs/maanta-launch-ops-runbook.md`.

The automated safety net: unit tests in the app + SQL money-path tests
against a local database in CI. Those exist so engineers cannot break the
fee path silently.

## Where to dig next (when you need depth)

| Topic | Doc |
|---|---|
| Payments / wallet / FX | `docs/skills/payments-rails.md` |
| Redemption disputes | `docs/skills/redemption-disputes.md` |
| Auth (Clerk) | `docs/skills/clerk-auth.md` |
| BBS Mall seed / Node 0 | `docs/skills/node0-seed-bbs-mall.md` |
| Agent lead attribution | `docs/skills/agent-attribution.md` |
| UI roles walkthrough | `docs/skills/ui-walkthrough-roles.md` |

## Bottom line for decisions

You do not need to read TypeScript to run the company. You do need to
know: **one app, four roles, one mall first, one fee event that must never
be wrong**. When prioritizing engineering, ask: does this make claim →
verify → KES 30 more reliable, more usable at BBS Mall, or safer for
wallet money? If not, it is usually later.
