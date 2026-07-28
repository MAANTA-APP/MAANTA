# MAANTA Notion information architecture (proposed)

Last updated: 2026-07-28 · Parent hub remains **MAANTA — Build OS**.

## Design principles

1. **One page, one job.** Overview ≠ launch tracker ≠ auth runbook.
2. **Truth labels everywhere.** Working now · Implemented but unverified in prod · Staged/seeded · Manual/ops-assisted · Planned · Future strategic path.
3. **Repo wins for behavior.** Notion wins for operating decisions and narrative; when they disagree, flag drift — do not invent.
4. **Archive, don't delete.** Move deprecated assumptions under Archive.

## Proposed tree

```
MAANTA — Build OS                          (hub — update; keep as root)
├── 00 · Start here
│   ├── MAANTA Overview                    ★ NEW (canonical)
│   ├── Current State of MAANTA            ★ NEW
│   ├── What Is Real vs Staged vs Planned  ★ NEW
│   └── Risks and Hard Truths              ★ NEW
│
├── 01 · Launch & Node 0
│   ├── Launch Readiness                   ★ NEW (mirrors tracker)
│   ├── BBS Mall / Nairobi Rollout         ★ NEW
│   ├── Node 0 Rehearsal Checklist         (update existing)
│   ├── Prod apply checklist (2026-07-27)  (keep as dated artifact)
│   ├── Agent rotations and roles          (keep)
│   └── Field templates and launch rota    (keep)
│
├── 02 · Product
│   ├── Product Flows                      ★ NEW
│   │   (Shopper · Merchant · Admin/Founder sections)
│   ├── Claims, Redemption, Fees, Guardian ★ NEW
│   ├── Revenue & Business Model           (update existing)
│   └── Frozen Scope & Rules               (update existing)
│
├── 03 · Technical truth
│   ├── Auth and Identity                  ★ NEW
│   ├── Observability & Prod Verification  ★ NEW
│   ├── Architecture                       (update + banner)
│   ├── Schema Reference                   (archive banner → repo)
│   ├── RLS Permissions                    (keep + banner)
│   └── README — Developer Onboarding      (update)
│
├── 04 · Growth & GTM
│   ├── Waitlist & Email (Resend)          (update)
│   ├── Roadmap: Now / Launch / 10k / 100k ★ NEW
│   └── Post-Launch Operating Plan         (banner: not yet in effect)
│
├── 05 · External posture
│   ├── Investor Readiness                 ★ NEW
│   ├── Strategic Partnerships & Data Pathway ★ NEW
│   └── Legal & Finance Index              (update)
│
├── 06 · Governance & process
│   ├── Decisions Log                      (keep / sync)
│   ├── Open Questions                     (prune)
│   ├── Session Framework                  (keep)
│   └── Prompt Library                     (keep)
│
└── 99 · Archive
    ├── Archive / Deprecated Assumptions   ★ NEW (index)
    ├── Product Brief (superseded)         (rename + point to Overview)
    ├── User Flows (superseded)            (point to Product Flows)
    ├── 12-Week Build Schedule             (archive)
    ├── 12-Week Operational Plan           (archive)
    ├── WALKTHROUGH.md copy                (archive)
    ├── CLAUDE.md Notion copy              (archive or "repo wins" banner)
    └── API Actions & Edge Functions       (archive / stub)
```

## Audience routing

| Reader | Start here | Then |
|---|---|---|
| Founder / operator | Current State → Launch Readiness | Risks, BBS Rollout, Product Flows |
| Engineer | Auth and Identity → Observability | Architecture, Rehearsal Checklist |
| Investor / advisor | Overview → Real vs Staged → Investor Readiness | Risks, Roadmap |
| Partner / mall | Overview → BBS Rollout → Partnerships & Data Pathway | Revenue (no Oracle claims) |
| Field agent | Agent rotations → Field templates → Product Flows (Merchant) | Rehearsal Checklist |

## Required section pattern (on narrative pages)

Use these headings where useful:

- Purpose
- Current reality
- What is working
- What is not yet ready
- Risks
- Dependencies
- Next actions
- Related pages

## Analytical lenses (embedded, not separate pages)

| Lens | Primary pages |
|---|---|
| Product reality | Overview, Real vs Staged, Product Flows |
| Technical readiness | Auth, Architecture, Observability |
| Operational readiness | Launch Readiness, BBS Rollout, Agent rotations |
| GTM readiness | Waitlist, Roadmap, BBS Rollout |
| Merchant readiness | Product Flows (Merchant), Revenue, Claims/Fees |
| Launch readiness | Launch Readiness, Risks |
| Investor readiness | Investor Readiness, Real vs Staged, Risks |
| Partnership readiness | Partnerships & Data Pathway, BBS Rollout |
| Data governance readiness | Partnerships & Data Pathway, Legal, Risks |

## Sync rule

After any meaningful session:

1. Update the relevant **canonical** Notion page (or paste from `docs/notion-refresh/*.md`).
2. Mirror behavior changes into repo docs.
3. Add a one-line note to **Current State** "Last verified" date.
4. Never leave truth only in chat.
