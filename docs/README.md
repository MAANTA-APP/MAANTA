# MAANTA docs

Portable markdown set for launch operations. Notion is the drafting/approval
source of truth for ops docs; this folder mirrors approved exports (repo is
the source of truth for anything describing code behavior). Consolidated
2026-07-09 from the launch-handoff and operating-system doc packs; index
updated 2026-09-01 (Node 0 pilot documentation set; documentation register);
previously 2026-08-02 (waitlist backend row corrected) and 2026-07-30,
which added the drift register and the 2026-07-30 operating
documents (previously 2026-07-28, comprehensive audit links).

## Orientation

| File | Purpose |
|---|---|
| `maanta-project-overview.md` | What MAANTA is, actors, commercial model, technical state, workstreams |
| `maanta-claude-operating-system.md` | The operating playbook: tracks, cadences, doc rules |
| `maanta-decisions-log.md` | Repo mirror of load-bearing decisions and where they bite in code |
| `maanta-drift-register.md` | Open/closed record of known claim-vs-reality gaps. Rows close only when they name a guard, or say `no guard: <reason>` — enforced in CI |
| `maanta-documentation-register.md` | **Every audience-facing and operational document** — owner, status, source of truth, last verified, review trigger, classification — plus the P0–P3 gap matrix. Read it before writing a new doc |
| `maanta-glossary.md` | The closed vocabulary. What each term means, and the near-synonyms that change the commercial or legal meaning |

## Node 0 pilot (BBS Mall) — the operating set

Read in this order for a pilot day.

| File | Purpose |
|---|---|
| `ops/merchant-01-pilot-runsheet.md` | **The end-to-end Merchant 01 sequence** — onboarding, QR placement, staff seat, deal, claim, arrival, counter, money read-back, evidence classification, failure capture |
| `ops/node0-known-limitations.md` | What is live, what is dark, what is unproven, and what must never be promised. Config verified against production |
| `ops/evidence-classification-guide.md` | Demo / internal / unclassified / external, the correct SQL, the two counters, the tripwire, and the prompted-or-organic record |
| `ops/node0-evidence-protocol-2026-08-24.md` | The ratified pre-registered lines: rungs, tripwire, kill criterion, the separate shopper-pull phase |
| `ops/field-operator-day-sheet.md` | The day around the visit: open, capture, onboard, escalate, close, and the never-do lists |
| `ops/first-merchant-loop-test.md` | The seven money proofs and the abort conditions |
| `ops/d158-self-serve-live-test.md` | Self-serve onboarding observation checklist — a checklist, not a script |

### Hand-outs (printed, with a contact written on)

| File | Given to |
|---|---|
| `ops/merchant-welcome-pack.md` | The shop owner, on activation day |
| `ops/merchant-staff-counter-card.md` | The person at the till |
| `ops/shopper-pilot-card.md` | A pilot shopper |

## Stakeholder, investor, marketing and legal

| File | Purpose |
|---|---|
| `stakeholder/maanta-stakeholder-report.md` | DRAFT · CONFIDENTIAL — the holistic orientation: what MAANTA is, the loop, the model, Node 0, current state, evidence methodology, risks, success and failure criteria |
| `investor/maanta-investor-overview.md` | DRAFT · CONFIDENTIAL — investor structure and data-room checklist, with RESEARCH REQUIRED left honestly empty |
| `marketing/marketing-claims-register.md` | What may be claimed now, what is prohibited until evidence exists, the vocabulary, and where every number comes from |
| `legal/legal-gap-checklist-2026-09-01.md` | DRAFT — REQUIRES QUALIFIED LEGAL REVIEW. What exists, the four capabilities that shipped after the drafts, and the documents that do not exist |

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
| `maanta-waitlist-data-schema.md` | Waitlist capture spec: segments, fields, consent. **Backend decided 2026-07-10: Resend**, no Supabase waitlist table; the in-repo `POST /api/waitlist` is a stateless proxy. (The "open decision: in-repo vs external backend" note here was stale — drift **D65**) |
| `maanta-email-segmentation-plan.md` | Segments, sub-segments, lead scoring, CRM map, sequence structure |
| `maanta-shopper-email-sequence.md` | Shopper welcome/nurture copy draft |
| `maanta-merchant-email-sequence.md` | Merchant welcome/nurture copy draft |
| `maanta-mall-operator-email-sequence.md` | Mall-operator outreach copy draft |

## Company readiness audit (2026-07-28)

| File | Purpose |
|---|---|
| `ops/maanta-comprehensive-audit-2026-07.md` | **Primary:** full company-readiness audit — product, engineering, data, ops, legal, seed + Nairobi Takeover + 100k + Oracle partner readiness |
| `skills/maanta-audit-100k.md` | Short pointer to the comprehensive audit |

## Ops

| File | Purpose |
|---|---|
| `ops/claude-stack-setup.md` | Skills/tooling recommendations for Claude sessions on this repo + copy-paste session bootstrap prompt |
| `ops/tech-stack-deep-dive-2026-07.md` | Current stack inventory, ~100k scalability assessment, upgrades, advisor map |
| `ops/pwa-install.md` | `/download` install landing + `/app-bootstrap` role router |
| `ops/auth-strategies.md` | Clerk (launch) vs Supabase email OTP (dev/test) toggle |
| `ops/merchant-lifecycle.md` | Merchant lifecycle states and signals |
| `ops/supabase-migrations.md` | How migrations are applied and verified |
| `ops/live-pilot-day-one-prep-2026-07-30.md` | PRs / db push / config flips before the 3-person pilot |
| `ops/live-pilot-3-person-2026-07-30.md` | Act-by-Act day-one runbook (founder + merchant + shopper) |
| `ops/founder-parity-handoff-2026-07-30.md` | Elite trial vs D-12 free-month — what copy is allowed |
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
| `skills/tech-stack-100k.md` | Pointer to the ops deep dive (stack + path to ~100k users) |
| `skills/payments-rails.md` | How money moves: ledger RPC, idempotency, refund/dispute handling |
| `skills/redemption-disputes.md` | Verify-anyway, fraud review, dispute resolution paths |
| `skills/frozen-ui-overall-handoff.md` | The frozen wireframe system and how the UI maps to it |
| `skills/launch-audit-2026-07-24.md` | Repo-vs-prod readiness audit (July 24) |
| `skills/clerk-auth.md` | Clerk + Supabase third-party auth wiring |
| `skills/prod-auth-deals-recovery.md` | Prod feed/deals empty diagnosis |
| `skills/node0-seed-bbs-mall.md` | 100-deal BBS Mall seed apply/verify |
| `skills/notification-prefs-canonical-2026-07-30.md` | Canonical prefs at `/you/notifications`; inbox is alerts-only |
| `skills/repo-branch-audit-2026-07-30.md` | Main health, active-branch sync, consolidation (pause-gate renumber) and deletion list |
