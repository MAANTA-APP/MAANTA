# Admin console and Founder command centre — redesign record (2026-09-03)

**Status:** CURRENT — implemented on branch `claude/maanta-admin-founder-redesign-ms7w2k`.
**Authorisation:** founder brief "MAANTA ADMIN + FOUNDER PILOT COMMAND CENTRE", 2026-09-03.
**Read this before touching** `maanta-app/src/app/admin/*`, `maanta-app/src/app/founder/*`,
`components/nav/admin-sidebar.tsx`, or any surface that prints `max_claims`.

The brief drew one line and this document keeps it: **Admin operates MAANTA;
Founder understands and commands the pilot.** They share components and reads.
They do not share a job.

> The brief as received was truncated mid-sentence in its VISITS & REDEMPTIONS
> section ("Successful staff/server verification is"). Everything after that
> point — any further Founder, testing or documentation instructions — was not
> seen. The Founder command centre was built from the brief's stated objective
> and the written Node 0 evidence protocol. If the missing tail contained
> requirements, re-issue it and they will be reconciled against this record.

---

## 1. Phase 1 — what existed, measured before anything changed

Every route, who it was for, what it could actually do, and the verdict that
drove the redesign. "Authoritative" names the table or RPC the screen reads.

| Route | Who | Task it supported | Actions that really exist | Authoritative data | Verdict |
|---|---|---|---|---|---|
| `/admin` Overview | admin | glance at the operation | none (links) | `merchants`, `deals`, `redemptions`, ledger RPCs, `app_config`, `admin_ops_log` | **Keep the reads, rebuild the top.** Seven roll-up alerts linked to *lists*; nothing linked to a record |
| `/admin/pilot` | admin (founder reading it) | Node 0 cohort, ladder, evidence classes | none | `merchants` + manifest, genuine-tagged counts, fee RPC | **Keep intact.** Heavily ratcheted; it is Founder content living under an admin guard. Reached from Operations and the Founder command centre |
| `/admin/approvals` | admin | approve merchants | none (links to detail) | `merchants.status = pending` | **Demote from nav.** Reached from Home, the Action Queue and Merchants |
| `/admin/merchants` | admin | find a shop | onboard (link) | `merchants` | Keep; nav label unchanged |
| `/admin/merchants/[id]` | admin | "verify" a merchant | approve/reject, suspend/reinstate, feature, shadow-ban, location, trial | `merchants`, `elite_trial_cap_status` | **Rebuild as Merchant 360.** No staff, deals, claims, ledger, support or audit — six routes to answer one phone call (**D229**) |
| `/admin/customers` | admin | find an account | none (read-only) | `users` | Keep; nav label **Shoppers** |
| `/admin/customers/[id]` | admin | one account's claims | none | `users`, `redemptions` | Keep |
| `/admin/deals` | admin | "Deals" | remove deal | `fraud_events` → `deals` | **Rebuild.** Listed only fraud-flagged deals; no directory, no state, no allocation (**D226**) |
| `/admin/redemptions` | admin | Guardian holds, fraud events, last 15 | release/reject via detail; approve/reject fraud event | `redemptions.status = flagged`, `fraud_events` | Keep as the Guardian/fraud review; reached from Visits |
| `/admin/redemptions/[id]` | admin | one ticket | release/reject, appeal, reverse fee | `redemptions`, `admin_redemption_detail`, ledger, `fee_reversals` | Keep unchanged |
| `/admin/reports` | admin | KPIs + chart | none | counts, fee RPC, `admin_redemptions_per_day` | Keep; body extracted to one shared component so `/founder/reports` can render it under its own guard (**D225**) |
| `/admin/audit` | admin | read `admin_ops_log` | none | `admin_ops_log` | Keep |
| `/admin/agents`, `/[id]` | admin | field reps and leads | none | `agents`, `leads` | Demote from nav; reached from Operations. Acquisition is on hold (D159) |
| `/admin/support`, `/new` | admin | `agent_tasks` queue | override (complete + audit line), create ticket | `agent_tasks` | Keep; merchant name now opens Merchant 360, overdue read from `due_at`, ticket form accepts `?merchant=` |
| `/admin/billing` | admin | plans and trials | mark paid, downgrade, grant trial | `merchants` tier columns | Keep as a system tool |
| `/admin/resources` | admin | resource centre | none | `lib/admin-resources.ts` | Keep as a system tool |
| `/founder` | admin, cofounder | "executive dashboard" | none | user counts, deal count, fee RPC | **Rebuild.** Was a smaller Admin overview: user totals, live deals by node, links. Answered nothing about whether the pilot works |
| `/founder/yesterday` | admin, cofounder | daily brief | none | genuine-tagged day counts, manifest | Keep intact (heavily ratcheted) |
| `/founder/reports` | admin, cofounder | reports | — | — | **Was a redirect into `/admin/reports`**, bouncing a co-founder to `/` (**D225**) |

What did not exist anywhere in the console: a merchant's staff seats, a
merchant's ledger, a deal directory, any distinction between a claim, an
arrival, a queue entry and a redemption, and any per-record alert.

What was dangerous: nothing was found that moves money without an RPC and an
audit line. The dangers were of the quieter kind — a co-founder route that
redirected into a wall, a "Deals" page that showed almost no deals, and an
allocation number with no stated meaning.

---

## 2. The information architecture that shipped

### Admin (`components/nav/admin-sidebar.tsx`)

| Item | Route | Job |
|---|---|---|
| Home | `/admin` | what needs attention right now, then queues, supply, evidence, money, flags, audit tail |
| Action queue | `/admin/queue` | every proven exception, one item per record, opening the record |
| Merchants | `/admin/merchants` (+ `/approvals`, `/[id]` Merchant 360) | approve, find, understand a shop |
| Shoppers | `/admin/customers` | accounts and their claims |
| Deals | `/admin/deals` | directory with state and allocation; moderation retained |
| Visits & redemptions | `/admin/visits` (+ `/redemptions` Guardian review) | the physical funnel |
| Support | `/admin/support` | the `agent_tasks` queue |
| Operations | `/admin/operations` (+ `/pilot`, `/agents`) | node status, runtime flags with meaning, field views |
| Audit | `/admin/audit` | `admin_ops_log` |
| *System:* Billing, Reports, Resources | | low-frequency tools below a divider |
| *Leaves the console:* Founder, Live product | | |

Demoted routes light their owning section (`OWNED_BY` in the sidebar), so an
operator on `/admin/approvals` sees Merchants active rather than nothing.

### Founder (`components/nav/founder-header.tsx`)

Command centre `/founder` · Yesterday `/founder/yesterday` · Reports
`/founder/reports`; then Admin console (only for a role that can open it) and
the live product.

---

## 3. The rules every new surface obeys

1. **Deterministic or absent.** Every alert and status names the condition
   that fired. Rules live in pure modules with tests: `lib/admin-action-queue.ts`,
   `lib/visit-funnel.ts`, `lib/admin-deal-state.ts`, `lib/claim-allocation.ts`,
   `lib/founder-command-centre.ts`. No score, no ranking beyond severity and
   age, no prediction.
2. **A failed read is never a zero, and never an all-clear** (D164 / D185).
   Counts are nullable to the cell; an unreadable Action Queue category renders
   one alert item rather than silence.
3. **Every list read is bounded, and a full page is unreadable.** The Action
   Queue loader treats a page that hit `ROW_CAP` as null, because a queue that
   quietly drops items is an all-clear for the items it dropped.
   `admin-surfaces-bounded-reads.test.ts` walks every new surface.
4. **Shared predicates, never re-derived.** Supply is `withPublicMerchant`
   (the feed's rule, demo-aware); genuine-tagged is `genuineTagged` (D188);
   money is `readLedgerFeeTotals` (D211); evidence class is the cohort
   manifest (D174 / D184). External field validation is never inferred from a
   demo flag.
5. **Dashboard → record.** An Action Queue item opens the record with the
   action (`/admin/merchants/[id]#actions`, `/admin/redemptions/[id]`), not a
   list. Where a record has no page (a fraud event, a support task) it opens
   the surface that carries its action.
6. **No control the backend does not enforce.** Merchant 360 states plainly
   what the console cannot do — pause or re-allocate a deal (merchant-only
   `PATCH /api/deals/[id]`), lift a trust-metric hide (database-owned),
   blacklist a shopper (no route) — rather than drawing a button (**D230**).
7. **Doctrine travels with the item.** The zero-balance item carries the
   2026-08-24 ruling that nobody raises the credit wall with the merchant; the
   demo-mode item carries D189. An alert without its consequence invites the
   conversation that destroys the signal.
8. **Frozen UI rules hold.** State is icon + word; the redeemed chip is ink,
   never amber, never celebrated; money is never coloured; no bordered-card
   idiom; no literal `15` — the grace and Fast Visit windows interpolate their
   constants.

---

## 4. Claim allocation — the D236 vocabulary

Founder ruling 2026-09-03 (numbered **D236** in the brief; recorded in the
register as **D227** because the repo is canonical for drift IDs and D227 was
the next free number — the same reconciliation as D172/D168):

> `max_claims` means the maximum number of shopper claims that may be issued
> for the deal.

Three words, everywhere: **Claim allocation** (`max_claims`, or "No cap"),
**Claims issued** (`claims_count`), **Claims remaining** (allocation − issued,
floored at zero). Never "redemption limit", never "stock".

The code already agreed: `claim_deal` refuses a new claim when
`claims_count >= max_claims` (NULL = unlimited) and nothing else reads the
column — `verify_redemption` ignores it, so lowering the allocation stops new
claims and touches no ticket already issued. `lib/claim-allocation.ts` mirrors
that `>=` exactly and `claim-allocation.test.ts` asserts every surface that
prints the cap imports it: admin deals, Merchant 360, merchant deal detail,
the archived list and the wizard ("Claim allocation" field, "claim allocation
N" in the summary). Shopper surfaces already said "N left" / "Fully claimed"
and were left alone.

---

## 5. The visit funnel — what each stage is and is not

`lib/visit-funnel.ts` places every `redemptions` row in exactly one stage, in
this order: terminal status first (`success` → **Redeemed**, `flagged` →
**Held**, `failed` → **Rejected**), then for pending rows: past `expires_at` →
**Expired**; a `merchant_presentations` row still `waiting` and unexpired →
**In queue**; `arrived_at` set → **Arrived**; otherwise **Claimed**.

Redeemed is the only stage at which money moved. A claim is not an arrival, an
arrival is not a redemption, a queue entry is not a redemption, and a QR scan
is not a redemption. `/admin/visits` renders reach per column (cumulative,
from each column's own evidence — a keypad redemption with no scan is a
redemption with no arrival, and that is true) and where each claim is now.
Rows claimed before `20260824130000` carry no `claimed_at` and fall outside
every window, deliberately.

---

## 6. The Founder command centre — how it decides what to say

`/founder` renders, in order: the verdict (external merchants enrolled, the
cumulative ladder, the rung reached — from the manifest and genuine-tagged
successes by enrolled merchants only); the clocks (eight-week kill criterion
from Merchant 01's `onboardedAt`; the claim → walk-in tripwire, not computed
below `MIN_CLAIMS_FOR_MERCHANT_RATIO` external claims and tripped under
roughly 1 in 3); the next move (`pilotNextMove`, a deterministic reading of
the written priority sequence, flagged when demo mode must be OFF for it);
right now (demo mode, merchants live, shopper-visible deals, the three
queues, gated); the last seven days for the external cohort and, separately
labelled, for every genuine-tagged merchant; the daily brief; accounts; the
gated operations block.

Every `/admin/*` link sits behind `canAccessAdminConsole(user.role)`. A
co-founder sees every number and no link into a wall.

---

## 7. Guards added

| Guard | What it pins |
|---|---|
| `lib/__tests__/claim-allocation.test.ts` | the `>=` boundary, NULL = no cap, the vocabulary, every surface imports the helper |
| `lib/__tests__/admin-deal-state.test.ts` | state order: ended → paused → expired/grace → fully claimed → live |
| `lib/__tests__/visit-funnel.test.ts` | stage order, one money stage, reach from own evidence |
| `lib/__tests__/admin-action-queue.test.ts` | every rule, unreadable-is-not-empty, doctrine text, ordering |
| `lib/__tests__/founder-command-centre.test.ts` | ladder, clock, tripwire floor, next move never says "raise the wall" |
| `lib/__tests__/admin-founder-ia.test.ts` | sidebar order, demoted routes, owning-section highlight, founder header, `/founder/reports` under the founder guard |
| `lib/__tests__/admin-surfaces-bounded-reads.test.ts` | bounded reads on every new surface, shared predicates, gated founder links, Merchant 360 anchors and honest controls, funnel derivation |

Existing ratchets re-pointed rather than weakened: `claims-metric.test.ts` and
`ledger-fee-semantics.test.ts` now read `components/admin/platform-report.tsx`
(where the report's reads moved); `admin-dashboard.test.ts` asserts the new
IA; `merchant-onboarding-phone-optional.test.ts` asserts the D158 rule against
Merchant 360's two contact rows; `field-labels.test.ts` follows the ticket
form's textarea to its new line.

---

## 8. Not built, and why

- **Controls the backend does not enforce** — see **D230**. Pause/re-allocate
  a deal, lift a hide, blacklist a shopper. Each needs a route, an audit
  action and a founder decision that admin should own it.
- **Node scoping on the Action Queue.** An exception at another node is still
  an exception; the queue is platform-wide and says so. Home's KPIs keep the
  node switcher.
- **Moving `/admin/pilot` under `/founder`.** It is Founder content behind an
  admin guard, but it is the most heavily ratcheted page in the repo and
  cofounder access to it is a product decision. The command centre reads the
  same manifest and helpers and links to it, gated.
- **Any AI-generated or scored alert.** Not one rule scores.

---

## 9. How to extend

- A new Action Queue rule: add the input to `ActionQueueInput`, the rule to
  `buildActionQueue` with its reason text, a bounded read to
  `admin-action-queue-data.ts`, and a case to `admin-action-queue.test.ts`.
- A new admin surface: it goes in `admin-surfaces-bounded-reads.test.ts`'s
  page list, or the bounded-read guard is vacuous for it.
- A new founder reading: a pure function in `lib/founder-command-centre.ts`
  with a test, then the page. Never a rate below the minimum sample.
