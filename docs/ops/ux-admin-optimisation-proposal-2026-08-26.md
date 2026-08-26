# UX + Admin Operations Optimisation — discovery report and PR proposal (2026-08-26)

Pre-implementation proposal required by the founder's optimisation brief (§26).
**No code has been written.** Everything below is from a fresh inventory of
`main @ 413c8af` (worktree clean, branch rebased onto it) plus read-only
production checks. Locked rules restated where they bind:
**Standard = max 1 active deal, Elite = max 2 active deals** — enforced, not
suggested.

## §1 reconciliation (all verified fresh)

- `origin/main` = `413c8af`; clean worktree; working branch
  `claude/maanta-rc-takeover-h86hwf` rebased onto it.
- Production ledger re-read: **104/104**, high-water `20260826130000`.
- Flags: `fast_visit_enabled='false'` (dark), `demo_mode_enabled='true'`
  (founder ruling 2026-08-26). Fast Visit UI/awards are fully gated;
  QR/queue routes are live but inert until QRs are printed.
- **Cap authority verified in production** (`pg_get_functiondef` read-back):
  `public.enforce_deal_limit()` hardcodes `standard → 1`, `elite → 2`,
  raises `Deal limit reached`, writes a `tier_flags` audit row, and makes
  flash deals Elite-only. Trigger = `BEFORE INSERT ON deals`; `authenticated`
  holds **no** INSERT/UPDATE on `deals` (D123 revokes), so there is no
  client path around it, and a repost is a new INSERT — capped.
- Boost KES 500/24h remains canonical (explicitly untouched by the
  2026-08-24 Elite-pricing ruling). Elite has **no published price**;
  surfaces read "Pricing coming soon".

## A. Current architecture discovered

- **Shopper ticket** (`(shopper)/tickets/[id]/`) already implements the §4
  hierarchy: code card is the hero (brand border, breathing animation,
  anti-screenshot seconds), Fast Visit panel *below* it, clearly labelled
  "Fast Visit reward", and the window-end state already reads **"Reward
  window ended — your claim is still valid."** with the claim countdown
  independent. The word "expired" is reserved for the claim.
- **Rewards surface exists**: `/you/rewards` (balance card + "no cash value"
  + recent activity from `reward_events`), entered via a "Rewards" row on
  `/you` shown when the gate is on or balance > 0. Dark today.
- **Discovery**: feed = frozen three-rail structure (D1) with frozen rail
  names (R2, pinned by `rail-names.test.ts`); sorts featured/nearest/newest/
  ending; category chips; browse has an "ending soon" chip. No sections for
  popular/new; rail titles' geography doesn't match their sort keys (known
  tension, D77).
- **Counter**: `merchant/redeem` = QueuePanel (first-name+initial, deal,
  relative arrival, inline "· Fast Visit" text, dismiss, 8s poll, TTL 10m,
  failed-load ≠ empty) above the keypad (resolve → fee disclosure → Confirm;
  verify-anyway; dark failure screen). **No recent-verifications strip**;
  history lives one level away at `/merchant/redemptions`.
- **Merchant home** (`/merchant/dashboard`, only reachable via More):
  KpiCards Today/Week/Active `n/limit`/Wallet + quick actions + the QR link
  card — which prints the `/qr/<token>` **URL as text**; no rendered QR
  image, no print affordance.
- **Deal-cap UX**: the limit is hardcoded in three places (DB trigger + two
  merchant pages); the creation wizard doesn't know the count — a Standard
  merchant at 1/1 walks the whole wizard and fails at publish with the raw
  DB message mapped to 409.
- **Admin**: 15-page console (overview with node scoping, approvals,
  merchants, customers, deals-moderation, redemptions/fraud/Guardian,
  reports, billing plan actions, agents, support, resources) + founder
  dashboard. All 12 admin API routes run `requireAdminApi` and write
  `admin_ops_log` — **which no UI reads**. D164 read-failure guard
  (`LeadsReadError`) covers 5 pages; **9 admin pages are unguarded**.
- **Analytics**: 11 server-side PostHog events (claims, publishes, top-ups,
  Guardian, arrival/queue/Fast Visit, deal views). No admin-action events.
- **app_config**: 14 keys, each with a bespoke reader or SQL-only; **no
  admin UI reads or edits any of them**.
- Two parallel design vocabularies: shopper surfaces use
  `components/ui/claude/*` (Page/Section/DealCard); the merchant app uses
  the older `ui/*` set with hand-rolled shells.

## B. What already exists (do not rebuild)

§4 window-end copy and hierarchy; the rewards page and its honest
null-vs-zero states; queue PII minimisation/TTL/dismiss/one-waiting-row;
manual keypad path and verify-anyway; fee reversal RPC (only sanctioned
credit path); Guardian held/appeal queues; billing plan actions
(mark-paid / downgrade / grant-trial with the trial-cap trigger); node-scoped
admin overview; `admin_success_fee_revenue` / `admin_redemptions_per_day`
RPCs; `claims-window` lib; `admin_ops_log` writer on every admin route;
the funnel's raw timestamps (`claimed_at`, `arrived_at`,
`fast_visit_qualified_at`, `redeemed status`) as of the 2026-08-26 deploys.

## C. What is genuinely missing

1. **Cap ratchets**: no SQL test asserts 1/2 (existing suites only route
   *around* the trigger); no UI pre-check; three independent hardcodes of
   the numbers.
2. **Shopper**: rewards discoverability beyond the buried settings row;
   visual disambiguation of the two stacked countdowns (claim vs reward);
   honest discovery sections (ending-soon exists only as sort/chip).
3. **Counter**: recent-verifications strip on the redeem screen; a real
   Fast Visit badge (currently plain inline text); a printable rendered QR.
4. **Owner value**: claims (not just redemptions), claim→arrival→redemption
   funnel, fees this week, top deal — no merchant analytics surface at all;
   `getMerchantStats().allTime` is computed and discarded.
5. **Admin ops**: deterministic attention queue (the "Needs a human" block
   is independent counts, not a queue); audit-log reader UI; `app_config`
   visibility; pilot command-centre table; merchant-health states;
   read-failure guard on the 9 unguarded pages; genuine-vs-demo split per
   the D188 census rule in every "field evidence" figure.
6. **Daily brief**: nothing exists (only cron is trial expiry).
7. **Plan-change safety**: no path reconciles active deals on Elite→Standard
   downgrade (details in H).

## D. Proposed PR breakdown (revised from the brief's five)

- **PR 0 — cap ratchets + single source of limit copy** (tiny, ~1 day).
  New `supabase/tests/deal_limit_cap_test.sql`: Standard 0→1 allowed, 1→2
  refused; Elite 0→1→2 allowed, 2→3 refused; repost at cap refused; flash
  refused on Standard. New `lib/plan-limits.ts` exporting
  `activeDealLimit(tier)` consumed by dashboard + deals page + wizard (UI
  copy source only — **the trigger stays the authority**). Vitest ratchet
  banning a second `? 2 : 1` literal. No behaviour change, no migration.
- **PR 1 — shopper clarity + rewards UX**. Wizard-independent: reward-timer
  label polish on the ticket (§4 emphasis order kept; differentiate the two
  countdowns typographically), rewards entry from the ticket success state
  → `/you/rewards`, feed "Ending soon" **additive section** (reusing the
  existing predicate; frozen rails untouched — see H1), gated "Fast Visit"
  chip only when the flag is on. No ranking-model change.
- **PR 2 — merchant counter mode**. Recent-verifications strip (last 3–5
  this session, from existing `redemptions` reads) under the keypad; visual
  Fast Visit badge in queue rows; printable counter QR (render the existing
  token as a QR image + print stylesheet — client-side rendering, token
  already served to the owner); keypad/queue small-screen + double-tap
  hardening. No schema change; QR trust boundary unchanged (token still
  authorizes nothing).
- **PR 3 — merchant owner value dashboard**. "This week" outcome view:
  verified visits, claims, claim→redemption rate, Fast Visits (gated), fees
  paid, top deal. All derivable from existing tables; per-merchant scope so
  demo/genuine mixing is not a risk for a real merchant's own numbers.
  Pre-flight cap surface in the wizard: at-cap Standard sees "Standard
  includes 1 active deal" + edit/pause/Elite-benefits actions **before**
  data entry (server still re-enforces; wizard gets `activeCount` + limit).
- **PR 4 — founder/admin operations console**. Attention queue as a pure
  function over existing reads (rule classes: claims-without-verifications,
  inactivity ≥ N days, deal nearing expiry, arrears/low balance, repeated
  verification failures, suspicious Fast Visit patterns once the gate is
  on) — each row states its reason; unit-tested rules, no opaque scores.
  Audit-trail page reading `admin_ops_log` (target + actor filters).
  Read-only `app_config` panel (edit actions deferred — see G). Read-failure
  guard rollout to the 9 unguarded pages. Merchant-health chip
  (HEALTHY/WATCH/NEEDS ATTENTION) derived from the same rule outputs.
  **Every genuine-evidence figure joins through merchant AND deal per D188.**
- **PR 5 — pilot command centre + founder daily brief**. Cohort table
  (merchant | active deals | claims | arrivals | redemptions | Fast Visits |
  status) and a "Yesterday" brief page — both derived views over PR 4's
  query layer, demo/genuine split explicit, small-sample counts shown as
  counts (no rates below a floor). In-app first; any scheduled email is a
  separate later decision.

Each PR independently reviewable/reversible; none merges or deploys without
founder authorization.

## E. Files / tables / RPCs likely touched

- **PR 0**: `supabase/tests/deal_limit_cap_test.sql` (new);
  `src/lib/plan-limits.ts` (new); `merchant/(app)/dashboard/page.tsx`,
  `deals/page.tsx`, `deals/new/*`; one vitest ratchet.
- **PR 1**: `tickets/[id]/{page,claimed-code,fast-visit-panel}.tsx`,
  `(shopper)/feed/page.tsx`, `lib/deal-list-controls.ts` (additive selector
  only), `you/rewards/page.tsx`, tests alongside.
- **PR 2**: `merchant/(app)/redeem/*`, `dashboard/page.tsx` (QR card),
  new `components/merchant/counter-*`; a tiny client QR-render dependency
  or hand-rolled SVG (no external fetch — CSP/self-contained).
- **PR 3**: `lib/merchant.ts` (extend `getMerchantStats`), new
  `merchant/(app)/dashboard` sections or `/merchant/insights` page,
  `api/deals` + wizard for the pre-flight count.
- **PR 4**: new `lib/admin/attention.ts` (pure rules) + tests;
  `admin/page.tsx`; new `admin/activity/page.tsx` (`admin_ops_log` reader);
  new `admin/config/page.tsx` (read-only); `LeadsReadError` adoption in 9
  pages. Tables read: existing only.
- **PR 5**: new `founder/brief/page.tsx`, `admin/pilot/page.tsx`;
  reuses PR 4's query layer; possibly one read-only SQL helper RPC if
  per-merchant funnel aggregation is too heavy in JS (would be a migration —
  flagged below).

## F. Migration needs

**None required for PRs 0–4.** All data exists; the attention queue and
brief are derived reads. One *possible* migration in PR 5: a read-only
aggregate RPC (e.g. `admin_pilot_funnel(node)`) if query fan-out is
excessive — SECURITY DEFINER read-only, service/admin-gated, with its own
SQL test, applied under the established founder-authorized ledger-repair
procedure. Decision deferred until PR 5 design.

## G. Security risks and how each is held

- **No new client-side privileged writes anywhere** — all new admin
  behaviour reads via server components / goes through `requireAdminApi` +
  `logAdminOp`, matching the 12 existing routes.
- **Promotional wallet credit** (§14 list) is a **money-path change**: no
  sanctioned RPC exists (only `reverse_success_fee`). Building it means a
  SECURITY DEFINER RPC + ledger row + SQL test + money-path review.
  **Deferred out of this pack** pending explicit founder authorization;
  not bundled into PR 4.
- **`app_config` editing from UI** would make demo mode / Fast Visit / fees
  one click from a browser session. Proposal ships **read-only** viewing;
  any write toggle is a separately authorized, audited action later.
- **Attention queue / health states** are derived from data a compromised
  reader could already see; no new exposure. Rules are deterministic and
  unit-tested (no opaque scores), so alerts are explainable and appealable.
- **Printable QR** renders the token the owner dashboard already discloses
  to the owner; no widening of who can read `qr_token` (D147 posture
  untouched).
- **PII**: queue stays first-name+initial; brief/command centre aggregate
  counts only; audit-log UI shows admin actors and target ids, no secrets.

## H. Product-rule conflicts / founder decisions needed

1. **§6 sections vs frozen feed structure.** The three-rail order (D1) and
   rail names (R2) are frozen and test-pinned; the rail titles' geography
   already mismatches their sort keys (open D77). "Near you" and "Popular
   today" sections would either duplicate or contradict frozen structure.
   Proposal: additive "Ending soon" only (existing honest predicate);
   anything further needs a ruling. **"Popular today" additionally lacks
   honest data while demo mode is ON** (the feed is synthetic).
2. **§15 Elite→Standard with 2 active deals.** Current canon in code:
   *no* plan-change path touches deals — the merchant keeps both active
   deals (they self-expire ≤24h by `set_deal_expiry`) and the cap re-bites
   on the next insert; meanwhile the UI would render "2/1". This is exactly
   the case §15 says to stop on. **Options for ruling:** (a) keep
   grandfathering (deals are ≤24h-lived, self-healing) + make the UI state
   it honestly; (b) block the admin downgrade action while active_count >
   limit until a deal is chosen to pause. Recommendation: **(b) for the
   manual admin action, (a) unchanged for the automatic trial expiry** (a
   cron must not interactively choose). Not implemented until ruled.
3. **Admin/founder KPIs vs D188 while demo mode is ON.** Whether the
   current overview/reports figures blend demo activity needs verification
   in PR 4; any figure presented as *field evidence* must join through
   merchant AND deal. The brief/command centre will carry the split
   explicitly from day one.
4. **Elite benefits surfaces** must keep "Pricing coming soon" (2026-08-24
   ruling) — applies to PR 0/3 cap messaging that links to Elite benefits.
5. **Fast Visit anything shopper-visible stays behind the gate** until the
   founder activates; PR 1/2 badge work is gated identically to the panel.

## I. Existing admin workflows to reuse (not duplicate)

`requireAdminApi` + `logAdminOp` (all new actions); `LeadsReadError`
(read-failure guard); `activate_merchant` / plan actions / trial-cap
trigger; `reverse_success_fee` (the only credit path); `agent_tasks`
support queue; `admin_success_fee_revenue` + `admin_redemptions_per_day`
RPCs; `claims-window`; `verified_counts_by_merchant`; the node-scoping
pattern from `admin/page.tsx`; `merchant-lifecycle` stages as input to
merchant health.

## J. Recommended order and why

**PR 0 → PR 2 → PR 3 → PR 4 → PR 5 → PR 1.**
PR 0 first: pure tests + copy source, protects the locked rule before
anything else moves. PR 2 next: Merchant 01's counter is the imminent field
surface. PR 3 rides the same merchant-side review context. PR 4 is the
founder's highest-priority area but largest; doing it after 2/3 lets its
funnel queries reuse the owner-dashboard query layer. PR 5 is a thin view
over PR 4. PR 1 last because the shopper ticket already meets §4's bar and
most of its remaining scope is dark-gated Fast Visit polish — lowest field
urgency. (If the founder weights the admin console above the counter,
PR 4 can swap ahead of PR 2 with no dependency breakage.)

---

*Discovered defects worth naming even if their PR is deferred:* wizard-end
cap failure after full data entry (PR 3 fixes); nine unguarded admin pages
(PR 4); `admin_ops_log` written but unreadable (PR 4); dashboard QR as
plain text (PR 2); `getMerchantStats().allTime` computed and discarded
(PR 3). None is a production incident; none authorizes work before the
founder sequences these PRs.
