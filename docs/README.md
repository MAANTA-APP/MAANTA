# MAANTA docs

Portable markdown set for launch operations. Notion is the drafting/approval
source of truth for ops docs; this folder mirrors approved exports (repo is
the source of truth for anything describing code behavior). Consolidated
2026-07-09 from the launch-handoff and operating-system doc packs.

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

## Durable skills (for future sessions/contractors)

| File | Purpose |
|---|---|
| `skills/tech-stack-100k.md` | Pointer to the ops deep dive (stack + path to ~100k users) |
| `skills/payments-rails.md` | How money moves: ledger RPC, idempotency, refund/dispute handling |
| `skills/redemption-disputes.md` | Verify-anyway, fraud review, dispute resolution paths |
| `skills/frozen-ui-overall-handoff.md` | The frozen wireframe system and how the UI maps to it |
