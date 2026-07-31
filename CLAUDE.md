# CLAUDE.md — MAANTA repository guide

MAANTA is an in-mall deals platform launching first at **BBS Mall, Nairobi (Node 0)**.
Shoppers claim deals and redeem them in person with an OTP code; merchants pay a
KES 30 success fee per verified redemption from a prepaid wallet; admins approve
merchants and handle fraud/dispute review.

This file orients any Claude session (or human contractor) working in this repo.
The full playbook is `docs/maanta-claude-operating-system.md` — read it before
running a planning, growth, ops, or documentation session.

## Source-of-truth hierarchy

1. **Notion** — operating source of truth (decisions, plans, ops docs).
2. **This repo** — source of truth for code and implementation. `docs/` holds
   repo-side mirrors of the approved operating docs.
3. **Drive** — approved export archive.
4. **Obsidian** — long-term mirrored knowledge base.

When a `docs/` file and Notion disagree, Notion wins for operations; the code and
its migrations win for how the product actually behaves. Flag the drift, don't
silently pick one.

## Repository layout

| Path | What it is |
|---|---|
| `maanta-app/` | Next.js (App Router) + Supabase application |
| `maanta-app/src/app/` | UI pages: shopper (`/`, `/deals`), merchant (`/merchant/*`), admin (`/admin`), login |
| `maanta-app/src/app/api/` | Route handlers: onboarding, top-ups, redemptions, webhooks (Stripe, IntaSend), push |
| `maanta-app/src/lib/` | Shared libs: currency/FX, Stripe, IntaSend, merchant ledger, web push |
| `maanta-app/supabase/migrations/` | Version-controlled migration history — the authoritative record of DB behavior |
| `maanta-app/legal/` | DRAFT legal docs (not published, not lawyer-reviewed) |
| `docs/` | Operating docs (see below) |
| `docs/skills/` | Durable handoff/skills docs updated after meaningful sessions |

## Commands

Run from `maanta-app/`:

- `npm run dev` — local dev server
- `npm test` — vitest suite (also runs in GitHub Actions CI)
- `npm run build` — production build

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

Six-page marketing site under `maanta-app/src/app/(marketing)/` (renamed from
`(public)`; route groups are URL-invisible, so no path moved). Source of truth for
what shipped and why: **`docs/ops/IMPLEMENTATION-REPORT.md`**, then the 16 planning
documents in `docs/ops/` and `docs/legal/`.

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

## Claude role system

Use one narrow mode per session — Planner, Builder, Reviewer, or Operator — with
one objective and one deliverable family. Prompt templates for each track live in
`docs/maanta-claude-operating-system.md` under "Prompt pack".
