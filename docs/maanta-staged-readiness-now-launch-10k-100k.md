# MAANTA staged readiness — now / launch / 10k / 100k

Last updated: 2026-07-28 · Audience: founder + CTO/ops.  
Status: **repo-grounded** (tests, CI, tracker, and ops docs as of this date).

This is the single place to decide “what must be true” at each scale. It does
**not** replace the gate tracker (`docs/maanta-launch-readiness-tracker.md`) or
the ops runbook (`docs/maanta-launch-ops-runbook.md`) — it sequences them.

Related:

| Doc | Use when |
|---|---|
| `docs/maanta-launch-readiness-tracker.md` | Gate status (E/M/O items) |
| `docs/maanta-launch-ops-runbook.md` | Human smoke + support ladder |
| `docs/system-design-pre10k.md` | Pre-10k architecture baseline |
| `docs/ops/tech-stack-deep-dive-2026-07.md` | Keep-vs-change to ~100k |
| `docs/ops/auth-strategies.md` | Clerk vs Supabase email OTP |
| `docs/skills/sentry-monitoring.md` | Error monitoring wiring |
| `docs/ops/e2e-golden-path.md` | Playwright enablement |

**Repo evidence as of 2026-07-28:** `npm test` → **293 passed / 45 files**;
CI runs lint + typecheck + vitest + build + **22 SQL suites** in `db-tests`
(count as of 2026-08-02; this line read 16 — drift **D64**).
Browser Playwright golden path exists but **self-skips** until a non-prod E2E
env is wired. Sentry + PostHog are **in code**; production value is gated on
Vercel env.

---

## 1. Testing and readiness right now

Focus: **stabilize production tonight** (before a merchant pilot). Assume the
current auth strategy may be `supabase` (email OTP rehearsal) or `clerk`
(launch path) — verify which is set on Vercel before you smoke-test.

### 1.1 Minimum test suite before trusting production

| Group | What it proves | Status | Skip risk | Hard to add in 48h? |
|---|---|---|---|---|
| **A. Unit/integration — auth helpers** | Redirect allow-list, apex→www canonicalization, OTP error mapping (incl. rate-limit copy), open-redirect blocks, PKCE + `token_hash` callback exchange, `/app-bootstrap` role routing | **Passing** — `supabase-email-auth.test.ts`, `callback.route.test.ts`, `supabase-email-login.test.ts`, `app-bootstrap.test.ts`, `auth-strategy.test.ts`, `launch-auth.test.ts` | Low for code regressions; **does not prove** Supabase dashboard Site URL / email template / SMTP | Already done |
| **B. Unit/integration — money API routes** | Claim/verify/preflight HTTP shapes, fee disclosure, rate-limit hooks mocked | **Passing** — redemptions + verify + preflight route tests | Medium — route tests mock DB; real money invariants live in SQL | Already done |
| **C. SQL money path (CI `db-tests`)** | `claim_deal` → `verify_redemption` → KES 30 ledger; no double-verify; arrears; settle-first top-up; Guardian; fee reversal; security hardening | **Passing in CI** — 16 files under `supabase/tests/` incl. `golden_path_test.sql`, `verify_redemption_money_path_test.sql` | **High if skipped** — silent fee/double-charge bugs | Already done; run `make db-verify` locally if Docker is up |
| **D. Health / readiness** | Liveness; `?ready=1` env presence (503 if core rails missing); admin `?detail=1` / `?probe=1` | **Passing** unit tests + route exists (`GET /api/healthz`) | High for “is prod wired?” blindness | Already done — **must hit prod URL** |
| **E. Browser E2E claim→redeem→verify** | Full UI path on two roles | **Authored, inert** — `e2e/golden-path.spec.ts` skips without `E2E_BASE_URL`; never point at prod (charges KES 30) | Medium for UI breakage; money path already covered by SQL | **Hard for true CI E2E in 48h** (needs dedicated non-prod Supabase+Clerk + storage states). **Easy substitute:** two-phone manual smoke |
| **F. Error monitoring + logging** | Exceptions reach Sentry; auth stages log `[maanta-auth]` | Code wired; **prod DSN human-owned** | High — you won’t see 500s overnight | Easy: set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`, throw sample on `/sentry-example-page` |
| **G. Frozen UI / copy ratchet** | No money-in-amber, banned vocabulary, red failure surfaces | **Passing** — `frozen-ui-rules.test.ts` | Low for tonight | Already done |
| **H. Lint / typecheck / build** | Ship doesn’t compile-break | **CI on every PR/main** | High if you hot-fix without CI green | Already done |

### 1.2 Nice-to-have but not critical tonight

- Flipping Playwright `e2e.yml` to gate CI (needs dedicated staging env — see `docs/ops/e2e-golden-path.md`).
- PostHog funnels live (instrumentation exists; tokens optional for “does login work”).
- IntaSend live STK (tracker E6) — Stripe sandbox is enough for a **non-M-Pesa** smoke.
- SLA-backed FX provider (E9) — fine while launch is KES-only.
- Full waitlist marketing gates (M1–M7) — not required to trust auth + redeem tonight.

### 1.3 Tonight checklist (paste into a runbook)

Do these in order. Stop if any fail.

```text
[ ] 1. Confirm CI green on the commit you deployed (GitHub Actions: ci + db-tests).
[ ] 2. Confirm Vercel Production auth strategy:
        MAANTA_AUTH_STRATEGY + NEXT_PUBLIC_MAANTA_AUTH_STRATEGY
        (both same value: supabase OR clerk).
[ ] 3. curl -sS https://www.maanta.app/api/healthz
        → expect {"ok":true,...} style liveness.
[ ] 4. curl -sS https://www.maanta.app/api/healthz?ready=1
        → HTTP 200. If 503, fix missing Clerk/Supabase env and redeploy.
[ ] 5. As admin: GET /api/healthz?detail=1&probe=1
        → supabase.reason should be "ok" (see prod-auth-deals-recovery skill).
[ ] 6. If strategy=supabase:
        Supabase Auth → Site URL = https://www.maanta.app
        Redirect allow-list includes www + apex /auth/callback
        Email template includes {{ .Token }} and preferably token_hash link
        (docs/ops/auth-strategies.md).
[ ] 7. If strategy=clerk:
        Real publishable + matching secret; phone SMS enabled for claim gate.
[ ] 8. Confirm Sentry DSN on Vercel; open /sentry-example-page once on preview
        or prod and confirm an issue appears.
[ ] 9. Two-device manual smoke on PROD (tagged test accounts only):
        Phone A (shopper): login → feed loads deals → claim → OTP ticket.
        Phone B (merchant): verify code → fee disclosed → Verified →
        “Collect from shopper KES N” → wallet/ledger shows KES 30 debit
        (or arrears if wallet empty — still verify succeeds).
[ ] 10. Negative checks: reuse same code → already redeemed; garbage code → fail.
[ ] 11. Spot-check [maanta-auth] logs (Vercel) for send / verify_otp /
         session_exchange / bootstrap on a fresh login.
[ ] 12. Feed empty? Confirm maanta_node cookie = BBS Mall and 100-deal seed
         applied (docs/skills/node0-seed-bbs-mall.md).
```

**Risk if you skip tonight:** shoppers stuck at login (auth URL/template), empty
feed (seed/cookie/env), or silent money bugs (only possible if you shipped
untested SQL — CI already covers that if green).

---

## 2. What’s needed at launch

**Launch = Nairobi / BBS Mall shopper + merchant pilot** (not national scale).

### 2.1 Technical requirements

| Area | Must-have at launch | Should-have soon after | Nice later |
|---|---|---|---|
| **Auth** | Production Clerk path (`MAANTA_AUTH_STRATEGY=clerk`) **or** intentional supabase rehearsal with Site URL + templates verified; phone required at claim when Clerk; recovery docs (`prod-auth-deals-recovery`, `supabase-prod-email-auth`) | Auth failure alerts in Sentry; documented SMS cost ceiling | Social OAuth; dedicated `founder` DB role |
| **Fraud / abuse** | Guardian v1 (velocity/geofence/collusion); rate limits on claim/OTP/top-up/onboard; verify-anyway + fraud_review tasks; admin held-review | Threshold tuning from real mall data; shopper blacklist SOP used weekly | Automated dispute routing |
| **Logging / monitoring** | Sentry DSN live; `/api/healthz` uptime probe; payment webhook failures → Sentry | Alert rules: 5xx spike, claim/verify errors, webhook failures; PostHog signup→claim→verify funnel | Full APM (Datadog) |
| **Performance** | Feed bucket caps + 30s node cache; claim/verify under a few seconds on mall Wi‑Fi | Measure p95 verify latency; cache invalidation on deal CRUD | Edge/CDN HTML for public browse |
| **Backup / rollback** | Supabase managed backups on; Vercel previous deploy one-click; migrations via `make db-push` dry-run first (`docs/ops/supabase-migrations.md`) | Documented “bad migration” rollback note per release | PITR drills on schedule |
| **Money rails** | Stripe sandbox OK for pilot **if** founder accepts card-only top-ups; ledger + fee reversal proven | Live Stripe cutover decision; IntaSend STK when credentials land (E6) | Multi-currency FX SLA provider (E9) |
| **Jobs** | **Schedule `handle_trial_expiry`** (tracker E11) before Elite trials matter | Push reliability monitoring | Job runner (Inngest/etc.) |

**If we don’t wire Sentry + healthz probes by launch:** overnight outages and
auth/feed failures go unnoticed until a merchant WhatsApps you.

**If we don’t schedule trial expiry:** Elite merchants stay on trial forever —
revenue and plan fairness break.

### 2.2 Operational requirements

| Area | Must-have at launch | Should-have soon after | Nice later |
|---|---|---|---|
| **Merchant onboarding** | On-site visit: account + what3words + first top-up + first deal + live test verify (runbook); agent lock 48h respected | Written O2 owner + WhatsApp number; same-day SLA during mall hours | Self-serve onboarding without agent |
| **Support playbook** | Escalation ladder in runbook (counter → agent → admin → founder); 72h dispute SLA; fee reversal requires decision note | FAQ from first week of friction; tagged test accounts excluded from KPIs | Ticketing tool |
| **Incident response** | Who gets paged (founder + one backup); “revert Vercel deploy / pause deals” decision tree; money incidents never silent-balance-edit | Post-incident note template; Sentry alert → phone | Formal on-call rotation |
| **Humans / roles** | Founder (admin + mall relationship); 1 on-ground agent at BBS; merchant staff trained at visit | Part-time support during mall hours | Separate ops hire |

**If we don’t assign a single merchant-support owner (O2):** onboarding week
collapses into unanswered WhatsApps and abandoned merchants.

### 2.3 Data / analytics at launch

| Need | Must-have | Should-have soon | Nice later |
|---|---|---|---|
| **Events** | PostHog env set; claim / verify / top-up / onboard firing | Funnel dashboard by `node` | Cohort retention |
| **Ops metrics** | Daily: claims, verifications, fee revenue, arrears count, open fraud_review | Weekly KPI review (agency brief format) | Mall-operator export |
| **Review cadence** | Daily glance first 2 weeks; Thursday ops review (runbook) | Investor-ready weekly snapshot | Automated digests |

### 2.4 Launch readiness checklist (go / no-go)

Paste this; all **GATE** must be checked to say “we can go live at BBS Mall.”

```text
TECH
[ ] E10 — Production env vars audited on Vercel (Clerk + Supabase + Stripe + Resend + Sentry + PostHog as applicable)
[ ] E11 — handle_trial_expiry actually scheduled in production
[ ] E2/E3/E4 — Real-device shopper + merchant + admin smoke on production (two phones at mall)
[ ] E15 already in repo — confirm rate limits + service_role locks still green in CI
[ ] Migrations applied to axrrslqssmbngbataejg (make db-push); healthz probe ok
[ ] Node 0 seed / live deals visible under BBS Mall cookie
[ ] Stripe: sandbox accepted for pilot OR live keys + one real top-up tested
[ ] E6 IntaSend — either deferred in writing OR live STK tested
[ ] Auth strategy intentional and dashboard URLs/templates match

OPS
[ ] O2 — Named human owns merchant WhatsApp during onboarding week
[ ] O3 — Dispute path + 72h SLA understood by admin + agent
[ ] On-ground agent roster for BBS opening hours
[ ] Incident: who reverts deploy / who freezes deals

LEGAL / DATA (founder-owned)
[ ] O5 — Legal docs status accepted for pilot (or explicit founder risk accept)
[ ] O6 — Kenya DPA / eu-west-1 decision acknowledged

ANALYTICS
[ ] PostHog tokens live; one end-to-end event visible after a test claim
[ ] Founder knows where to look: /admin reports + PostHog + Sentry

MARKETING (only if campaign is part of “launch”)
[ ] Waitlist + segments live (E7/E8) OR campaign deferred in writing
```

**Go live** only if every TECH + OPS box is checked (or explicitly risk-accepted
in `maanta-decisions-log.md`). Legal boxes need a founder decision, not silence.

---

## 3. What’s needed at 10,000 users

Assume: multiple malls **or** dense BBS usage, repeated redeemers, investor /
partner attention.

### 3.1 What breaks around 10k if we don’t upgrade

| Area | Failure mode |
|---|---|
| **Auth / sessions** | Clerk SMS cost and rate limits bite; login spikes look like outages if no auth alerts |
| **Rate limiting** | Default buckets may be too loose (abuse) or too tight (legit mall rushes) — need prod-tuned thresholds |
| **DB queries / indexes** | Admin/merchant lists still use small `.limit` windows; multi-node live inventory makes client-side browse filter painful |
| **Queues / jobs** | Request-path push + no worker → slow APIs and missed notifications under load; trial cron must already exist |
| **Observability** | Without error budgets / SLO dashboards, you only learn from angry merchants |
| **Manual ops** | Founder-as-support does not scale; dispute/fraud queues backlog past 72h SLA |

### 3.2 Technical upgrades by 10k

- Keep Next.js + Clerk + Supabase RPC money path (do **not** rewrite).
- Cursor/keyset pagination for admin/merchant redemption and lead lists.
- Cache invalidation on deal CRUD; consider longer CDN/ISR for public browse.
- Job runner (or at least reliable cron) for trial expiry, push fanout, lifecycle.
- Tune `check_rate_limit` from real abuse data.
- Read replica or warehouse path so reporting does not contend with claim/verify.
- Explicit SLOs: e.g. verify API p95 &lt; 2s; healthz uptime &gt; 99.5% weekly; dispute resolution &lt; 72h.

### 3.3 Operational / process upgrades

- Support volume: shared inbox + first-response SLA; agent coverage per mall hours.
- Incident management: severity levels, postmortems for money bugs.
- Change management: no hotfixes to money RPCs without SQL suite green; migration dry-run required.
- Security/privacy: access review for admin accounts; minimize who can fee-reverse; basic data-access log review.

### 3.4 Data / governance

- Retention policy for OTP/redemption GPS artifacts (how long raw location lives).
- Aggregate mall reporting (no tenant-confidential leakage) — O4.
- Light compliance baseline: privacy policy published; DPA stance documented (O6).
- Anonymize analytics exports for external partners.

### 3.5 10,000-user readiness matrix

Labels reflect **repo + known human-owned gaps as of 2026-07-28**.

| Area | What must be true by 10k | Status |
|---|---|---|
| **Auth** | Clerk production plan sized for SMS; claim phone gate; auth alerts; strategy docs current | **in progress** (code ready; prod plan/alerts human) |
| **Infra** | Sentry+PostHog live; healthz probed; trial cron; indexes for hot paths; pagination on heavy lists | **missing** ops wiring; **in progress** indexes/cache; pagination **missing** |
| **Ops** | Named support owner; 72h dispute SLA met in practice; on-call backup; release+migration discipline | **in progress** (runbook exists; O2 open; no formal on-call) |
| **Data** | Event taxonomy stable; weekly KPI review; retention rules drafted; mall aggregates without PII leakage | **in progress** (events in code; retention/DPA open) |
| **Product** | Multi-node registry used deliberately; feed remains capped/cached; Guardian thresholds tuned from live data | **ready** for Node 0 shape; multi-mall product polish **in progress** |

---

## 4. What’s needed at 100,000 users

City-scale or multi-city. Architecture detail: `docs/ops/tech-stack-deep-dive-2026-07.md`.

### 4.1 Architecture / infra evolution

| Topic | Expectation by 100k |
|---|---|
| **Multi-region / sharding** | Not required on day one of 100k **if** Kenya stays one primary region. Prefer read replicas + CDN before sharding. Shard/node only when a single Postgres + PostgREST path is the proven bottleneck. |
| **Performance / reliability** | Stricter SLOs (e.g. 99.9% API availability for claim/verify); load testing before big campaigns; error budgets that gate releases |
| **Rollout / rollback** | Staged deploys (preview → canary % → prod); feature flags for risky surfaces; migration expand/contract pattern |
| **Disaster recovery** | Documented RPO/RTO; restore drill from Supabase backup; credential rotation runbook; payment webhook replay procedure |

**If we don’t separate analytics from the operational DB by 100k:** admin
reports and partner exports can stall redemptions at peak mall hours.

### 4.2 Security, privacy, governance

- Stronger access controls: separate `founder` from fee-reversal `admin`; least-privilege service keys; no shared admin passwords.
- Audit logging: keep expanding `admin_ops_log` / fee_reversals; immutable export for disputes.
- Data minimization: drop precise GPS when aged out; encrypt secrets only in platform KMS (Vercel/Supabase).
- Regulatory exposure: Kenya DPA, cross-border (eu-west-1), consumer protection narratives for OTP/location — even before formal licensing.

### 4.3 Organizational changes

| Role | Why it must exist |
|---|---|
| Engineering lead (or fractional CTO) | Owns release discipline, money-path changes |
| Ops / support lead | Owns SLA, disputes, merchant success |
| On-ground / agent manager | Mall coverage, not founder WhatsApp |
| Finance / ledger owner | Reconcile Stripe/IntaSend vs `merchant_transactions` |
| Security/privacy owner (can be part-time) | Access reviews, DPA, incident privacy |

Founder moves from “does every verify” → “owns mall relationships + capital +
final money disputes.” Processes that become non-negotiable: PR review on money
paths, migration dry-run, postmortems, weekly KPI, access reviews.

### 4.4 Partner / data-counterparty expectations

Malls and data partners will ask for:

- Evidence of access control and audit trails on fee/dispute actions.
- Aggregated, reproducible metrics (footfall proxies via claims/verifies) with
  methodology notes — not ad-hoc screenshots.
- Uptime / incident history and a named escalation contact.
- Contractual data-processing terms (what we store, where, retention).
- Clear statement that shopper payment is cash off-app; MAANTA fees merchants.

To be a credible “Oracle-style” counterpart: **versioned metric definitions**,
**exportable aggregates**, **immutable audit of corrections**, and **no silent
rewrites of historical redemptions** (fee reversal credits; never edit the
original fee row — already the product rule).

### 4.5 100,000-user “must fix before” list

These should not wait until after you hit the number:

1. Production observability fully live (Sentry alerts + PostHog funnels + healthz uptime).
2. Scheduled jobs platform (trial expiry + any push/lifecycle off the request path).
3. Pagination + proven query plans for multi-node live inventory and admin lists.
4. Analytics/reporting path that cannot lock the money DB (replica or warehouse).
5. Rate-limit and Guardian thresholds tuned from production, with change audit.
6. Formal incident + dispute SLAs staffed beyond the founder.
7. Access control: who can reverse fees / export PII — reviewed quarterly.
8. Backup restore drill with written RPO/RTO.
9. Staged deploy + migration expand/contract discipline.
10. Published privacy/legal posture (O5/O6 closed or explicitly contracted).
11. Payment reconciliation runbook (Stripe/IntaSend ↔ ledger) owned by a human.
12. Mall partner reporting spec (aggregates only) agreed in writing.
13. SMS/auth cost model that survives 100k MAUs (email-primary login, phone at claim).
14. Load test of claim→verify under peak mall concurrency before a big campaign.
15. Error budget policy that can block a release after a money-path regression.

---

## 5. One-page stage map

| Stage | Primary question | Minimum bar |
|---|---|---|
| **Now** | Can I trust prod tonight? | CI green + healthz ready + auth dashboard correct + two-phone smoke + Sentry receiving |
| **Launch** | Can BBS Mall pilot run without embarrassment? | Tonight bar + trial cron + named support + dispute SLA + env audit + seed live + founder legal risk call |
| **10k** | Can we operate without founder heroics? | Pagination, jobs, tuned limits, staffed support, retention/DPA draft, SLOs |
| **100k** | Are we a credible multi-mall / city product? | Replica/warehouse, DR drills, staged deploys, governance roles, partner-grade aggregates |

---

## Changelog

- **2026-07-28** — Initial staged readiness doc (repo-grounded against 293 vitest
  tests, 16 SQL suites, launch tracker, auth/ops skills).
