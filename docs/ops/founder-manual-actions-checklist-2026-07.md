# Founder manual actions checklist — 2026-07

**Purpose:** Everything Cursor / the repo **cannot** do for you.  
**Use with:** `docs/ops/launch-runbook-2026-07.md`, `docs/ops/maanta-comprehensive-audit-2026-07.md`  
**Legend — Can Cursor do it?** No = you (or a human with credentials). Repo-prep = docs/scripts ready; you still execute.

| Item | Why it matters | Owner | Can Cursor do it? | Status | Exact action required | Blocking / dependency | Gate |
|---|---|---|---|---|---|---|---|
| Apply prod migrations | Code depends on Guardian, fee_reversals, admin_ops_log, etc. | Engineer / founder | **No** (repo-prep: runbooks + `make db-*`) | ⬜ | Follow `docs/ops/supabase-migrations.md` + `prod-sync-checklist-2026-07.md`: `make db-list` → `db-push-dry` → `db-push` → §5 SQL | Supabase DB password; confirm Vercel URL ref `axrrslqssmbngbataejg` | **Before pilot** |
| Confirm / fix Vercel Production env | Wrong/missing env → auth/feed/money failures | Founder + engineer | **No** (repo-prep: `vercel-production-env-checklist.md` + `src/lib/env.ts`) | ⬜ | Set all critical vars; strategy pair `clerk`/`clerk`; Clerk prod keys matched | Vercel access | **Before pilot** |
| Redeploy after `NEXT_PUBLIC_*` changes | Public env inlined at build time | Founder / engineer | **No** | ⬜ | Vercel → Redeploy Production after env edits | Env changes done | **Before pilot** |
| Verify `/api/healthz?ready=1` | Proves core rails present | Founder | **No** | ⬜ | `curl https://www.maanta.app/api/healthz?ready=1` → `"ready"` | Deploy + env | **Before pilot** |
| Wire Sentry DSN on Vercel | Blind without it | Engineer | **No** (code already integrated) | ⬜ | Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`; redeploy; throw sample on `/sentry-example-page` | Sentry org access | **Before pilot** (or dated deferral) |
| Wire PostHog tokens on Vercel | No funnel metrics | Engineer | **No** (code already integrated) | ⬜ | Set 4 PostHog vars; redeploy; confirm Live event | PostHog project 211805 | **Before pilot** (or dated deferral) |
| Configure Sentry / uptime alerts | Know when claim/verify breaks | Engineer | **No** | ⬜ | Follow `monitoring-launch-checklist.md` alert section | Sentry + uptime tool | **Before seed** |
| Confirm `handle_trial_expiry` cron on prod (E11) | Elite trial billing integrity | Engineer | **No** | ⬜ | Supabase: verify `pg_cron` job `maanta_handle_trial_expiry` or schedule equivalent | Prod DB access | **Before pilot** |
| Device golden-path QA (E2–E4) | Launch gate | Founder + engineer | **No** (checklist in `production-smoke-test.md`) | ⬜ | Two phones: claim → verify → fee; sign smoke sheet | Migrations + env done | **Before pilot** |
| Resolve M-Pesa / IntaSend access (E6) | Kenya merchants expect M-Pesa | Founder | **No** | ⬜ | Escalate IntaSend credentials **or** choose Paystack/Flutterwave and schedule integration | Provider sales / KYC | **Before pilot** (hard for Kenya) / **Before seed** |
| Stripe live cutover decision | Real card top-ups | Founder | **No** | ⬜ | Keep sandbox until ready; then live keys + `STRIPE_ENV=live` + webhook | Legal entity / bank | **Before seed** (can stay test for pilot) |
| Waitlist prod verification (E7) | Marketing gate | Founder | **No** | ⬜ | `GET /api/waitlist?healthz=1`; submit real signup; confirm Resend audience + email | Resend env on Vercel | **Before pilot** campaign |
| Agency brief handoff (M7) | Campaign cannot start | Founder | **No** | ⬜ | Send `maanta-marketing-agency-brief.md` + KPI sheet | Agency contact | **Before seed** |
| Merchant onboarding support owner (O2) | Merchants will WhatsApp someone | Founder | **No** | ⬜ | Name owner + hours; document in ops runbook | — | **Before pilot** |
| BBS Mall operator intro (O4) | Single-mall dependency | Founder | **No** | ⬜ | Send first operator email; schedule weekly report expectation | Mall contact | **Before pilot** |
| Onboard 10–30 live BBS merchants | Seed ≠ traction | Founder + agents | **No** | ⬜ | Use `/merchant/onboard` + admin approve; real wallets | M-Pesa or Stripe path | **Before seed** |
| Lawyer review of legal drafts (O5) | Cannot publish DRAFT ToS/Privacy | Founder + lawyer | **No** | ⬜ | Review `maanta-app/legal/*`; publish after entity known | Incorporation decision | **Before seed** / **Before data partner** |
| Kenya incorporation decision | Needed for contracts + lawyer | Founder | **No** | ⬜ | Decide entity; Nov Nairobi trip prep | Lawyer | **Before seed** |
| Kenya DPA cross-border basis (O6) | PII in eu-west-1 | Founder + lawyer | **No** | ⬜ | Adequacy / SCCs / consent / region move | Lawyer | **Before seed** / **Before data partner** |
| Clerk Production instance + SMS | Dev Clerk breaks browser UX | Founder / engineer | **No** | ⬜ | Production Clerk app; custom domain if needed; Kenya SMS pricing check | Clerk dashboard | **Before pilot** |
| Assemble seed data room | Investor diligence | Founder | **No** (audit doc exists) | ⬜ | Cap table, financials, this audit, LOIs, legal | Incorporation | **Before seed** |
| Pitch deck traction honesty | Avoid overclaiming seeded data | Founder | **No** | ⬜ | Separate “seeded demo” vs “live redemptions” | Live merchant metrics | **Before seed** |
| Data retention / deletion policy | Partner + DPA diligence | Founder + lawyer | **No** | ⬜ | Write policy; align with privacy policy | Lawyer | **Before data partner** |
| DPA / data-sharing agreement template | Oracle readiness | Founder + lawyer | **No** | ⬜ | Template for mall operators | Legal entity | **Before data partner** |
| Anonymization methodology for aggregates | Trust blocker | Founder + engineer | Partial (schema exists) | ⬜ | Document how exports strip PII | Retention policy | **Before data partner** |
| Security review / pen test | Partner + investor concern | Founder | **No** | ⬜ | Schedule external review | Budget | **Before data partner** |
| Cyber / E&O insurance | Counterparty trust | Founder | **No** | ⬜ | Obtain quotes | Entity | **Before data partner** |
| Mall-operator weekly report v1 | Partner value without dashboard | Founder | **No** | ⬜ | Manual CSV/PDF from admin reports for BBS | Live redemptions | **Before data partner** |
| 90-day audited redemption metrics | Proof for Oracle talks | Founder | **No** | ⬜ | Export monthly counts by node | Pilot running | **Before data partner** |
| Confirm no secrets in git | Hygiene | Engineer | Partial (audit) | ⬜ | Rotate any leaked keys; check Vercel | — | **Before pilot** |
| Playwright E2E env (optional) | CI confidence | Engineer | **No** | ⬜ | Non-prod Clerk+Supabase; enable `e2e.yml` | Budget for SMS/KES 30 | Optional |

---

## How to use this table

1. Work **Before pilot** rows first (migrations, env, redeploy, smoke, M-Pesa path, support owner).
2. Then **Before seed** (legal, incorporation, live merchant density, data room).
3. Only then **Before data partner** (DPA, retention, anonymization, 90-day metrics).

**Repo is hardened; production is not safe until the Before-pilot rows are done.**
