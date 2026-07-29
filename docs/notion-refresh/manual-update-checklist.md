# Manual Notion update checklist

Use this if applying the refresh by hand. Repo drafts live in `docs/notion-refresh/`.  
Parent: **MAANTA — Build OS** (`3892048e-2734-81e6-9249-e9cd4ef8c399`).

> **§C + §D executed 2026-07-29** (audit follow-up, `docs/skills/full-state-audit-2026-07-29.md`).
> Sections **A/B** (create the 14 canonical pages + Operating Truth hub) were already
> done in the 07-28 refresh. This pass added the missing **§C** banners — Testing & QA,
> Post-Launch Operating Plan, CLAUDE.md (mirror-only), RLS Permissions — and the **§D**
> additive notes on Frozen Scope (dual-auth + language≠i18n), Revenue (cash off-app),
> Open Questions, Decisions Log parity, Waitlist (E7), Legal (O5/O6), and README. Pages
> already bannered on 07-28 (Product Brief, User Flows, both 12-Week plans, Schema
> Reference, API Actions, WALKTHROUGH, Architecture, Node 0 Rehearsal) were **left as-is,
> not double-banded**. All writes were prepend/insert-only — no page or content deleted.

## Before you start

- [ ] Skim `notion-page-map.md` and `notion-information-architecture.md`
- [ ] Confirm you will **archive, not delete**
- [ ] Open repo drafts in a split window for copy-paste

## A. Create hub section on Build OS

- [ ] At top of **MAANTA — Build OS**, insert a callout: “Operating Truth (2026-07-28) — start here”
- [ ] Link the 14 canonical pages (create stubs first if needed)
- [ ] Leave historical changelog below; do not erase 07-24/07-26/07-27 notes

## B. Create canonical pages (paste drafts)

Create each as a child of Build OS (or under the new section pages). Paste body from the matching markdown **without repeating the H1 as a block** if Notion already shows the title.

- [ ] `maanta-overview.md` → **MAANTA Overview**
- [ ] `current-state-of-maanta.md` → **Current State of MAANTA**
- [ ] `what-is-real-vs-staged-vs-planned.md` → **What Is Real vs Staged vs Planned**
- [ ] `launch-readiness.md` → **Launch Readiness**
- [ ] `bbs-mall-nairobi-rollout.md` → **BBS Mall / Nairobi Rollout**
- [ ] `product-flows.md` → **Product Flows**
- [ ] `auth-and-identity.md` → **Auth and Identity**
- [ ] `claims-redemption-fees-guardian.md` → **Claims, Redemption, Fees, and Guardian**
- [ ] `observability-and-production-verification.md` → **Observability and Production Verification**
- [ ] `roadmap-now-launch-10k-100k.md` → **Roadmap: Now / Launch / 10k / 100k**
- [ ] `investor-readiness.md` → **Investor Readiness**
- [ ] `strategic-partnerships-and-data-pathway.md` → **Strategic Partnerships and Data Pathway**
- [ ] `risks-and-hard-truths.md` → **Risks and Hard Truths**
- [ ] `archive-deprecated-assumptions.md` → **Archive / Deprecated Assumptions**

## C. Banner / archive existing pages

Add a DEPRECATED or UPDATE banner + link:

- [ ] Product Brief → Overview
- [ ] User Flows → Product Flows
- [ ] 12-Week Build Schedule → Roadmap
- [ ] 12-Week Operational Plan → Roadmap / Launch Readiness
- [ ] Schema Reference → “historical; repo migrations win”
- [ ] API Actions & Edge Functions → “RPCs, not Edge Functions”
- [ ] WALKTHROUGH.md → Node 0 Rehearsal Checklist
- [ ] CLAUDE.md Notion copy → “repo wins”
- [ ] Testing & QA → Observability + Launch Readiness
- [ ] Post-Launch Operating Plan → “not yet in effect”

## D. Targeted updates (existing pages to edit, not replace)

- [ ] **Frozen Scope & Rules** — add dual-auth note; clarify language preference ≠ full i18n; keep frozen commercial rules
- [ ] **Revenue & Business Model** — explicit cash-off-app shopper payment
- [ ] **Architecture** — dual auth, healthz, FX abstraction, RPC core loop; remove “active parallel audit branch” confusion
- [ ] **Node 0 Rehearsal Checklist** — strategy-aware auth steps; 100-deal / personas seeds
- [ ] **README — Developer Onboarding** — point to `AGENTS.md` + auth strategies
- [ ] **Open Questions** — move resolved items to Decisions Log; leave true opens (IntaSend, DPA, incorporation, FX SLA)
- [ ] **Decisions Log** — ensure parity with `docs/maanta-decisions-log.md`
- [ ] **Waitlist & Email** — note E7 ongoing verification
- [ ] **Prod apply checklist** — add 2026-07-28 auth/email OTP recovery bullets; link Launch Readiness
- [ ] **Legal & Finance Index** — O5/O6 status

## E. Cross-links

- [ ] From Overview → Current State, Real vs Staged, Launch, Risks
- [ ] From Investor Readiness → Real vs Staged (required)
- [ ] From Partnerships → Archive note on Oracle
- [ ] From Build OS workspace structure table → new IA links

## F. Quality bar

- [ ] No page claims IntaSend live
- [ ] No page claims Oracle shipped
- [ ] No page equates CI green with prod hardened
- [ ] Auth pages mention both strategies
- [ ] Seed data labeled staged
- [ ] Last verified date = 2026-07-28 (or today when you paste)

## G. After Notion

- [ ] Export or leave repo `docs/notion-refresh/` as the paste source of truth
- [ ] Update `docs/skills/` handoff note for this refresh
- [ ] Optional: Drive export of the 14 canonical pages
