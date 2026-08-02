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
still on. **Production is not a clean mirror of `main`** — two open rows say so:
its migration ledger and this repo disagree on two version numbers (**D24**), and
the `claim_deal` pause gate is merged but not applied (**D25**, `pending-deploy`).
Do not describe the schema as aligned; check those rows first.

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
| `maanta-app/supabase/migrations/` | Version-controlled migration history — authoritative for DB behavior (caveat: prod's ledger and this repo currently disagree on two version numbers — drift row **D24**) |
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
| Is this rule frozen? | Frozen business rules below → `docs/maanta-decisions-log.md` |
| What is gating launch? | `docs/maanta-launch-readiness-tracker.md` |
| How does money actually move? | `docs/skills/payments-rails.md`, `docs/skills/money-trust-engineering-guardrails.md`, the `claim_deal` / `verify_redemption` migrations |
| What are the UI hard rules? | `docs/skills/frozen-ui-locked-rules-audit.md`, `docs/skills/claude-design-system.md` |
| How do I run the DB / seed / demo mode? | `AGENTS.md`, `docs/ops/supabase-migrations.md`, `docs/ops/demo-mode.md`, root `Makefile` |
| Is this a marketing-site surface? | The Marketing site section below, then `docs/ops/IMPLEMENTATION-REPORT.md` and `docs/ops/marketing-site-repo-map.md` |
| Does pausing a deal affect this? | The Paused deals section below, then `docs/skills/paused-deal-semantics.md` |
| Which malls (nodes) exist, and how do I add one? | The Nodes section below, then `maanta-app/supabase/migrations/20260802120000_nodes_registry.sql` |
| Will this cost more at scale? Is it a security gap? | `docs/skills/scaling-cost-security-audit-2026-08-01.md`, then drift rows **D68–D76** |

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

## Nodes (malls)

Source of truth for which malls exist: the **`public.nodes` table**
(`maanta-app/supabase/migrations/20260802120000_nodes_registry.sql`, drift **D72**).
`deals.node` and `merchants.node` carry a foreign key to it.

- **`nodes.id` is an opaque key that happens to read like a label.** It
  grandfathers the string already stored in those columns (`'BBS Mall'`). Never
  render it — render `label` or `short_label`. It is frozen by a trigger, because
  `ON UPDATE CASCADE` would otherwise let an id edit rewrite node scoping across
  the money path.
- **Renaming a mall is safe**: change `label`. No foreign key points at it. That
  was the D72 defect — the display name *was* the key, so a rename silently
  orphaned every deal and merchant.
- **Retire a node with `is_live = FALSE`, never `DELETE`** (`ON DELETE RESTRICT`).
- **`maanta-app/src/lib/nodes.ts` is a build-time cache, not the source of truth.**
  Client components and the synchronous `getSelectedNode()` cookie check cannot
  await a query, so they read it. `nodes-registry-parity.test.ts` fails the CI
  `test` job — it is vitest, not a post-build scan — if it and the migration seed
  disagree, so **adding a mall means both** an INSERT and a `nodes.ts` entry: you
  cannot ship one without the other, because `test` blocks the merge.
- **Not yet true: "add a mall with no deploy."** `getSelectedNode()` still
  validates against the compiled array, so a mall registered by INSERT alone is
  not selectable. Moving selection onto the table is what closes D72, along with
  a human `supabase db push` — **the migration is not applied to production yet**.

## Paused deals

Source of truth for pause / claim / resume / redeem: **PR #150**,
`docs/skills/paused-deal-semantics.md`, and drift **D25** (plus closed **D32**
for the SQL browse-view filter).

- Claimed while the deal was **active** → ticket stays in My deals / Tickets and
  remains verifiable until normal ticket expiry (`verify_redemption` ignores
  `is_paused`).
- Pausing a deal **immediately** removes it from shopper discovery (feed,
  browse, map) and from `deals_public_browse`; new claims are blocked.
- Enforcement is the `claim_deal` RPC (`deal_paused`); UI hiding is a safety
  layer only. Stale/deep-link claim attempts get HTTP 409 + `code: "deal_paused"`.
- Resume (while the deal is otherwise valid) restores discovery and claimability.
- **Deploy status:** repo is complete (#150: migrations `180000` + `190000`,
  tests, UI). **D25 remains `pending-deploy`** until a human `supabase db push`
  and `pg_get_functiondef` for `claim_deal` shows `deal_paused`. Not fully live
  on production until that read-back.
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

## Claude role system

Use one narrow mode per session — Planner, Builder, Reviewer, or Operator — with
one objective and one deliverable family. Prompt templates for each track live in
`docs/maanta-claude-operating-system.md` under "Prompt pack".

Recommended skills/tooling for Claude sessions on this repo, plus a copy-paste
session bootstrap prompt: `docs/ops/claude-stack-setup.md`.
