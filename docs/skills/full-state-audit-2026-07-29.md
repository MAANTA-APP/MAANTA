# MAANTA full-state audit — repo × production × Notion (2026-07-29)

**Author:** Claude (Reviewer session) · **Date:** 2026-07-29 · **Branch audited:** `main` @ `9ef853a` (PR #125)
**Method:** repo read + `npm test`/`build`/`lint`/`typecheck`; live reads of Supabase (`axrrslqssmbngbataejg`), Vercel (`maanta-nuia`), Sentry (`maanta`), PostHog (project 211805); full Notion Build OS + Operating Truth tree.
**Why now:** the founder ran ~5 days of Cursor-authored work (PRs #75→#125, 2026-07-24 → 2026-07-29) while Claude tokens were out. This audit reconciles what the code, production, and Notion each say — and flags where they disagree.

---

## 1. One-line verdict

MAANTA is a **healthy, fully-provisioned pre-launch rehearsal environment**. The product loop (browse → claim → verify → KES 30 fee/arrears) is implemented, CI-green, and deployed live — but running on **seed data, not organic traffic**, and several human-owned launch gates (money rails, legal, device sign-off, trial-expiry scheduling) remain open. Nothing is broken; the risk is **status drift**, not code quality.

## 2. Snapshot across the three surfaces

| Surface | State | Signal |
|---|---|---|
| **Repo** (`main` @ #125) | 293/293 vitest pass · lint clean · typecheck clean · build OK *with Clerk env* | 🟢 Strong |
| **Supabase prod** | `ACTIVE_HEALTHY`, eu-west-1, PG17, 67 migrations applied (latest `20260726200000`, matches repo) | 🟢 Live, aligned |
| **Vercel prod** | `maanta-nuia`, latest prod deploy **today** (`9ef853a`/#125) `READY`; last 20 deploys 100% `READY` | 🟢 Live |
| **Sentry** | Wired, ingesting; 3 low-volume issues (0 users affected) | 🟢 Wired / near-empty |
| **PostHog** | Ingesting **today**; 2,757 events / 217 persons over 6 days; `deal_viewed` + `deal_claim_started` firing | 🟢 Wired / rehearsal volume |
| **Notion** | Operating Truth 14-page refresh live (2026-07-28) **+** legacy Build OS pages un-archived | 🟡 Two doc systems coexist |
| **Traffic / money** | 291 deals but **5 redemptions**, 4 transactions; audit/fee/notification tables empty | 🟡 Rehearsal, not traction |

## 3. Repo state (verified this session)

- **Tests:** 45 vitest files, **293 tests, 0 failures** (~7s). Money path is the best-covered area (ledger idempotency, fee-reversal note-required, Stripe webhook refund/dispute dedupe, verify collect-line threading).
- **Lint / typecheck:** both clean.
- **Build:** default `npm run build` **fails at prerender** with 48 identical `@clerk/nextjs: Missing publishableKey` errors on public/shopper pages. **Root cause is env, not code** — supplying any Clerk key builds all 90 pages clean (exit 0). Clerk is the default auth strategy, so **build/deploy env must carry `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`.** Vercel prod evidently does (deploys are green).
- **Migrations:** 67 files, continuous from the 2026-06-30 v3 baseline. All six frozen rules enforced at the DB layer (see §6).
- **`npm audit`:** 11 vulns (1 critical / 7 high / 3 moderate) in the dependency tree — **not blocking, but review before open launch.**
- **Feature completeness:** every major area implemented (shopper discovery/claim, OTP verify, merchant wallet/ledger/top-up, admin approval/fraud/fee-reversal, Guardian v1, agent leads, push, Stripe + IntaSend). Only intentional partials: legal pages are placeholder shells; `authjs` strategy is a reserved alias falling back to Supabase.

## 4. Production infrastructure (live reads)

### Supabase `axrrslqssmbngbataejg` — ACTIVE_HEALTHY, eu-west-1, PG 17.6
- 27 public tables, **all RLS-enabled**. Row counts: users 228 · merchants 213 · deals 291 · **redemptions 5** · merchant_transactions 4 · app_config 7. Money/audit tables (audit_logs, fee_reversals, admin_ops_log, notifications, kpi_counters, guardian_events) **empty** → seed/rehearsal, not organic.
- 67 migrations applied; latest `20260726200000_architecture_now_fixes` = repo latest. **Schema is aligned with `main`.**
- **Security advisors:**
  - `2 ERROR — SECURITY DEFINER views` (`merchants_public_browse`, `deals_public_browse`). **This is intentional and documented** — migration `20260723130000` deliberately sets `security_invoker = false` so `anon` (which had its base-table SELECT revoked in `20260720120000`) can read only the safe column projection. The advisor flags the pattern; the design is correct. *No action beyond acknowledging it as a known accepted advisory.*
  - `1 WARN — leaked-password protection disabled` (Supabase Auth HIBP check off) → **quick win to enable.**
  - ~11 WARN — core-loop SECURITY DEFINER RPCs executable by `authenticated` (they self-authorize internally; expected).
  - ~40 WARN — anon-evaluated RLS policies (expected for public browse; confirm writes are gated).
- **Performance advisors:** 125 WARN multiple-permissive-policies (per-query overhead at scale, not correctness), 18 unused indexes, 17 unindexed FKs. Defer to the 10k lane.

### Vercel `maanta-nuia`
- Linked to `MAANTA-APP/MAANTA` `main`; custom domain `www.maanta.app` (apex 308→www).
- Latest prod deploy `dpl_JBo9…` **READY**, today, commit `9ef853a`. Last 20 deploys all `READY`, zero errors. High velocity 07-26→07-29.

### Sentry (`maanta`, de.sentry.io, project `javascript-nextjs`)
- Wired and capturing. **3 unresolved, all near-zero volume, 0 users affected:** (1) Server Components render error on **`/browse`** — 6 events, 3 days ago; (2) `TypeError … reading 'getReader'` on `/` — 1 event; (3) Clerk script failed to load from `clerk.maanta.app` on `/sign-up` — 1 event. The `/browse` SSR error is the only one worth a targeted look (low volume, but it's the primary shopper surface).

### PostHog (MAANTA / project 211805, eu.posthog.com)
- **Live and ingesting today** (last event 2026-07-29 08:52 UTC). 2,757 events / 217 persons over 6 days. Custom events `deal_viewed` (59) and `deal_claim_started` (8) firing. 4 dashboards / 18 insights; 0 feature flags / 0 experiments. **No redemption/purchase custom event observed yet** (consistent with 5 redemptions).

## 5. Notion state (live reads)

- **Personal space** ("Mohamed Elmi's space"), single user, **no teamspaces, no databases** — everything is plain pages with tables mirrored to repo markdown.
- **Two doc systems coexist under the `MAANTA — Build OS` hub** (`3892048e-2734-81e6-9249-e9cd4ef8c399`):
  1. **`Operating Truth (2026-07)`** (`3ab2048e-2734-8116-9f75-e6939ab06f65`) — the **new canonical 14-page set, all edited 2026-07-28**, matching `docs/notion-refresh/`. This is the declared "start here" SoT. ✅ It *was* pasted in — the refresh is real, not just prepared.
  2. **Legacy Build OS pages** (Product Brief, User Flows, 12-Week Build/Ops schedules, Schema Reference, Architecture, etc.) — **still live and un-archived**, several describing older architecture. Notion's own "Risks and Hard Truths" page states *"Notion has drifted."*
- **Frozen business rules in Notion match the repo CLAUDE.md exactly** — KES 30 fee (all plans), Elite 30-day trial + 7-day grace (Node-0 window) then auto-downgrade, KES 3,500/mo (Feb 2027 review), zero-balance gate, verify-anyway, 15-min ticket grace. **No contradiction on the frozen rules.**
- **Notion Decisions Log stops at 2026-07-25** — the 07-26 (#85–#93) and 07-27 (#100–#107) Cursor batches were recorded only in the Build-OS changelog, not as append-only Decisions Log rows.

## 6. Frozen-rule enforcement — confirmed in code

| Rule | Enforced at | ✓ |
|---|---|---|
| KES 30 success fee, all plans, at verify | `20260702094145` (`app_config.success_fee_kes='30.00'` + `enforce_deal_success_fee` trigger, 30.00 fallback); `deduct_success_fee_or_record_arrears` rejects any ≠ canonical | ✅ |
| Elite trial = 30 days | `20260701110443` + `activate_merchant` | ✅ |
| + 7-day grace | `20260701110443` / `20260701111223` (`grace_period_ends_at = trial_ends_at + 7d`, agent task) | ✅ |
| + auto-downgrade to Standard | `handle_trial_expiry()` (Phase 2) | ✅ *(but see §7 — nothing schedules it)* |
| Zero-balance gate (no new deals ≤ 0) | `20260703190627` BEFORE INSERT trigger `enforce_zero_balance_gate` | ✅ |
| Verify-anyway (shopper preserved, dispute after) | `20260709191750` + Guardian v1 `20260721140000`; `/api/redemptions/verify` | ✅ |

## 7. Drift & discrepancies (the point of the audit)

Ordered by how much they can mislead a decision.

1. **Tracker lags the ops reality (status too pessimistic).** `docs/maanta-launch-readiness-tracker.md` still shows **E10** (prod env) 🟡 "founder must confirm" and **E16** (PostHog) 🟡 "no-op until env vars set" — but production is deployed, migrations are applied, seeds are live, and **PostHog is ingesting events today**. The tracker under-reports real progress. → Update E10/E16, and reconcile the tracker's own header ("128 vitest + 15 SQL suites") against the current **293 vitest** count.

2. **`handle_trial_expiry` has no scheduling migration (real gap, E11).** The function exists and is correct, but **no migration runs `cron.schedule(...)`** to invoke it. Unless a pg_cron job was created by hand in the prod dashboard (unverified), **Elite trials will never actually expire → never downgrade → the KES 3,500 conversion path never triggers.** Confirm a scheduled job exists in prod, or add one. This is the highest-value *silent* gap.

3. **Notion runs two doc systems.** New Operating Truth (canonical, 07-28) vs un-archived legacy Build OS pages. Anyone landing on Product Brief / Schema Reference / the 12-Week schedules gets stale architecture. → Execute `docs/notion-refresh/manual-update-checklist.md` §C (banner/link the ~10 legacy pages) and §D (body-rewrites) — currently **unchecked**.

4. **Decisions Log is 4 days behind the code, in both mirrors.** Notion log ends 07-25; the repo `docs/maanta-decisions-log.md` doesn't carry the 07-26/07-27/07-28 work as formal rows either. MAANTA's own governance rule is append-only parity. → Backfill the 07-26→07-29 decisions (100-deal/Nairobi seed policy, `preferred_language`, architecture now-fixes, dual-auth strategy, prod-apply confirmation) into both.

5. **Elite trial length: 14 vs 30 days doc drift.** `approve/route.ts` flags in-code that wireframe 11j says 14 days while the DB grants 30. **The DB (30 days) is the frozen rule and is correct** — the wireframe is stale. → Fix the wireframe/Notion reference, not the code.

6. **Duplicate `admin@maanta.app` Clerk rows in prod** (noted in `backend-prod-setup-status-2026-07.md`). Two rows were both promoted to `admin`. → Dedupe (keep one) before the admin device pass, or admin actions may resolve ambiguously.

7. **Sentry `/browse` Server-Components error (6 events).** Low volume, 0 users affected, but it's the primary shopper surface and unexplained. → Reproduce once against prod seed data; likely a nullable-field render, unrelated to the (intentional) browse-view advisor.

8. **`npm audit`: 1 critical / 7 high.** Dependency-tree, not app code. → Triage before open shopper launch.

9. **Seeded ≠ real, and CBD/Westlands are synthetic.** 213 merchants / 291 deals are rehearsal seed; CBD Galleria + Westlands Hub are **synthetic rehearsal nodes**, not live launch nodes. Keep this label explicit in any investor/partner demo (Notion's "What Is Real vs Staged vs Planned" already does — keep using it).

## 8. Genuinely open launch gates (unchanged, human-owned)

- 🔴 **E6** — IntaSend M-Pesa STK live credentials (blocked externally; code path ready).
- 🔴 **O5** — legal docs lawyer-reviewed & published (blocked on incorporation → Nov Nairobi trip).
- 🟡 **E2–E4** — real-device 2-phone golden path at BBS, **signed off** (only 5 redemptions exist on prod — this has effectively not been done at volume).
- 🟡 Stripe **live** keys / live-mode top-up proof (sandbox works).
- ⬜ **E11** — trial-expiry scheduling in prod (see §7.2).
- ⬜ **O6** — Kenya DPA / eu-west-1 cross-border basis.
- ⬜ **O2 / O4** — merchant onboarding support process; BBS reporting expectations.
- ⬜ **M1–M7** — marketing/agency campaign not live.
- **Open ops questions touching money:** Q14 (named fee-reversal approver) and Q15 (tag agent-stipend redemptions so pilot success-fee metrics aren't self-inflated) — both undecided.

## 9. Recommended next actions (prioritized)

**This week (cheap, high-value):**
1. Verify/create the **pg_cron job for `handle_trial_expiry`** in prod (§7.2) — otherwise the whole Elite economics loop is inert.
2. Enable **Supabase leaked-password protection** (one toggle).
3. **Dedupe `admin@maanta.app`** Clerk rows.
4. Refresh the **launch-readiness tracker** (E10 ✅, E16 → events confirmed, fix the vitest count) and **backfill the Decisions Log** 07-26→07-29 in repo + Notion.
5. Run the **Notion `manual-update-checklist.md` §C/§D** to retire/banner the legacy Build OS pages.

**Before BBS rehearsal sign-off:**
6. Do a **real 2-phone claim→verify→fee** pass at BBS and record counts on Launch Readiness (moves redemptions off 5).
7. Reproduce & fix the **Sentry `/browse`** error.

**Before open shopper launch:**
8. Decide the **launch money rail** (Stripe-live and/or IntaSend) explicitly — don't drift into Stripe-only by default.
9. Triage **`npm audit`** criticals.
10. Resolve **Q14/Q15**, **O2/O4**, and start **legal/incorporation** ahead of November.

---

### Correction to earlier docs, for the record
- Production is **not** "env pending" — Vercel prod is live, Supabase schema is applied (67/67), and observability is ingesting. The gap is **verification-at-volume + money rails + legal**, not deployment.
- The two Supabase browse-view "ERROR" advisors are an **accepted, documented design choice**, not a defect.
