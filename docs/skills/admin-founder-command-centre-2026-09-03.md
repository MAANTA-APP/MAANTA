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
| `/admin/merchants/[id]` | admin | "verify" a merchant | approve/reject, suspend/reinstate, feature, shadow-ban, location, trial | `merchants`, `elite_trial_cap_status` | **Rebuild as Merchant 360.** No staff, deals, claims, ledger, support or audit — six routes to answer one phone call (**D235**) |
| `/admin/customers` | admin | find an account | none (read-only) | `users` | Keep; nav label **Shoppers** |
| `/admin/customers/[id]` | admin | one account's claims | none | `users`, `redemptions` | Keep |
| `/admin/deals` | admin | "Deals" | remove deal | `fraud_events` → `deals` | **Rebuild.** Listed only fraud-flagged deals; no directory, no state, no allocation (**D232**) |
| `/admin/redemptions` | admin | Guardian holds, fraud events, last 15 | release/reject via detail; approve/reject fraud event | `redemptions.status = flagged`, `fraud_events` | Keep as the Guardian/fraud review; reached from Visits |
| `/admin/redemptions/[id]` | admin | one ticket | release/reject, appeal, reverse fee | `redemptions`, `admin_redemption_detail`, ledger, `fee_reversals` | Keep unchanged |
| `/admin/reports` | admin | KPIs + chart | none | counts, fee RPC, `admin_redemptions_per_day` | Keep; body extracted to one shared component so `/founder/reports` can render it under its own guard (**D231**) |
| `/admin/audit` | admin | read `admin_ops_log` | none | `admin_ops_log` | Keep |
| `/admin/agents`, `/[id]` | admin | field reps and leads | none | `agents`, `leads` | Demote from nav; reached from Operations. Acquisition is on hold (D159) |
| `/admin/support`, `/new` | admin | `agent_tasks` queue | override (complete + audit line), create ticket | `agent_tasks` | Keep; merchant name now opens Merchant 360, overdue read from `due_at`, ticket form accepts `?merchant=` |
| `/admin/billing` | admin | plans and trials | mark paid, downgrade, grant trial | `merchants` tier columns | Keep as a system tool |
| `/admin/resources` | admin | resource centre | none | `lib/admin-resources.ts` | Keep as a system tool |
| `/founder` | admin, cofounder | "executive dashboard" | none | user counts, deal count, fee RPC | **Rebuild.** Was a smaller Admin overview: user totals, live deals by node, links. Answered nothing about whether the pilot works |
| `/founder/yesterday` | admin, cofounder | daily brief | none | genuine-tagged day counts, manifest | Keep intact (heavily ratcheted) |
| `/founder/reports` | admin, cofounder | reports | — | — | **Was a redirect into `/admin/reports`**, bouncing a co-founder to `/` (**D231**) |

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
   blacklist a shopper (no route) — rather than drawing a button (**D236**).
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
register as **D233** because the repo is canonical for drift IDs and D233 was
the next free number — the same reconciliation as D172/D168):

> `max_claims` means the maximum number of shopper claims that may be issued
> for the deal.

Three words, everywhere: **Claim allocation** (`max_claims`, or "No cap"),
**Claims issued** (`claims_reserved`: claims holding a slot right now),
**Claims remaining** (allocation − issued, floored at zero). Never "redemption
limit", never "stock".

**Not `claims_count`.** That column is incremented only inside
`verify_redemption` — it counts redemptions — and reading it as "issued" was
the production defect the audit branch measured (191 of 198 claim-holding
deals disagreed with their own counter; register **D223**). The first draft of
this redesign's helper made the same mistake in TypeScript and was corrected
on integration. `claims_reserved` is a PostgREST computed column
(`20260903120000_claim_allocation_cap.sql`) backed by the same
`claim_occupies_allocation()` the `redemptions_reserve_claim_slot` trigger and
`claim_deal` enforce with; occupancy is **derived** (founder ruling D224):
`success` and `flagged` hold a slot, a `pending` claim holds one only while
unexpired, `failed` never does, so "Claims remaining" rises on its own as
unused claims lapse.

`lib/claim-allocation.ts` is the one helper (`claimsReserved` by name, so
`claims_count` cannot be passed by accident); the shopper helpers in
`lib/ending-soon.ts` delegate to it. `claim-allocation.test.ts` asserts every
surface that prints the cap imports it and selects `claims_reserved`: admin
deals, Merchant 360, merchant deal detail (Claims issued / Claims remaining /
Redeemed / Verified at shop), the wizard ("Claim allocation" field and note),
and the archived list, which states allocation and redeemed rather than a
fraction because a snapshot carries no live occupancy.

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
| `lib/__tests__/redemption-doctrine.test.ts` | the restored doctrine: one money stage and it is the verified redemption; every "verified" KPI is a `success` read; no Fast Visit KPI card; no ratio below the sample floor |
| `components/__tests__/merchant-360-amber-ration.test.ts` | frozen rule 1 on Merchant 360, counted from **rendered** HTML: one amber (Approve) when pending, zero otherwise; the two source pages keep their default (§12) |

Existing ratchets re-pointed rather than weakened: `claims-metric.test.ts` and
`ledger-fee-semantics.test.ts` now read `components/admin/platform-report.tsx`
(where the report's reads moved); `admin-dashboard.test.ts` asserts the new
IA; `merchant-onboarding-phone-optional.test.ts` asserts the D158 rule against
Merchant 360's two contact rows; `field-labels.test.ts` follows the ticket
form's textarea to its new line.

---

## 8. Not built, and why

- **Controls the backend does not enforce** — decided by capability (founder
  ruling, second 2026-09-03 entry): **D237** pause is satisfied by the
  merchant's own control and nothing was built; **D238** blacklist was
  integrated from the audit branch (see §10); **D239** trust-metric hide is
  not built because no rule requires a manual override, and Merchant 360 says
  so.
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

---

## 10. Integration with the Merchant 01 engineering completion (2026-09-03)

`origin/claude/maanta-audit-merchant-01-a67nk2` (three commits, no PR) was
merged into this branch rather than ported piece by piece, on the founder's
instruction to integrate the authorised D171 blacklist instead of writing a
second implementation. Its blacklist migration is written on top of its
allocation migration (same `claim_deal` body), so the two come together, and
its allocation semantic is what makes "Claims issued" truthful (§4).

What arrived with it — **all three applied to production and read back on
2026-09-03**: ledger 110/110, every version equal to its repo filename,
`claim_occupies_allocation` and the reserve-slot trigger present, `claim_deal`
refusing `user_blacklisted`, `verify_redemption` untouched, `admin_ops_log`
accepting a `user` target. (An earlier draft of this section said none was
applied; the founder's instruction to read the ledger before acting is what
caught it.)

| Migration | Row | What it does |
|---|---|---|
| `20260903120000_claim_allocation_cap.sql` | D223 | `claims_reserved` computed column, `claim_occupies_allocation()`, a `BEFORE INSERT` trigger on `redemptions` that enforces the allocation for any writer, `claim_deal` re-tested against occupancy |
| `20260903130000_enforce_user_blacklist.sql` | D171 → **D238** | `claim_deal` refuses a blacklisted shopper before any slot is reserved; `verify_redemption` untouched (verify-anyway); a shopper cannot clear their own flag; `admin_ops_log` accepts a `user` target |
| `20260903140000_repair_merchant_tenant_policies.sql` | D168 | tenant RLS policies filter instead of erroring |

**Deployment order was migrations first, and that half is done.** The
redesigned shopper, merchant and admin surfaces select `claims_reserved`; had
the application deployed before the migrations applied, every deal read would
have failed and the feed would have rendered its read-failure state
(`docs/ops/migration-deployment-plan-2026-09-03.md` §0). The three were applied
and read back on 2026-09-03 under their repo versions — the ledger needed no
repair this time — so the application may now deploy against a database that
already carries the contract. **Do not reapply them.**

**Drift IDs.** This branch's eleven rows are **D231–D241**, behind `main`'s
D223–D230: D223/D224 from the Merchant 01 completion, and D225–D230 the six
PR #317 truthfulness rows that #318 triaged into `main`. They were D225–D235
on this branch until #318 landed; the first reconciliation with `main`
dropped `main`'s six rows, and the renumbering that restored them is why
every ID in this document moved by six. D236 is the decomposition row (into
D237 pause, D238 blacklist, D239 trust-metric hide); D240 is the browser
proof; D241 the amber ration. The brief's own "D236" label for the
claim-allocation ruling is not a register ID. The register in `main` is
canonical, and whichever branch lands second renumbers; PR #317's remaining
rows start at D249.

### The three capabilities, decided

| Capability | Decision | Evidence |
|---|---|---|
| Pause deal | **Satisfied — nothing built.** Merchants hold Pause / Resume on the deal page; `claim_deal` refuses `deal_paused`; `verify_redemption` ignores `is_paused`. Lowering the allocation is accepted by the same route (refused below what is held) but the edit sheet does not yet expose the field — an observation, not a blocker | `supabase/tests/claim_deal_pause_gate_test.sql`, `claim_allocation_cap_test.sql` INVARIANT F (**D237**) |
| Blacklist shopper | **Integrated.** Control on the shopper's account page beside the chip; Action Queue item for a blacklisted account holding a live claim states the verify-anyway boundary and points at the lever | `user_blacklist_enforcement_test.sql`, `user-blacklist.test.ts`, the route test (**D238**, pending-deploy) |
| Lift trust-metric hide | **Not built.** `recalculate_trust_metric` applies the 0.50 threshold unconditionally on every recalculation; no doctrine names a manual override; a toggle would be overwritten. Merchant 360 states the absence | `docs/skills/redemption-disputes.md` §"The trust metric, as it actually runs" (**D239**) |

### The restored review criteria, as ratchets

`lib/__tests__/redemption-doctrine.test.ts` pins: exactly one money stage in
the funnel and it is the verified redemption; every "verified" KPI on the
founder and Merchant 360 surfaces is a `status = success` read; the visits and
merchant surfaces say in words what is not a redemption; no redesigned surface
renders a Fast Visit KPI card (the Operations flag row states the switch and
its OFF meaning); the founder page computes no ratio below the minimum sample
and uses no trend word; Merchant 360 renders a failed deals or claims read as
unknown, never "no live deal" or 0; every table sits in an `overflow-x-auto`
container and every KPI grid starts at one to three columns.

### Browser proof

`e2e/admin-founder-redesign.spec.ts` encodes the founder's acceptance list —
signed-out boundaries, the iPhone-sized drawer order, Home → full queue, Action
Queue → record drill-down, Merchant 360's eight sections, the five funnel
columns, the founder verdict/clocks/next move, `/founder/reports` under the
founder shell, and the co-founder boundary (no `/admin` link, `/admin` refuses).
It runs against a **non-production** target with `E2E_BASE_URL`,
`E2E_ADMIN_STORAGE` and optionally `E2E_COFOUNDER_STORAGE`
(`docs/ops/browser-e2e-provisioning-2026-09-03.md` is the provisioning
procedure), and skips — never a false green — without them.

The status of the proof itself is recorded in §11 below, honestly, including
what could and could not be executed from an engineering session.

## 11. Browser proof — what ran, what it showed, what it does not prove (2026-09-03)

**Result: 12 of 12 passing at iPhone 13 size (390 × 844), on a local stack
built from this branch. Not yet run against a deployment — see D240.**

### What ran

- **The database is the real one, fresh.** All 110 files in
  `supabase/migrations/` applied in order to native PostgreSQL 16 with PostGIS,
  the same chain the CI `db-tests` job runs. The 42 SQL suites under
  `supabase/tests/` passed on that chain first (42/42, including the three new
  suites from §10). The Supabase CLI could not start its Docker images from
  this session (image pulls blocked), so the platform was reproduced natively:
  the `anon` / `authenticated` / `service_role` / `authenticator` roles, the
  `extensions` schema, and `auth.uid()` / `auth.role()` / `auth.jwt()` reading
  `request.jwt.claims` exactly as Supabase's do.
- **The API is PostgREST 12.2.8** serving that database with HS256 JWTs minted
  under a local secret, so RLS and the tenant policies were live, not mocked.
- **Auth is the Supabase strategy** — the code default and what CI uses. A
  40-line GoTrue stand-in answered only the three calls `@supabase/ssr` makes
  to keep a session alive (`/user`, refresh, logout) and issues nothing: the
  two proof sessions (one `admin`, one `cofounder`) were minted offline and
  turned into Playwright storage states by `createServerClient` itself, so
  the cookie the app read is the cookie the app writes.
- **The app is this branch on the development server**, not a production
  build; the production build is gated separately by `npm run build`.
- **The seed** was small and deliberate: one active shop holding the KES 300
  opening credit and one `success` with its KES 30 ledger line; one pending
  shop; an invited seat never linked; three deals — live with allocation 10,
  paused, fully claimed at allocation 1; six claims sitting in six funnel
  states (claimed, arrived-and-stale, in queue, held, redeemed, the fully
  claimed deal's one); an overdue support task; an unresolved velocity signal;
  demo mode ON. The Standard-tier active-deal cap (D206) was disarmed for the
  three seed rows only — it is a product rule, not part of this proof — and
  re-armed in the same transaction; the claim-slot trigger stayed armed.

### What it showed

| Founder's item | Test | Seen |
|---|---|---|
| Authorization boundaries | 5 signed-out routes → `/login?next=…` | `/admin`, `/admin/queue`, `/admin/merchants`, `/founder`, `/founder/reports` all redirect; the login page renders |
| iPhone-sized admin navigation | drawer order | Home · Action queue · Merchants · Shoppers · Deals · Visits & redemptions · Support · Operations · Audit, a divider, SYSTEM (Billing · Reports · Resources), Founder; no "Approvals", no "Customers"; body overflow 0 px |
| Home | attention first | "Needs attention right now" above everything, "Full action queue · 3 urgent · 8 need attention", money and evidence below |
| Action Queue → record | first item click | Lands on a merchant 360 (`/admin/merchants/<uuid>`), never a list; the card states the rule that fired and how long it has stood |
| Merchant 360 | eight headings | Identity · Staff seats · Deals · Shopper activity · Economics · Support · Admin actions · Audit; "Claims issued 5 of 10 · 5 remaining · redeemed 1"; "Fully claimed · 1 of 1 issued"; "Not available from the console, by design" naming D237 / D239 / D238 |
| Visits & redemptions | five columns | 1. Claim 6 · 2. Arrival / check-in 3 · 3. Queue 1 · 4. Verification 2 · 5. Redemption 1, and "The only column where the success fee is charged" |
| Founder command centre | verdict, clocks, next move | "External field validation is 0"; ladder rung "none"; kill criterion "Not started"; tripwire "Not computable yet" (below the sample floor); Next move = Merchant 01 with the demo-mode warning; "Admin console" in the header for an admin |
| `/founder/reports` | stays under the founder shell | Renders "Platform reporting" at `/founder/reports`, no bounce (D231) |
| Co-founder access | same page, no wall | Same numbers; "Worked in the admin console, which this role cannot open" on each queue; zero `a[href^='/admin']`; `/founder/reports` renders; `/admin` → `/` |

Full-page captures of `/founder` (both roles), the shop-one 360, Operations,
Deals and Shoppers were also taken and read: every page measured 0 px of
horizontal overflow, the Operations flag row reads "Fast Visit · false · OFF —
check-in and the counter queue work, but no points are awarded", and no
surface rendered a read-failure state.

**The one failure, and what it was.** The first run failed "Merchant 360
renders its eight sections": the spec's own selector took the first
`/admin/merchants/…` link in the directory, which is "Onboard a shop"
(`/admin/merchants/new`), and asserted headings on the onboarding form. The
360 page had rendered all eight headings (checked in the served HTML). The
spec now selects a UUID record link. No product change.

### What it does not prove — why D240 stays open

- **Production runs the Clerk strategy.** `clerkMiddleware()` and
  `ensureAppUserFromClerk` — the identity branch production actually takes —
  were not exercised. The role guards, the pages and the data reads are
  strategy-independent; the sign-in and provisioning path is not.
- **No deployment was involved.** Vercel build output, edge middleware
  behaviour and production data are untested by this run.
- **Development server, not `next build` output.**

The closure event for **D240**, by founder ruling on 2026-09-03, is the same
12 tests run against a **Clerk-backed preview deployment**
(`docs/ops/browser-e2e-provisioning-2026-09-03.md`). Automation is the
canonical evidence; the founder's own iPhone walk of the deployed console
supplements it, and stands in for it only if preview execution is genuinely
blocked. Until then the redesign is **browser-proven locally, not
deployed-ready**. After deployment a short production iPhone smoke of Admin and
Founder is still owed — navigation, Action Queue drill-down, Merchant 360,
Visits & redemptions, the founder evidence state and co-founder isolation —
as smoke evidence, not a design review.

### Repeating it

The seed, the session minting and the Playwright config for the local run are
not in the repository — they carry a local JWT secret and minted sessions, and
belong to a throwaway stack. The procedure in words: apply the chain to a
fresh database; create the three platform roles and the `auth.*` helper
functions; run PostgREST against it with `db-anon-role = anon` and the JWT
secret; insert two `auth.users` rows (the platform trigger creates their
`public.users` rows) and promote them to `admin` and `cofounder` as the
service role would (the role-change guard checks `auth.role()`); write
`NEXT_PUBLIC_SUPABASE_URL` / keys / `MAANTA_AUTH_STRATEGY=supabase` to
`.env.local`; mint each session and let `@supabase/ssr` write the cookie into
a storage-state file; run the spec with `E2E_BASE_URL`, `E2E_ADMIN_STORAGE`
and `E2E_COFOUNDER_STORAGE` pointing at those files. Every step is read-only
against the product; the proof presses no button that writes.

## 12. D241 — the amber ration on Merchant 360, fixed the same day

The §11 captures showed three amber primaries on Merchant 360 — "Save
location", "Override (audit-trailed)" and "Grant trial" — and a pending
Standard shop with an open task would have shown four, because Approve is
amber too. Frozen UI rule 1 allows one. The founder ruled "fix now", bounded to
emphasis: no authorization, behaviour, route or product semantics may change.

**Which action is primary.** Approve, and only while the shop is pending. That
is the decision an admin arrives from the Action Queue to make; every other
control on the page is a correction or an ops lever. So the page carries one
amber on a pending shop and none on an active, suspended, rejected or churned
one — a record page in those states has no single primary action, and rule 1
permits zero.

**What changed.** `merchant-location-form.tsx` (used only here) renders its
submit as the design system's outline variant. `OverrideButton` and
`PlanActions` gained an optional `variant` prop, default `"primary"`, so
`/admin/support` and `/admin/billing` — where each IS the page's action — are
untouched; Merchant 360 passes `"ghost"` at both call sites. Suspend, Feature,
Shadow-ban, Reject, Mark paid and Downgrade were already outline.

**The guard rule 1 never had.** `components/__tests__/merchant-360-amber-ration.test.ts`
renders the four composed controls with `react-dom/server` for every merchant
status and counts `bg-brand` in the output — the accent fill and the only way a
button becomes amber. It asserts exactly one amber, labelled Approve, on a
pending shop; zero on every other status; that each demoted control renders
none on its own; that the two source pages still get their amber default; and
that a disabled control is never amber (L9b), which the count relies on. The
frozen-rules audit recorded rule 1 as "not statically checkable" because it
needs render-time state; this is render-time.

**Read back in a browser.** On the local stack after the fix, the rendered DOM
of the active shop's 360 holds **0** elements with the accent class and the
pending shop's holds **1**, the Approve button. The 12-test proof re-ran green.
Full-page captures at iPhone size read as intended: the outline buttons sit in
their sections without competing, and on the pending shop the eye lands on
Approve.

## 13. The Codex review round on the reconciled head (2026-09-03)

The PR head after reconciliation with `main` (#318) was reviewed by Codex at
the founder's request. Five findings, all verified against the tree and fixed
in the PR's own code, each with a guard and a register row (D242–D245):

| Finding | What was true | What is true now |
|---|---|---|
| P1 — supply read | A failed per-shop deal count became `null` and the no-supply rule fired only on `0`, so a read failure was silence | A per-shop `supply-unread` attention item, flagged unavailable; one "Demo mode flag" item stands in when the flag itself is unreadable (D242) |
| P2 — founder held count | Raw `flagged` and `pending` counts, demo rows included, beside an Action Queue that excludes them | `genuineCount` for held claims; `is_demo = false` for pending shops (D243) |
| P2 — fraud read cap | The deals directory's fraud read had a cap and no count, so a full page marked some merchants and not others | `count: "exact"`; past the cap, no marker and "Review markers unavailable" (D244) |
| P2 — queue cap | The live staff-queue read had a cap and no count, so a full page — or "Nobody is waiting" after the in-memory filter — passed as the whole queue | `count: "exact"`; past the cap, "Incomplete, not empty" (D244) |
| P2 — report populations | "All evidence classes" beside fee cards whose reader is genuine-tagged only | Each card names its population; numbers unchanged (D245) |

A second round on the corrected head `ac74a55` found three more, fixed the same
way (D246–D248):

| Finding | What was true | What is true now |
|---|---|---|
| P1 — demo flag unreadable | The next move told the founder to run an evidence step with no warning when the demo-mode read had failed | "Demo mode could not be read — do not run this step yet", ahead of the ON warning (D246) |
| P2 — ladder unreadable | The rung card said "none · next rung 1" for a failed ladder read | A dash and "a read error, not rung zero" (D246) |
| P2 — open tasks | The third Right-now queue counted demo-shop tasks | Merchantless plus non-demo-shop tasks, two head counts, as the Action Queue counts (D247) |
| P2 — fraud total | The newest-10 array length was shown as the shop's unresolved total | `count: "exact"`, the true total, "the N most recent shown" when capped (D248) |
| P2 — opening credit | Derived from the newest-40 ledger page; "None" past 40 movements | Its own one-row read by reference; a dash on failure (D248) |

The head that carried the fixes was rebuilt from `main`'s register (the first
reconciliation had dropped `main`'s six PR #317 rows) with this branch's rows
renumbered to D231–D241 — see the **Drift IDs** paragraph in §10.

A third round on `2955cd5` found four more, fixed in `085653d` (D249–D252).
Two of the four reports named one instance; the tree carried more, and the fix
covers what the tree carried, not what the report listed:

| Finding | What was true | What is true now |
|---|---|---|
| P2 — read-failure identity | `unavailable()` keyed its item id on the category, so when both reads in a category failed the second overwrote the first. **Four** categories carry two reads each — redemption, merchant, balance, evidence — not the one reported | The id is per failed read (`unavailable:<category>:<what>`), so both survive, and `summariseQueue` counts unreadable **reads**, not categories (D249) |
| P2 — fraud link | The queue's fraud item linked `/admin/redemptions?reason=<event_type>`, and the page implements three reasons; any other type landed on a filter it silently ignored | `fraudReviewHref()` sends `reason` only for a type the page implements and otherwise links the unfiltered list; the guard asserts `FRAUD_REVIEW_FILTERS` **equals** the page's own parsed `REASONS`, so adding one to either side without the other fails (D250) |
| P2 — reachable cell | `/admin/operations` printed a reachable-deal count computed from a demo-mode flag it may have failed to read | The cell dashes unless the flag read succeeded, and the caption says the exposure is unknown, not false (D251) |
| P2 — fee populations | Merchant 360's three fee cards sat under counts of a wider population | Each names its own: "Genuine-tagged rows only (ledger contract)" (D252) |

Two alternatives in those threads were declined, on the record: widening
`/admin/redemptions`'s reason filter to accept every event type is a product
change outside this PR, and computing a per-record fee total from redemption
rows would be a second definition of the success fee — `readLedgerFeeTotals`
is the one.

A fourth round on `a99003d` found five more, fixed in the same way (D253–D257),
and raised the two gaps the founder had already observed:

| Finding | What was true | What is true now |
|---|---|---|
| P2 — banner wording | The Action Queue's read-failure banner counted items and called them categories — the overstatement D249 had just corrected one function away, left standing above it | "N of the queue's reads", matching `summariseQueue` (D253) |
| P2 — live queue card | "In queue now" said "at this moment" while `countStages` runs over the newest-60 claims; its sibling card already disclosed the same limit | The hint names the page it reads and adds "not the whole queue" (D254) |
| P2 — Support counts | Overdue was filtered in memory from 50 tasks ordered by *creation* time, so an overdue task outside the page vanished and, with none inside it, the warning vanished too; the heading showed the page length as the open total | Overdue is its own exact head count, the heading reads the exact total, a capped page says so, and a failed read says "unknown, not none" (D255) |
| P2 — the suite's own honesty | An empty queue let the drill-down test annotate itself and pass, inside the 12-of-12 D240 closes on | An empty queue fails, with the remedy in the message: a proof that did not run is not a pass (D256) |
| P2 — the suite vs D250 | The destination assertion rejected the bare `/admin/redemptions` that D250 deliberately produces — two fixes on one head disagreeing | The assertion accepts it and still rejects a bare directory; the guard extracts the spec's own regex and runs `fraudReviewHref()` through it, so they cannot drift apart (D257) |

**Two P1s were verified and deliberately not fixed here** (D258, D259): neither
privileged shell offers a sign-out control, and the public site offers no
discoverable `/login`. Both are real — `SignOutButton` is mounted only on
`(shopper)/you` and `merchant/(app)/settings`, and `nav.ts` carries no sign-in
entry in header or footer. Both are also **pre-existing and outside this PR**:
`main`'s versions of both shells contain no `SignOut` either, and neither
marketing file is in the diff. The founder recorded them as under disposition
the same day, product design is frozen under Node 0 field validation, and each
fix is a small change to a surface this PR does not touch. They are register
rows awaiting a ruling, not silence.

**Superseded the same evening.** The founder ruled both are engineering
omissions, not product questions; both are closed in §15 (D258, D259), with the
silent-failure fix that audit found alongside them (D260).

## 14. Exact-head CI verdict

`085653d` is green: `ci` (lint · typecheck · vitest · build with the three
post-build gates) and `db-tests` (42 SQL suites over the fresh 110-migration
chain) both succeeded at 19:13 UTC on 2026-09-03, run 33794881529, and the PR
is mergeable with no conflict. Locally on the same head, keyed on real exit
codes: 188 test files / 1928 tests, typecheck, lint and a production build with
CI's env, all clean.

That is the whole of what CI proves. **D240 is still open**: no part of the
acceptance suite has run through Clerk. The mechanism for it is
`.github/workflows/e2e-admin-founder.yml` (§10's D240 paragraph and
`docs/ops/browser-e2e-provisioning-2026-09-03.md`), and it needs a founder to
create the `e2e-readonly` environment, put an admin storage state in its
secrets, and dispatch it at a preview URL. Merge and deploy remain the
founder's, after that run and a review of the final diff.

## 15. The session journey, closed at both ends (D258, D259, D260)

The fourth Codex round's two P1s were first recorded as open rows pending a
founder disposition (§13). The founder ruled the same evening: both are
verified engineering omissions, not product questions, and the privileged
session journey is to be completed on this PR —

**Landing page → shared Sign in → role-routed shell → explicit Sign out → `/login`.**

- **Way in (D259).** `HEADER_SIGN_IN` in `lib/marketing/nav.ts`, rendered by
  `SiteHeader` as an outline beside *Browse deals* in the bar and pinned
  directly under it in the mobile sheet. One label for every role — never
  "Admin sign in" — because `/app-bootstrap` already routes by role
  (`lib/pwa/app-bootstrap.ts`), which is untouched and pinned by the same
  suite. Browse deals keeps the bar's one amber element. The open question in
  the first recording (show it to everyone, or hide it while signed in) is
  settled the simple way: a public header does not know who is signed in, and
  a visible way in costs a signed-in visitor nothing.
- **Way out (D258).** The existing strategy-aware `app/sign-out-button.tsx`,
  in both shells, never a second implementation. In the admin console it is
  the last row of `nav`, so it is in the desktop `<aside>` and the phone drawer
  alike, styled white/80 on ink through the button's new `className` prop
  (12:1 — the default ink label would have been black on black). In the founder
  header it is one more quiet link in the second nav, wrapping with the header
  on a phone: that shell has no drawer, so anything hidden below `lg` would be
  the only exit gone on the device founders use.
- **Honest failure (D260).** The audit the task required found the button
  navigated to `/login` whatever Supabase answered — `signOut()` resolves
  `{ error }`, it does not throw — and let a Clerk rejection escape unhandled.
  `lib/auth/sign-out.ts` now returns a result per provider; the button leaves
  only on `ok`, and otherwise stays, re-enables and says *"Sign out did not
  complete. You are still signed in — try again."* in body ink with
  `role="alert"` (on the ink sidebar, in the same white token as the button).
  This corrected the shopper and merchant surfaces too.

### The guards, and the mutation proof

`src/components/__tests__/session-entry-and-exit.test.ts` runs under jsdom
(new dev dependency, per-file `@vitest-environment`): it mounts the real
components with `react-dom/client`, clicks the hamburger and the drawer toggle,
and clicks Sign out with the provider faked under each strategy. The
legibility check composites the sidebar's white token at its alpha over
`ink.DEFAULT` from `tailwind.config.ts` and asserts ≥ 4.5:1 for the button and
for its failure line — an invariant, not a class name. `src/lib/__tests__/sign-out.test.ts`
pins the four provider × outcome cells and that the session is gone before
anything navigates.

Nine mutations, each applied to the source, run, and reverted on 2026-09-03;
every one went red:

| # | Mutation | Failing tests |
|---|---|---|
| M1 | Sign in removed from the desktop bar | 1 |
| M2 | Sign in removed from the mobile sheet | 1 |
| M3 | Sign out removed from the admin sidebar | 3 |
| M4 | Sign out removed from the founder header | 3 |
| M5 | Admin Sign out given the default ink label | 1 |
| M6 | Admin Sign out at white/30 (3.1:1) | 1 |
| M7 | Supabase path navigates despite a provider error (the old code) | 2 |
| M8 | Clerk path redirects anywhere but `/login` | 2 |
| M9 | Founder Sign out hidden below `lg` | 2 |

### D240 — what changed around it, what did not

Still open, and still closes only on the workflow run: current PR preview,
production Clerk, iPhone size, all twelve including the co-founder boundary.
Three things changed around it:

1. **One command for the one human step.** `npm run e2e:capture -- admin
   <preview>` (`scripts/e2e-capture-session.mjs`) opens the browser for the
   sign-in, writes the state to a 0600 temp file outside the repository, puts it
   on the clipboard for the secret field, and wipes both on Enter. It refuses a
   production host and refuses to save a state with no Clerk session in it.
   Storage-state names are ignored by name and by suffix, so a hand-run
   `playwright open --save-storage` cannot be committed either.
2. **Screenshots are opt-in.** The preview shares production's Supabase
   project and the repository is public, so `test-results/` is a separate
   artifact behind `upload_failure_screenshots` (default off); the always-on
   artifact is the JSON report alone. Pinned in `e2e-workflow-guards.test.ts`.
3. **Sign-out is deliberately not in the browser suite.** Pressing it would
   revoke the stored Clerk session and kill the secret after one run — the
   suite is read-only for exactly this reason. The way in and the shells are
   what the browser proves; the way out is proved in the DOM under both
   strategies (above). The count stays twelve.

Without a co-founder identity the run is **11 of 12 with the co-founder
boundary explicitly skipped** — useful, recorded as such, and not a close
unless the founder changes the criterion (Q14 remains founder-held).

## 16. Shipped — merged, deployed, and walked (2026-09-03)

PR #319 was merged on the founder's authorisation as **`4a3d2d6`** (squash,
67 files, +9,153 / −627) at 22:55 UTC, on a head whose `ci` and `db-tests`
were both green. Vercel deployment `dpl_DHmCoCvnVQAUy8r2HzeNej8bLw58` (target
production, `main`) reached **READY at 22:59 UTC** with `aliasError: null` and
`maanta.app`, `www.maanta.app` and `maanta-nuia-git-main` aliased to it.
**No migration was applied**: production remains at 110/110, and the console
reads `claims_reserved`, a computed field production already served.

**The founder then walked the deployed console on an iPhone and reported it
all clear.** That is the first browser evidence of this redesign on a
deployment, through production Clerk — the substance D240 has been asking
for. Three limits belong beside it, and they are why D240 is not closed here:

1. It is **founder-reported**, not a machine-recorded run. No per-assertion
   result, no artifact. The evidence-classification guide treats that as
   operator observation, which is real evidence and a different kind from a
   recorded suite.
2. It is **production**, not the non-production deployment the ruling named.
   The two differ in what a failure would have cost, not in what passing shows.
3. It **cannot have covered the co-founder boundary**: no user holds the role
   (Q14, founder-held), so at most eleven of the twelve assertions were
   walkable at all.

**The disposition is the founder's, in one line:** either D240 closes on this
walk — in which case say so and the row records a manual close under the
"unless preview execution is genuinely blocked" clause of the 2026-09-03
ruling — or it stays open for the automated 12/12 through
`e2e-admin-founder.yml`, which now needs a branch preview rather than the
merged PR's. Nothing else in this document waits on that answer.

**Console engineering stops here** (founder instruction, 2026-09-03). The
next change to these surfaces should come from what the BBS Mall operator or
Merchant 01 actually hits, not from reading this document and finding
something to improve.

## 17. Before the first automated D240 dispatch (2026-09-04)

Read from the project's protection settings: every `maanta-nuia` preview is
behind Vercel Authentication (`all_except_custom_domains`). A browser with no
session therefore meets Vercel's sign-in wall, not MAANTA's `/login`, and the
five signed-out boundary tests would fail for the wrong reason; the signed-in
tests would pass only because the captured storage state happens to carry the
Vercel cookie. The spec now sends Vercel's *Protection Bypass for Automation*
secret as the `x-vercel-protection-bypass` header on every context when
`VERCEL_AUTOMATION_BYPASS_SECRET` is set, and the workflow passes it to the run
step only. That is one more secret for the founder to add — generated on the
Vercel project's Deployment Protection page — and it takes the wall down for
nobody else. With PR #319 merged, the dispatch target is a branch preview (this
change's own), which shares production's data exactly as the PR preview did and
is read-only in the same way.

The Codex verdict on `fbfa080` was requested and refused on the account's
usage limit; that is recorded rather than glossed, and the merge went ahead on
the founder's authority with four earlier rounds resolved.

### The first real dispatch (run 33823638502), and what it found

Dispatched on `claude/session-a3rqwo` at `446ef69` against that branch's
preview. It failed **before checkout**, at the target guard: the job defaults
every `run` step to `maanta-app`, which does not exist until checkout, and the
guard runs before checkout on purpose. The runner could not start bash, the
step failed as an infrastructure error, and the guard decided nothing (D261).
The golden-path money suite carries the identical defect and has never
executed its guard because its job has always skipped on an unset
`E2E_BASE_URL` (D262). Both guard steps now override `working-directory` and
both are pinned. Nothing about the product was tested by that run; it is
recorded because a fail-closed mechanism that cannot start is not fail-closed.

The run also started without waiting for an environment approval, which means
`e2e-readonly` has **no required reviewers**. Add them before any secret is
stored there — the reviewer prompt is what stands between a branch and a live
admin session.
