# MAANTA project overview

Last updated: 2026-07-26 · Owner: founder · Repo mirror of the Notion overview.

## What MAANTA is

MAANTA is an in-mall deals platform. Merchants publish time-limited deals;
shoppers claim a deal in the app and receive an OTP redemption ticket; the
merchant verifies the code at the counter and MAANTA charges a **KES 30 success
fee** from the merchant's prepaid wallet. Launch is at **BBS Mall, Nairobi
(Node 0)**, which stays the sole proving ground until product-market fit is clear.

## Launch strategy

- **Node 0: BBS Mall, Eastleigh.** Every merchant, deal, and redemption
  defaults to the `BBS Mall` node until expansion is a deliberate decision.
- **Launch window: November 2026**, preceded by a one-month waitlist
  campaign run by the same agency BBS Mall uses.
- Pre-launch, the public website's job is traction: separate **shopper**,
  **merchant**, and **mall-operator** waitlists so launch communications are
  segmented from day one.

## Actors and surfaces

| Actor | Surface | Key actions |
|---|---|---|
| Shopper | shopper app (mobile-first PWA) | Browse deals → claim → get OTP ticket → redeem in person |
| Merchant | merchant app | Onboard → top up wallet → create deals → verify redemption codes at the keypad |
| Agent | agent dashboard | On-ground sales: lock merchant leads (48h exclusivity), attributed on onboarding |
| Admin | `/admin` | Approve merchants, fraud/dispute review, plans & trials, reporting |
| Public/waitlist | Public site + external forms | Segmented waitlist signup: shopper / merchant / mall operator |

## Commercial model

- **KES 30 success fee** per verified redemption, charged on all plans at the
  point of merchant verification. If the wallet can't cover it, the fee is
  recorded as **arrears** rather than blocking the shopper's redemption
  (verify-anyway); merchants at zero balance can't create new deals.
- **Prepaid merchant wallet**, topped up via Stripe Checkout (card,
  multi-currency: KES/USD/EUR/GBP with live FX conversion to KES) or M-Pesa
  STK via IntaSend (KES). Stripe is in sandbox during testing; IntaSend
  availability is not assumed.
- **Boosts**: KES 500 for 24 hours of boosted deal placement.
- **Elite tier**: 30-day free trial → 7-day grace period → auto-downgrade to
  Standard if not converted. Paid Elite: KES 3,500/month (price review Feb 2027).

## Technical state (as of this update)

- **Stack**: Next.js App Router + Supabase (Postgres, Auth, RLS, storage),
  deployed via Vercel; Supabase project currently in AWS `eu-west-1`.
- **Money movements** all flow through the `record_merchant_ledger_entry` RPC —
  atomic, idempotent by provider reference. Redemption verification is the
  self-authorizing `verify_redemption` RPC. See `docs/skills/payments-rails.md`
  and `docs/skills/redemption-disputes.md`.
- **UI**: the frozen wireframe system (`maanta-app/design/`) is implemented
  across shopper/merchant/admin/agent/public surfaces. The shopper surfaces
  additionally run a **Claude-inspired design system** (`src/components/ui/claude/`,
  DM Sans) with TGTG-style Discover rails on `/feed` and a Leaflet Browse
  map+list on `/browse`; frozen hard rules (YOU PAY, amber CTA, closed
  vocabulary) are preserved. Merchant GPS (`lat`/`lng`) backs pins/distance
  alongside `what3words_address`.
- **Auth**: **Clerk** (phone OTP + email) wired as a Supabase third-party auth
  provider (Twilio Verify decommissioned 2026-07-20); role self-escalation
  blocked at DB level.
- **Notifications**: Web Push to merchants (top-up received, trial expiry tasks).
- **Testing/CI**: vitest suite + GitHub Actions.
- **Legal**: draft ToS, privacy, refund/wallet, KYC/AML docs in
  `maanta-app/legal/` — internal drafts only, pending lawyer review and Kenya
  incorporation (November 2026 Nairobi trip decision).

## Founder testing model

The founder acts as admin, shopper, and merchant during testing (separate
accounts per role), with family-assisted testing when a flow needs genuinely
separate people/devices — most importantly redemption, where shopper and
merchant must be two phones in two hands at the shop. Details in
`maanta-launch-ops-runbook.md`.

## What is NOT in this repo

- The public waitlist: signups live in the email platform (decided
  2026-07-10; platform confirmed later), along with its segments and
  automations — see `maanta-waitlist-data-schema.md`.
- Notion operating docs (this `docs/` tree mirrors approved exports).

## Documentation workflow

**Notion is the source of truth** for drafting and approving ops docs;
approved docs are exported as markdown to Google Drive and mirrored here
(and later into Obsidian). The repo is the source of truth for anything
describing code behavior.

## The three workstreams

1. **Software engineer** — take the current build to launch-ready:
   stability of the shopper claim→redeem, merchant onboard→verify, and
   admin fraud/dispute journeys; waitlist capture; M-Pesa readiness. See
   `maanta-technical-handoff.md` and `maanta-launch-readiness-tracker.md`.
2. **AI lead** — keep MAANTA a documented, analytics-ready operating
   system: segmentation logic, funnel definitions, decisions log, durable
   skills docs. See `maanta-claude-operating-system.md` and
   `maanta-email-segmentation-plan.md`.
3. **Marketing agency** — run the one-month pre-launch waitlist campaign
   with role-segmented messaging. See `maanta-marketing-agency-brief.md`
   and the three email-sequence docs.

## Current phase

Pre-launch. Priorities: keep launch-critical flows stable, build the
segmented waitlist, prepare the one-month agency campaign, and keep
documentation portable per `docs/maanta-claude-operating-system.md`.
