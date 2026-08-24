# CLAUDE.md — MAANTA repository guide

MAANTA is an in-mall deals platform launching first at **BBS Mall, Nairobi (Node 0)**.
Shoppers claim deals and redeem them in person with an OTP code; merchants pay a
KES 30 success fee per verified redemption from a prepaid wallet; admins approve
merchants and handle fraud/dispute review.

**Who uses it:** shoppers (claim + redeem at the counter), merchants (create deals,
top up a prepaid wallet, verify codes), on-ground agents (merchant acquisition and
dispute handling), admins/founder (approval, billing, fraud review).

**Current stage:** pre-launch pilot. Production is live and serving (Supabase
`axrrslqssmbngbataejg`, Vercel), the data is seed/rehearsal, and demo mode is
still on. **The migration ledger reconciles at 100/100 as of 2026-08-23** (D154's `20260823120000`, then D158's `20260823130000`; earlier it stood at 98/98 on 2026-08-20) (**D24**
closed 2026-08-05, **D107** closed 2026-08-18, **D121** closed 2026-08-19,
**D142** closed 2026-08-19, **D147** closed 2026-08-20): production's
`schema_migrations` and this repo's `supabase/migrations/` agree on all 100
version/name pairs, verified by a full read-back diff. Getting there took three founder-authorized MCP apply rounds —
the three 2026-08-17 security migrations (`20260817120000`/`130000`/`140000` —
**D123**/**D124**/**D125**), the CSPRNG OTP and `deals.expires_at NOT NULL` pair
(**D29**), and the category pair `20260818150000`/`20260818160000` (**D116**),
plus merging the branch those first five had been applied from; then the email
identity freeze `20260819200000` (**D142**, applied 2026-08-19 minutes after the
fallback it hardens went live). The 98th is the read-side revoke
`20260820120000` (**D147** — strip anon/authenticated base-table SELECT on
`merchants`/`deals` and drop the `*_customer_read` policies, the read twin of
D123's write revoke), applied 2026-08-20. The 99th is the staff-seat email
invite `20260823120000` (**D154**), and the 100th is
`20260823130000` (**D158** — owner phone optional for an account with a verified
email), merged as `fec320e` and applied 2026-08-23; unlike the earlier rounds
this one had a real CI `db-tests` run over the full fresh chain behind it before
it was applied.

**Two rules earned the hard way, both still load-bearing.** (1) **Read
`supabase_migrations.schema_migrations`, not `ls supabase/migrations/`, before
choosing a version.** For two days production held five migrations that existed
only on an unmerged branch, so the repo directory under-reported the real
high-water mark and two files were authored on top of already-taken versions
(**D121**). (2) **Every MCP apply mints its own version** — **eight for eight** — so read
back and repair the ledger to the repo filename before doing anything else.
D158's apply minted `20260823134241` and was repaired to `20260823130000`.
Treat this alignment as a thing to re-check, not a settled state: the earlier
87/87 reconciliation drifted twice. The `claim_deal` pause gate is **live** (**D25**
closed 2026-08-04, verified by `pg_get_functiondef` read-back), and so is the
`cofounder` role CHECK (**D69** closed 2026-08-05; no user holds the role —
assigning it is founder-held, Q14). The role's DB policy layer is **live**
too (**D74** closed 2026-08-08: `20260807161000_cofounder_read_policies.sql`
applied and read back — exactly eight SELECT-only policies, zero holders),
and the opening-credit cap counts **per node** again (**D73** closed
2026-08-08: the reland `20260807160000_reland_node_scoped_opening_credit_cap.sql`
applied and read back — per-node lock and joined count live, so behavior and
the `app_config` notes finally agree; it matters from the second node
onward). Like deployment alignment, treat ledger alignment as a thing to
re-check, not a settled state.

The *deployment* is aligned as of 2026-08-01: production serves `main` again
(**D37** closed, verified against the Vercel deployment rather than assumed). It
came apart twice in one day, so treat alignment as a thing to check, not a state
to assume — the second time was a manual dashboard promote of an open PR branch
(**D53**). When auditing this, compare **trees, not commit SHAs**: a squash merge
mints a new SHA, so an ancestry check against a promoted branch commit fails
forever even when the content is identical. The live gate
being worked is the 3-person friends-and-family pilot at Node 0 — see
`docs/maanta-launch-readiness-tracker.md` and
`docs/ops/live-pilot-3-person-2026-07-30.md`. Treat the readiness tracker as the
gate-status truth, not this paragraph.

This file orients any Claude session (or human contractor) working in this repo.
The full playbook is `docs/maanta-claude-operating-system.md` — read it before
running a planning, growth, ops, or documentation session. Build/run mechanics for
coding agents (local DB, Clerk keys, seeding, known gotchas) live in `AGENTS.md`.

## Source-of-truth rules

1. **Notion** — operating/product source of truth (decisions, plans, ops docs).
2. **This repo** — source of truth for implementation. Within it, the
   **migrations and RPCs** win over any prose about how the product behaves.
3. **`maanta-app/design/current-reality/`** — design-side truth: `frames.json`
   classifies each surface as `live` / `gated` / `rehearsal` / `design-ahead` /
   `blocked` / `superseded`. A wireframe or PDF is intent, not shipped state.
4. **Drive** — approved export archive. **Obsidian** — long-term mirror.

**On conflict: name it, don't resolve it silently.** Notion wins for operations;
code and migrations win for behavior. If a doc, a comment, a wireframe and the
code disagree, say so explicitly in your summary and add a row to
`docs/maanta-drift-register.md`. Never invent a rule to paper over the gap.

## Repository layout

| Path | What it is |
|---|---|
| `maanta-app/` | The only runnable product: Next.js 14 (App Router) + Supabase Postgres/RLS, Clerk auth, Tailwind, Stripe/IntaSend, Sentry + PostHog |
| `maanta-app/src/app/` | Route groups (URL-invisible): `(marketing)/*` public site + legal, `(shopper)/*` (`/feed`, `/browse`, `/map`, `/my-deals`, `/you`), plus `merchant/*`, `admin/*`, `agent/*`, `founder/*`, auth (`/login`, `/sign-up`, `/verify-phone`) |
| `maanta-app/src/app/api/` | Route handlers: onboarding, top-ups, redemptions, webhooks (Stripe, IntaSend), push, healthz |
| `maanta-app/src/lib/` | Shared libs: `pricing.ts` (the only YOU PAY computation), currency/FX, Stripe, IntaSend, merchant ledger, elite-trial, analytics, web push |
| `maanta-app/src/components/ui/claude/` | Shared UI primitives (`Page`, `Section`, typography, buttons, chips, `DealCard`) — extend these, don't fork them |
| `maanta-app/supabase/migrations/` | Version-controlled migration history — authoritative for DB behavior. **Ledger reconciles with prod at 100/100 as of 2026-08-23**, verified by full version+name read-back diff (**D24** closed 2026-08-05, **D107** closed 2026-08-18, **D121** closed 2026-08-19 when the security branch merged and the repo finally contained every applied migration; **D147** added `20260820120000` on 2026-08-20, **D154** `20260823120000` and **D158** `20260823130000` on 2026-08-23). Read the **ledger**, not this directory, before picking a version — for two days it under-reported the high-water mark by five |
| `maanta-app/supabase/tests/` | Plain-SQL money-path assertion suites, run by the CI `db-tests` job |
| `maanta-app/design/` | `current-reality/` (canonical surface inventory), `claim-and-till/` wireframes, wireframe-system PDF |
| `maanta-app/src/content/legal/` | The markdown the four live legal routes render. `docs/legal/` holds the source set + counsel note; `maanta-app/legal/` holds older policy drafts. All DRAFT — not lawyer-reviewed |
| `docs/` | Operating docs (see below) |
| `docs/ops/` | Runbooks and dated operational reports: auth strategies, demo mode, migrations, e2e/pilot readiness, UI polish |
| `docs/skills/` | Durable handoff/skills docs updated after meaningful sessions |

**Auth, in one line:** `maanta-app/src/middleware.ts` runs on every path and
**branches on the strategy** — `clerkMiddleware()` for Clerk, Supabase session
refresh (`updateSession`) otherwise. Clerk is the launch strategy and what
production runs, but it is **not** the code default: `DEFAULT_AUTH_STRATEGY` in
`src/lib/auth/strategy.ts` is `supabase`, and Clerk turns on only when **both**
`MAANTA_AUTH_STRATEGY` and `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` are explicitly
`clerk`. A checkout with no auth env set therefore runs Supabase email OTP, which
is also what CI uses. See `docs/ops/auth-strategies.md` and
`docs/skills/clerk-auth.md`. The decisions log calls Clerk the default; that
wording and the code disagree — drift **D59**, founder to rule.

## Orientation map — where to look before you edit

| Question | Read this first |
|---|---|
| Is this shipped, or design-ahead? | `maanta-app/design/current-reality/frames.json` |
| Is this a known gap already? | `docs/maanta-drift-register.md` (search before you re-report) |
| What is waiting on a founder ruling? | `docs/maanta-decision-queue-2026-08-19.md` — ranked, with each question, its evidence and its options. A derived view of the register, not a second tracker |
| Is this rule frozen? | Frozen business rules below → `docs/maanta-decisions-log.md` |
| What is gating launch? | `docs/maanta-launch-readiness-tracker.md` |
| How does money actually move? | `docs/skills/payments-rails.md`, `docs/skills/money-trust-engineering-guardrails.md`, the `claim_deal` / `verify_redemption` migrations |
| What are the UI hard rules? | `docs/skills/frozen-ui-locked-rules-audit.md`, `docs/skills/claude-design-system.md` |
| How do I run the DB / seed / demo mode? | `AGENTS.md`, `docs/ops/supabase-migrations.md`, `docs/ops/demo-mode.md`, root `Makefile` |
| Is this a marketing-site surface? | The Marketing site section below, then `docs/ops/IMPLEMENTATION-REPORT.md` and `docs/ops/marketing-site-repo-map.md` |
| Does pausing a deal affect this? | The Paused deals section below, then `docs/skills/paused-deal-semantics.md` |
| Can a merchant sign themselves up? | `docs/skills/merchant-self-onboarding.md` — the self-serve path, the approval gate, and the `onboard_merchant` overload trap |
| How does a shop get its location? | `docs/skills/shop-location-capture.md` — "Locate my shop", the six states it must handle, and why what3words is optional enrichment (**D162**) |
| Am I touching deal categories? | `docs/skills/deal-categories.md` — the ten-bucket taxonomy is founder-locked and uncategorised is a real state. Live on production since 2026-08-18, but no live deal carries a category yet, so no chip row renders (**D122**) |

## Working style

- **Verify first.** Read the code, the migration, the doc and the current design
  state before editing. Do not answer from the prompt's description of the repo —
  the repo wins.
- **Small, high-confidence diffs.** Extend the existing pattern rather than
  introducing a second one; a second place to enforce a rule is a second place to
  drift.
- **Direct and operational output.** No preamble, no restating what you're about
  to do at length. Don't over-explain unless asked.
- **Close every task with a summary**: files changed, what you ran and what it
  said, drift found, and any decision left for a human.
- **Never claim green you didn't see.** If a check didn't run, say it didn't run.

## Execution format for meaningful tasks

1. Restate the task in one or two lines.
2. Inspect the relevant files (code, migration, doc, `frames.json`).
3. Separate truth from drift — state which sources disagree, if any.
4. Propose the smallest safe implementation.
5. Implement it.
6. Run the relevant checks (below).
7. Summarize: files changed · what was verified · open human decisions.
8. Leave a durable artifact — see the mandatory session rule below. A summary in
   chat is not one.

Skip steps 1–4 only for genuinely trivial edits (a typo, a broken link).

## Commands and what CI gates

Run from `maanta-app/`:

- `npm run dev` — local dev server (Turbo)
- `npm run lint` — `next lint`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest suite
- `npm run build` — production build; **also runs three post-build gates**, each
  chained with `&&` so a failure fails the build:
  - `check:tokens` — fails if a `{{TOKEN}}` placeholder survives into rendered
    output or a compiled chunk
  - `check:canonicals` — fails if a marketing route's canonical or `og:url`
    disagrees with the generated sitemap
  - `check:forms` — fails if a route listed as prerendered ships no `<form>`, or
    ships a client-side-rendering bailout marker
- `npm run check:tokens` / `check:canonicals` / `check:forms` — any of those
  scans on its own, against an existing build. The chaining itself is guarded by
  `src/lib/__tests__/build-gates.test.ts`, so deleting a gate from the `build`
  script fails CI rather than silently disabling it
- `npm run test:e2e` — Playwright golden path (needs `E2E_BASE_URL` + storage;
  see `docs/ops/e2e-golden-path.md`)

Root `Makefile` (see `make help`): `make db-verify` (local-only — boots a
throwaway Supabase, applies migrations, runs `supabase/tests/*.sql`, mirrors CI),
`make demo-status|demo-on|demo-off`, the seed targets. `db-link` / `db-push*`
target **production** and are human-run — Claude must not apply migrations.

**CI (`.github/workflows/ci.yml`) blocks on all of:** `lint`, `typecheck`,
`test`, `build`, and the `db-tests` job. A change that only passes `npm test` is
not verified. If you touch SQL under `supabase/migrations/`, the corresponding
check is `make db-verify` (or the `db-tests` job), not vitest.

## UI/UX quality bar

MAANTA handles other people's money at a physical counter. The interface has to
earn that. The bar is: **premium, trustworthy, investor-grade, merchant-safe,
shopper-clear** — a product a VC-funded team shipped, not a template.

**What that means concretely**

- Hierarchy, spacing, typography and calm colour do the work. One clear primary
  action per screen; everything else recedes.
- Prefer an honest flow over a decorative one. If a state is empty, blocked, or
  pending, say so plainly with a next step — don't dress it up.
- Every state is designed: loading, empty, error, offline, expired, denied. A
  half-built state is what makes a product look unfinished.
- Copy is short, literal, and in the product's closed vocabulary (claim, redeem,
  deal, wallet, top up, success fee). No marketing voice inside the app.

**Per surface**

- **Shopper** — simple and safe. The shopper should always know what they will
  pay, what they claimed, and how long they have.
- **Merchant** — competent and sober. Money in, money out, fee before the action.
  Never a surprise debit.
- **Admin / agent / founder** — operational, dense where density helps, auditable.
  Boring is correct here.

**Do not**

- generic AI gradients, purple-blue meshes, random glassmorphism
- over-animation, parallax, confetti, celebratory motion (and **never** on a
  money surface)
- decorative hero sections that say nothing, or template-looking feature grids
- emoji on money, error, or loading surfaces
- colour as the only carrier of state

**Frozen UI rules — enforced in code, not taste** (audited in
`docs/skills/frozen-ui-locked-rules-audit.md`, ratcheted by
`maanta-app/src/lib/__tests__/frozen-ui-rules.test.ts`):

1. ≤1 amber action per screen; amber is fill/border only, never money text.
2. CTA = amber fill + **black** label; disabled is never amber.
3. Money is never coloured, never in a toast, never celebrated.
4. State = icon + word, readable in greyscale. Failure is dark `#141414`;
   error is borders and icons only, body text stays `#111`.
5. Warning is rust `#9A4A0C` — never red or yellow.
6. The 6-digit code is the only bare numeral; no price inside the code card.
7. YOU PAY is identical on tile, detail and claimed code; the itemised
   breakdown appears only on deal detail.

Use tokens from `tailwind.config.ts` and primitives from
`src/components/ui/claude/`. Never raw hex in components.

## Product guardrails

The commercial rules themselves — the KES 30 success fee, the Elite trial, the
zero-balance gate, verify-anyway, segmentation — are in **Frozen business rules**
below. They are stated once, there. This section is how to work near them.

- **Never invent a product rule.** If the answer isn't in the decisions log, the
  readiness tracker, the drift register or a migration, it is an open question —
  surface it, don't decide it.
- **Backend is the source of truth for money and trust.** A UI-only change does
  not close a money, access-control or fraud gap. `claim_deal` and
  `verify_redemption` are the enforcement points; an app-layer filter narrows
  exposure but never replaces the RPC (see drift row D25 for exactly this).
- **Before changing operational behavior**, check: the readiness tracker, the
  drift register, the relevant parity/e2e docs under `docs/ops/`, and the
  migration that owns the behavior.
- **Never hardcode a fee or price.** `getSuccessFee()` / `getBoostFee()` read
  `app_config`; `SUCCESS_FEE_KES` in `src/lib/pricing.ts` is the single copy
  constant. YOU PAY is computed only in `src/lib/pricing.ts`.
- **Claude does not run migrations against production.** Write the migration,
  add the SQL test, verify locally, and hand the apply step to a human
  (`docs/ops/supabase-migrations.md`).
- **When a critical flow changes**, update the docs, the tests, and the drift
  register in the same change — not "next session".

## Required master docs (must always exist and stay updated)

- `CLAUDE.md` (this file)
- `docs/maanta-claude-operating-system.md` — the playbook itself
- `docs/maanta-project-overview.md`
- `docs/maanta-launch-readiness-tracker.md`
- `docs/maanta-decisions-log.md`
- `docs/maanta-waitlist-data-schema.md`
- `docs/maanta-email-segmentation-plan.md`
- `docs/maanta-marketing-agency-brief.md`
- `docs/maanta-launch-ops-runbook.md`
- `docs/skills/payments-rails.md`
- `docs/skills/money-trust-engineering-guardrails.md` — the checklist for any diff
  that shows a price, moves money, or gates a role
- `docs/skills/redemption-disputes.md`
- `docs/skills/frozen-ui-overall-handoff.md`
- `docs/skills/prod-auth-deals-recovery.md`
- `docs/skills/supabase-prod-email-auth.md`
- `docs/skills/node0-seed-bbs-mall.md`
- `docs/maanta-staged-readiness-now-launch-10k-100k.md` — now / launch / 10k / 100k readiness
- `docs/ops/IMPLEMENTATION-REPORT.md` — what the marketing-site build shipped,
  its 17 recorded deviations, and what it deliberately did not implement
- `docs/maanta-drift-register.md` — open/closed record of every known gap between
  what MAANTA claims and what is true. Schema and evidence rules are enforced by
  `maanta-app/src/lib/__tests__/drift-register.test.ts`, so a row cannot be closed
  without either naming a guard — a test, a migration, or a decisions-log entry —
  or stating `no guard: <reason>` for drift that genuinely cannot be guarded.

## Frozen business rules (change only via a new decisions-log entry)

- **KES 30 success fee** per verified redemption, all plans, debited at merchant
  verification (or recorded as arrears if the wallet can't cover it).
- **Elite trial = 30 days**, then a 7-day grace period, then auto-downgrade to
  Standard if no paid conversion. Paid Elite is KES 3,500/month (price under
  review Feb 2027 — founder ruling 2026-07-20 supersedes the earlier Oct 2026
  date; the KES 30 success fee is explicitly NOT under review).
- **Verify-anyway**: shopper experience is preserved at the counter; disputes
  route to admin/on-ground agent handling after the fact, auditably.
- **Zero-balance gate**: merchants with no balance can't create new deals.
- **Payments**: Stripe stays in sandbox during testing; M-Pesa STK (IntaSend)
  is prepared for launch readiness but IntaSend availability must not be assumed.
- **Audience segmentation**: shoppers, merchants, and mall operators are separate
  acquisition and email audiences from the first signup (`segment_type` required).

See `docs/maanta-decisions-log.md` for the full log and dates.

## Paused deals

Source of truth for pause / claim / resume / redeem: **PR #150**,
`docs/skills/paused-deal-semantics.md`, and drift **D25** (plus closed **D32**
for the SQL browse-view filter).

- Claimed while the deal was **active** → ticket stays in My deals / Tickets and
  remains verifiable until normal ticket expiry (`verify_redemption` ignores
  `is_paused`).
- Pausing a deal **immediately** removes it from shopper discovery (feed,
  browse, map, **search**) and from `deals_public_browse`; new claims are
  blocked. `/search` was the one surface that did not filter it until
  2026-08-19 — it builds its own query rather than reading `getLiveDeals`, so it
  carries the predicate itself (**D119**, closed; guard
  `maanta-app/src/lib/__tests__/search-paused-filter.test.ts`).
- Enforcement is the `claim_deal` RPC (`deal_paused`); UI hiding is a safety
  layer only. Stale/deep-link claim attempts get HTTP 409 + `code: "deal_paused"`.
- Resume (while the deal is otherwise valid) restores discovery and claimability.
- **Deploy status: live on production as of 2026-08-04.** Both migrations
  applied (founder-authorized MCP apply — see **D25**, closed) and read back:
  `pg_get_functiondef(claim_deal)` contains `deal_paused`,
  `deals_public_browse` filters `is_paused`, and `verify_redemption` still
  ignores `is_paused`. The apply initially recorded MCP-minted version numbers;
  the ledger was repaired to the repo filenames on 2026-08-05 (**D24**, closed).
- Any future change to claim / pause / resume / redeem must: read
  `docs/skills/paused-deal-semantics.md` first; check the latest drift register
  and migrations; keep RPC, UI, and discovery surfaces aligned; and record
  behavior changes in the drift register and this file.

## Mandatory session rule

Every MAANTA session must leave behind at least one durable artifact:
a `docs/skills/*.md` update, a tracker update, a marketing/ops brief, or an
exported approved markdown document. Do not let work end in chat history only.

**If a session finds drift** — any gap between what a doc, a frozen rule, or a
comment claims and what the code, migrations or live config actually do — record
it in `docs/maanta-drift-register.md` **before** writing the narrative, and close
prior rows by ID rather than re-describing them. An audit document is a story; the
register is the state. Skipping it is how the same finding gets discovered twice,
which has already happened (rows D3, D5, D6, D9).

## Marketing site

Marketing site under `maanta-app/src/app/(marketing)/` (renamed from `(public)`;
route groups are URL-invisible, so no path moved). The build that shipped is
described as "six-page" throughout the planning docs and that is still the right
way to read them — six core marketing pages (`/`, `/shoppers`, `/merchants`,
`/mall-operators`, `/about`, `/contact`). The route group now holds **17**
`page.tsx` files in total: those six, the four legal routes, and
`/pricing`, `/faq`, `/help`, `/download`, `/waitlist`, `/merchants/join`,
`/malls/bbs-mall`. Count with `find src/app/\(marketing\) -name page.tsx`; the
guards that walk "every marketing page" walk all 17, not the six. Source of truth
for what shipped and why: **`docs/ops/IMPLEMENTATION-REPORT.md`**, then the 16
planning documents in `docs/ops/` and `docs/legal/`.

Four rules that are enforced, not conventions:

- **The demo-data banner never renders on a marketing route.** It stays on
  `(shopper)/layout.tsx` and `merchant/(app)/layout.tsx`, where synthetic deal rows
  actually render. Guarded by `marketing-shell.test.ts` in both directions — it
  fails if the banner returns to marketing *and* if either app shell drops it.
  Note the switch is the database row `app_config.demo_mode_enabled`, not an env
  var, so it cannot be checked by reading `.env`.
- **Every number renders from `lib/marketing/facts.ts`.** It re-exports
  `SUCCESS_FEE_KES` rather than redeclaring it; `pricing-copy.test.ts` fails on a
  second declaration of the frozen fee.
- **Modelled figures render only through `<ScenarioStat>` inside
  `<ScenarioNotice>`**, which is a wrapper providing context — a stat without it
  throws in dev. Production is `NEXT_PUBLIC_SCENARIO_MODE` unset, which renders
  honest fallbacks and makes no claim that BBS Mall is a signed partner.
- **No `{{TOKEN}}` may reach rendered output.** `npm run build` runs
  `scripts/check-tokens.mjs` over the build output and fails if one survives.

Held claims (`website-handoff.md` §9) must not ship; `held-claims.test.ts` scans
both page source and `src/content/legal/*.md` for each one.

### Unfinished work on the marketing site (as of 2026-08-01)

A production render audit found a tail of defects. Four documents govern the
finish pass, in this reading order:

1. `docs/ops/marketing-site-gap-audit.md` — what production actually serves.
   Written **without reading the repo**; every inferred path is marked `VERIFY IN REPO`.
2. `docs/ops/marketing-site-finish-plan.md` — seven ordered steps.
3. `docs/ops/marketing-site-repo-map.md` — **the correction layer.** Maps every
   finding to real `path:line`, and marks each verdict CONFIRMED, CONTRADICTED or
   UNVERIFIABLE HERE. Read this before acting on either document above.
4. `docs/ops/cursor-marketing-site-finish-handoff.md` +
   `docs/ops/marketing-site-finish-checklist.md` — execution.

Three things a session must not get wrong:

- **~~`main` and production have diverged both ways~~ — closed 2026-08-01
  (**D37**).** `main` carries all three reconcile commits and production serves
  `main`. The guard vacuity that made it urgent is fixed and covered by **D38**:
  one shared comment lexer at
  `maanta-app/src/lib/__tests__/helpers/comment-stripping.ts`, imported by every
  copy guard. A fourth private copy of that stripper is how the defect returns.
- **Every marketing *vitest* guard reads `.tsx` source**, because CI runs `test`
  before `build` and `.next/` does not exist at test time. Built output is checked
  by the three post-build scripts instead — `check-tokens.mjs`,
  `check-canonicals.mjs`, `check-server-forms.mjs` — chained into `npm run build`.
  Source-only scanning is why a `/contact` form present in JSX but absent from
  server HTML shipped (**D41**); the last two scripts exist because of it. A new
  guard that needs rendered output belongs in a build script, not in vitest.
- **Four steps are already done in the repo** — the `/how-it-works` 308
  (`next.config.mjs`), `metadataBase` (`src/app/layout.tsx`), Step 4 canonical/OG
  (**D40**) and Step 5 server-rendered `/contact` (**D41**). Do not redo them.

Rows for this work: **D39** open (the `/how-it-works` measurement, which needs a
`curl -sI` with redirect-following off — the repo side is settled: `next.config.mjs`
declares a 308 and `rewrites()` holds only the PostHog proxies). **D37**, **D38**,
**D40**, **D41**, **D42** closed. Marketing polish since then opened **D50** (the hero mockup is the one
marketing surface rendering synthetic deal rows) and **D51** (the launch offer is
single-sourced but its expiry gate is unproven until `OFFERS.eliteTrial.expiresOn`
passes and both pages drop it together); **D52** and **D53** are closed.

## Operating state: Node 0 Field Validation Mode (from 2026-08-22)

Product design and general engineering are **frozen** unless field evidence shows
a genuine blocker or defect. Do not initiate UI polish, redesign, feature work,
speculative UX improvements, security-audit rounds, refactors, or architecture
work because opportunities exist. Do not reopen completed work to improve it.

The loop is now: **real world → Nairobi field operator → founder (decision
layer) → Claude Design/Code only when necessary → field retest.**

- **Claude Design** is dormant; wakes only when field evidence shows a UX problem.
- **Claude Code** is a maintenance/verification engineer; wakes only for
  demonstrated technical problems or specifically authorized work.
- **Nairobi field operator** is the primary source of new evidence
  (`docs/ops/field-operator-day-sheet.md`).

Priority sequence at BBS Mall: Merchant 01 → Staff 01 → genuine Deal 01 →
Shopper 01 → verified contact → claim → physical visit → merchant verification →
first genuine `success` redemption → 5 → 10 → observe the KES 300 credit wall →
merchant continuation/payment signal (decisions log, 2026-08-22 Node 0 entry).

- Verified **email** is an acceptable shopper claim path under the widened
  verified-contact rule (decisions log 2026-08-22, second entry). The **D151**
  SMS test continues separately and does not block the pilot.
- Founder/manual items (e.g. **D39**) stay tracked but do **not** authorize
  unrelated engineering work.
- **D106** is closed in the register, but its rule stands: never mutate
  production from historical documentation. Reconcile current `main`, the
  production ledger (`supabase_migrations.schema_migrations`) and observed
  production behaviour first. Production mutation requires explicit founder
  authorization.

**Field status — Node 0 controlled field validation is GO (founder ruling
2026-08-23; supersedes the 2026-08-22 HOLD, whose condition — "until D152
closes" — is met: D152 is closed):**

- **Node 0 controlled field validation: GO.** The live-pilot HOLD is lifted.
  Prospecting, live merchant onboarding, the staff seat and redemption are all
  open.
- **One genuine independent Merchant 01 initially.** This is **not**
  authorization for scaled merchant acquisition. Sequence: Merchant 01 →
  self-serve onboarding **with no phone** → `pending` → founder review and
  approval → genuine Deal 01 → Staff 01 → Shopper 01 → claim → physical visit →
  counter verification → first genuine `success` → KES 30 ledger read-back.
- **Merchant 01's real onboarding supplies the outstanding D158 browser
  evidence.** There is no separate rehearsal run — that earlier plan is
  withdrawn, because watching the person the feature was built for is better
  evidence than a scripted one. `docs/ops/d158-self-serve-live-test.md` is the
  observation checklist, not a script: **record what actually happens rather
  than coaching the merchant into matching the documentation.** A discrepancy
  between the browser and the docs is the finding — capture it, and do not
  change the product mid-test.
- **Gmail-only for the initial field accounts** — Merchant 01, Staff 01 and the
  first shoppers — while **D156** is open. Clerk's shared sender does not reach
  Microsoft mailboxes, and that failure presents as a MAANTA fault when it is
  not one.
- **Ladder: 1 → 5 → 10 genuine verified redemptions.** Around 10 the KES 300
  opening credit is spent and the merchant cannot post a new deal — expected,
  and what they say about it is the measurement.
- **Do not begin the four-agent acquisition phase.** **D159** must be resolved
  before agent-assisted acquisition begins.
- **Field evidence now outranks further engineering.**
- **Email is the primary production authentication for Node 0** (sixth entry,
  2026-08-22). Phone/SMS sign-in sits behind a paid Clerk plan and is
  **deferred** — do not purchase or enable it, and do not tell the operator to
  wait for SMS. **D151** is deferred / non-blocking.
- **Staff seats accept a verified email as well as a verified phone** (D154,
  ruled and shipped 2026-08-23; migration `20260823120000` applied to
  production, ledger 99/99). Phone is still matched first, so existing
  phone-invited seats are unchanged; the email key carries the same proof
  (`verifiedPrimaryEmail` + the D142 freeze) and still links only an unclaimed
  seat. Guard: `staff-seat-email-linking.test.ts`.
- **Self-serve merchant onboarding accepts a verified email instead of a phone**
  (**D158**, ruled 2026-08-23, option B; **closed 2026-08-23 — merged as
  `fec320e` and applied to production**). Owner phone is optional when the
  authenticated account already has a verified email, and stays available as an
  optional business contact; a supplied phone is still format-checked as Kenyan.
  The exemption is derived server-side from `users.email` and never from the
  request body, and `merchants_contact_present` keeps at least one contact
  channel on every shop. **The ledger reconciles at 100/100** (migration
  `20260823130000`) — the MCP apply minted `20260823134241`, eight for eight,
  and the ledger was repaired to the repo filename before anything else.
  Read back: `phone` nullable, the CHECK present, **exactly one**
  `onboard_merchant` overload. Editing `onboard_merchant`? Read
  `docs/skills/merchant-self-onboarding.md` first — the function has had two
  signatures, and a first draft of this very migration re-created the dropped
  11-arg overload, which would have made every onboarding call ambiguous.
  **Still owed: one real self-serve onboarding** at Node 0 with a
  verified-email account and no phone.
- **Self-serve onboarding locates the shop by browser geolocation, not
  what3words** (**D162**, ruled 2026-08-24). The merchant taps "Locate my shop"
  at their own entrance, confirms the pin on a map, and those coordinates are
  MAANTA's canonical store location; a denied permission, a failed or coarse
  reading all fall back to placing the pin by hand rather than dead-ending.
  what3words is derived server-side afterwards, best-effort — quota exhaustion
  leaves the address NULL and onboarding completes. **Merged, NOT yet applied:**
  migration `20260824120000_merchant_location_coordinates.sql` is the 101st file
  in `supabase/migrations/` while production's ledger still holds 100, so the
  repo directory currently over-reports by one — the mirror image of D121, and
  the same reason to read the ledger rather than `ls`. **Until a human applies
  it, D162 remains a Merchant 01 blocker**: production still enforces
  `what3words_address NOT NULL` and a self-serve merchant still cannot finish.
  It stops being one when the migration is applied AND one real self-serve
  onboarding completes at Node 0. Read `docs/skills/shop-location-capture.md`
  before touching the location step, the RPC signature, or any read of
  `merchants.what3words_address` — that column becomes nullable.
- Standing constraints: no paid Clerk feature, no new identities (attach
  emails to the existing Clerk users instead), no unrelated auth changes
  without founder approval.

When a field issue is reported:

1. Preserve the field evidence (screenshots, timestamps, IDs, operator notes).
2. Reproduce/verify it where possible.
3. Classify: **blocker**, **defect**, **usability observation**, or **feature request**.
4. Fix only genuine blockers and founder-approved defects.
5. Add a regression guard where warranted.
6. Verify (`npm test`, and the relevant SQL suite if the DB is touched).
7. Return to rest.

Observations are never converted into features without founder approval.

## Claude role system

Use one narrow mode per session — Planner, Builder, Reviewer, or Operator — with
one objective and one deliverable family. Prompt templates for each track live in
`docs/maanta-claude-operating-system.md` under "Prompt pack".

Recommended skills/tooling for Claude sessions on this repo, plus a copy-paste
session bootstrap prompt: `docs/ops/claude-stack-setup.md`.
