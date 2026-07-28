# MAANTA docs

Portable markdown set for launch operations. Notion is the drafting/approval
source of truth for ops docs; this folder mirrors approved exports (repo is
the source of truth for anything describing code behavior). Consolidated
2026-07-09 from the launch-handoff and operating-system doc packs; index
updated 2026-07-28 with comprehensive audit links and production-hardening
runbooks.

## Orientation

| File | Purpose |
|---|---|
| `maanta-project-overview.md` | What MAANTA is, actors, commercial model, technical state, workstreams |
| `maanta-claude-operating-system.md` | The operating playbook: tracks, cadences, doc rules |
| `maanta-decisions-log.md` | Repo mirror of load-bearing decisions and where they bite in code |

## Launch execution

| File | Purpose |
|---|---|
| `maanta-launch-readiness-tracker.md` | Single view of launch gates, owners, status |
| `maanta-launch-ops-runbook.md` | Testing model, QA smoke checklist, support/dispute paths, launch-week rhythm |
| `maanta-technical-handoff.md` | Engineering handoff: architecture, RPCs, env, known gaps |

## Growth / waitlist campaign

| File | Purpose |
|---|---|
| `maanta-marketing-agency-brief.md` | Agency brief: objective, audiences, offers, channel plan, KPIs, ground rules |
| `maanta-waitlist-data-schema.md` | Waitlist capture spec: segments, fields, consent (open decision: in-repo vs external backend) |
| `maanta-email-segmentation-plan.md` | Segments, sub-segments, lead scoring, CRM map, sequence structure |
| `maanta-shopper-email-sequence.md` | Shopper welcome/nurture copy draft |
| `maanta-merchant-email-sequence.md` | Merchant welcome/nurture copy draft |
| `maanta-mall-operator-email-sequence.md` | Mall-operator outreach copy draft |

## Company readiness audit (2026-07-28)

| File | Purpose |
|---|---|
| `ops/maanta-comprehensive-audit-2026-07.md` | **Primary:** full company-readiness audit — product, engineering, data, ops, legal, seed + Nairobi Takeover + 100k + Oracle partner readiness |
| `skills/maanta-audit-100k.md` | Short pointer to the comprehensive audit |

## Production hardening & launch (2026-07-28)

| File | Purpose |
|---|---|
| `ops/launch-runbook-2026-07.md` | **Start here on launch day** — pre-deploy → DB → env → deploy → smoke → watch |
| `ops/founder-manual-actions-checklist-2026-07.md` | **Founder-only tasks** Cursor cannot do (migrations, Vercel, legal, M-Pesa, partners) |
| `ops/prod-sync-checklist-2026-07.md` | Schema + env + monitoring + smoke alignment |
| `ops/vercel-production-env-checklist.md` | Env vars by environment; `NEXT_PUBLIC_*` redeploy rules |
| `ops/monitoring-launch-checklist.md` | Sentry + PostHog activation + alert recommendations |
| `ops/production-smoke-test.md` | Device smoke test with expected outcomes |
| `ops/data-governance-gaps-2026-07.md` | Honest gaps for legal / partner diligence (no fake compliance) |

## Ops

| File | Purpose |
|---|---|
| `ops/tech-stack-deep-dive-2026-07.md` | Current stack inventory, ~100k scalability assessment, upgrades, advisor map |
| `ops/pwa-install.md` | `/download` install landing + `/app-bootstrap` role router |
| `ops/auth-strategies.md` | Clerk (launch) vs Supabase email OTP (dev/test) toggle |
| `ops/merchant-lifecycle.md` | Merchant lifecycle states and signals |
| `ops/supabase-migrations.md` | How migrations are applied and verified |
| `ops/e2e-golden-path.md` | End-to-end claim → verify money path |
| `ops/test-accounts.md` | Test account conventions |
| `ops/nodes-nairobi-2026-07.md` | 3-node Nairobi rehearsal registry (BBS + CBD + Westlands) |
| `ops/role-tasks-nairobi-150-2026-07.md` | Per-role UI verification for Nairobi 150 seed |
| `ops/test-accounts-seed-2026-07.md` | `@maanta.app` test accounts for Supabase email OTP |
| `ops/browse-filters-2026-07.md` | Browse filter chips behavior |

## Durable skills (for future sessions/contractors)

| File | Purpose |
|---|---|
| `skills/maanta-audit-100k.md` | Pointer to comprehensive company-readiness audit (seed / 100k / partner) |
| `skills/prod-hardening-2026-07.md` | Pointer to production-hardening pass + founder checklists |
| `skills/tech-stack-100k.md` | Pointer to the ops deep dive (stack + path to ~100k users) |
| `skills/payments-rails.md` | How money moves: ledger RPC, idempotency, refund/dispute handling |
| `skills/redemption-disputes.md` | Verify-anyway, fraud review, dispute resolution paths |
| `skills/frozen-ui-overall-handoff.md` | The frozen wireframe system and how the UI maps to it |
| `skills/launch-audit-2026-07-24.md` | Repo-vs-prod readiness audit (July 24) |
| `skills/clerk-auth.md` | Clerk + Supabase third-party auth wiring |
| `skills/prod-auth-deals-recovery.md` | Prod feed/deals empty diagnosis |
| `skills/node0-seed-bbs-mall.md` | 100-deal BBS Mall seed apply/verify |
