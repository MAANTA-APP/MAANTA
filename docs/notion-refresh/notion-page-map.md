# Notion page map — MAANTA refresh (2026-07-28)

Inventory of existing MAANTA-related Notion pages under **MAANTA — Build OS**, classified against current repo reality (`main` @ `99bbb76` and docs as of 2026-07-28).

**Legend — recommended action:** keep · update · merge · archive · replace · create  
**Priority:** critical · important · low

| Existing page title | Category | Current status | Outdated? | Why outdated | Recommended action | Canonical / replacement | Priority | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| MAANTA — Build OS | Hub | Partially current (status appendices through 07-27) | Partially | Hub is a long changelog; hard to find "what is true now"; auth still framed Clerk-only in places | update | Keep as hub; prepend **Operating Truth** section + link to new IA | critical | Founder + AI lead | Do not delete child pages; reorganize via links |
| Product Brief | Company / product | Stale framing | Yes | Says no Swahili/multi-language; underplays dual auth; Oracle listed only as "not building" without future pathway clarity; no working-now vs staged | replace → redirect | **MAANTA Overview** + **Current State** | critical | Founder | Keep brief as archive stub pointing to Overview |
| Frozen Scope & Rules | Governance | Mostly valid | Mild | Auth wording Clerk-only; language ban may conflict with `preferred_language` (sw = coming soon UI); still the right home for frozen rules | update | Keep; sync frozen list from `docs/maanta-decisions-log.md` | critical | Founder | Frozen rules remain authoritative |
| Revenue & Business Model | Commercial | Largely valid | Mild | Opening credit / YOU PAY notes OK; needs clear "shopper pays merchant cash off-app" | update | Keep; cross-link Claims/Fees page | important | Founder | |
| Architecture | Tech | Partially outdated | Yes | Status notes stuck ~07-21–07-24; dual auth strategy missing; `/app-bootstrap`, healthz, FX abstraction incomplete | update | Keep for stack detail; **Current State** + **Auth** are narrative SoT | important | Engineer | Point readers to repo `docs/ops/tech-stack-deep-dive-2026-07.md` |
| Schema Reference | Tech | Severely outdated | Yes | Explicit v3 baseline **2026-06-29**; 40+ migrations since | archive + replace pointer | Repo migrations + new **What Is Real** table | important | Engineer | Notion should say "repo migrations win" |
| 12-Week Build Schedule | Roadmap | Historical | Yes | Pre-launch build tracker; postdates PR stacks; confuses "done in repo" with launch | archive | **Roadmap: Now / Launch / 10k / 100k** | important | Founder | Keep for archaeology only |
| 12-Week Operational Plan | Ops / GTM | Historical | Yes | Pre-launch week plan; Oracle listed as out-of-scope without pathway page | archive | **Launch Readiness** + **Roadmap** + **Strategic Partnerships** | important | Founder | |
| Post-Launch Operating Plan | Ops | Premature / aspirational | Mild | Useful structure but assumes launch; needs "not yet in effect" banner | update | Keep under Launch / Post-launch; defer activation | low | Ops lead | |
| Open Questions | Governance | Mixed | Partially | Many items resolved (Clerk, Resend, Guardian, fee reversal); stale open items mislead | update | Keep; prune resolved → Decisions Log | important | Founder | |
| Decisions Log | Governance | Current-ish | Mild | Must stay mirrored with `docs/maanta-decisions-log.md` | keep / sync | Keep as canonical ops decisions | critical | Founder + AI lead | Repo mirror exists |
| User Flows | Product | Partially outdated | Yes | Auth path Clerk-centric; claim phone gate OK; no `/app-bootstrap`; Discover/Browse map missing | merge into | **Product Flows** (Shopper / Merchant / Admin) | critical | Product | |
| API Actions & Edge Functions | Tech | Misleading title | Yes | Core loop is Postgres RPCs, not Edge Functions; page written for older model | archive / rewrite stub | Point to repo RPC tests + Architecture | low | Engineer | |
| RLS Permissions | Tech | Snapshot | Mild | Useful but drifts; repo migrations win | keep with banner | Keep; "verify against migrations" | low | Engineer | |
| Testing & QA | Tech / launch | Partially outdated | Yes | Does not clearly separate CI green vs prod golden path unpaid | merge highlights into | **Observability and Production Verification** + **Launch Readiness** | important | Engineer | |
| Brand Guidelines | Brand | Valid enough | No | Not launch-blocking | keep as-is | Keep | low | Founder | |
| Prompt Library | Process | Mixed | Mild | Useful for sessions; not truth surface | keep as-is | Keep under Process | low | AI lead | |
| Legal & Finance Index | Legal | Stale checklist | Yes | Incorporation / DPA still open; drafts not published | update | Keep; link **Risks** | important | Founder + lawyer | |
| Session Framework | Process | Valid | Mild | Align roles with Claude OS | keep / light update | Keep | low | AI lead | |
| CLAUDE.md (Notion copy) | Process | Drift risk | Yes | Static copy of repo CLAUDE.md will rot | archive or "mirror only" banner | Repo `CLAUDE.md` wins | important | AI lead | Prefer link to repo |
| WALKTHROUGH.md (Notion copy) | Process | Outdated | Yes | Superseded by Node 0 rehearsal checklist + UI walkthrough skills | archive | Node 0 Rehearsal Checklist | low | Engineer | |
| README — Developer Onboarding | Eng | Partially outdated | Yes | Auth description Clerk-only; missing dual strategy + local supabase rehearsal | update | Keep; sync with `AGENTS.md` | important | Engineer | |
| Waitlist & Email Platform (Resend) | Growth | Mostly current | Mild | Needs prod signup verification status from tracker E7 | update | Keep | important | Growth | |
| Node 0 Rehearsal Checklist (BBS Mall) | Launch | Partially wrong | Yes | Says Clerk is the only sign-in path; rehearsal often uses `MAANTA_AUTH_STRATEGY=supabase`; seed story expanded (100 deals / Nairobi 150) | update | Keep operational checklist; sync with `docs/maanta-node0-rehearsal-checklist.md` | critical | Ops + Engineer | |
| Agent rotations and roles – MAANTA BBS rehearsal | Ops | Current for staffing | No | Field ops, not product SoT | keep as-is | Keep under BBS rollout | important | Ops co-founder | |
| Field templates and launch rota – MAANTA BBS | Ops | Templates OK | Mild | Dates/placeholders (e.g. Mar 2027) may confuse | keep / light update | Keep under BBS | low | Ops | |
| Prod apply checklist — Cursor sync (2026-07-27) | Launch | Useful but dated | Mild | Auth strategy flip + email OTP recovery (2026-07-28) not reflected | merge into | **Launch Readiness** + **Observability** | critical | Founder | Keep dated checklist as child artifact |
| *(missing)* MAANTA Overview | Company | — | — | Needed canonical overview | **create** | New | critical | Founder | |
| *(missing)* Current State of MAANTA | Company | — | — | Needed truth snapshot | **create** | New | critical | Founder | |
| *(missing)* What Is Real vs Staged vs Planned | Product | — | — | Highest-value diligence page | **create** | New | critical | Founder | |
| *(missing)* Launch Readiness | Launch | — | — | Tracker exists in repo, not as clean Notion SoT page | **create** | New (mirror tracker) | critical | Founder | |
| *(missing)* BBS Mall / Nairobi Rollout | GTM | — | — | Split across Product Brief + agent pages | **create** | New | critical | Ops | |
| *(missing)* Product Flows | Product | — | — | Replace User Flows | **create** | New | critical | Product | |
| *(missing)* Auth and Identity | Tech | — | — | Dual strategy not represented | **create** | New | critical | Engineer | |
| *(missing)* Claims, Redemption, Fees, and Guardian | Product / risk | — | — | Scattered across Architecture / Revenue / Guardian note | **create** | New | critical | Engineer | |
| *(missing)* Observability and Production Verification | Ops | — | — | CI vs prod verification confusion | **create** | New | critical | Engineer | |
| *(missing)* Roadmap: Now / Launch / 10k / 100k | Roadmap | — | — | Replace 12-week schedules | **create** | New | critical | Founder | |
| *(missing)* Investor Readiness | Fundraising | — | — | No dedicated honest diligence page | **create** | New | important | Founder | |
| *(missing)* Strategic Partnerships and Data Pathway | Partnerships | — | — | Oracle wrongly read as present or permanently banned without pathway | **create** | New | important | Founder | |
| *(missing)* Risks and Hard Truths | Governance | — | — | Needed for investor-safe posture | **create** | New | critical | Founder | |
| *(missing)* Archive / Deprecated Assumptions | Archive | — | — | Needed landing for retired claims | **create** | New | important | AI lead | |

## Duplicate clusters → single canonical

| Topic | Duplicates today | Canonical going forward |
|---|---|---|
| What MAANTA is | Product Brief, Build OS intro, CLAUDE.md copy | **MAANTA Overview** |
| Launch status | Build OS changelog, Prod apply checklist, Testing & QA, 12-Week Build | **Launch Readiness** + **Current State** |
| Journeys | User Flows, WALKTHROUGH, Product Brief sections | **Product Flows** |
| Auth | Architecture, Frozen Scope, Rehearsal checklist, Product Brief | **Auth and Identity** |
| Money + fraud | Revenue, Architecture, Guardian design (repo), Decisions | **Claims, Redemption, Fees, and Guardian** |
| Roadmap | 12-Week Build, 12-Week Ops, Post-Launch Plan | **Roadmap: Now / Launch / 10k / 100k** |
| Oracle / data | Product Brief "not building", Ops plan mentions | **Strategic Partnerships and Data Pathway** (future, not present) |

## Repo mirrors (do not treat Notion alone as code truth)

| Repo path | Notion relationship |
|---|---|
| `docs/maanta-project-overview.md` | Feed **MAANTA Overview** |
| `docs/maanta-launch-readiness-tracker.md` | Feed **Launch Readiness** |
| `docs/maanta-decisions-log.md` | Mirror **Decisions Log** |
| `docs/ops/auth-strategies.md` | Feed **Auth and Identity** |
| `docs/system-design-pre10k.md` + `docs/ops/tech-stack-deep-dive-2026-07.md` | Feed Roadmap + Architecture |
| `docs/skills/launch-audit-2026-07-24.md` | Evidence for Real vs Staged |
| `docs/skills/prod-auth-deals-recovery.md` | Observability / prod verification |
| `docs/skills/supabase-prod-email-auth.md` | Auth reality (2026-07-28) |
