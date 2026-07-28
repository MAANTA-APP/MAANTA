# Data governance gaps — honest baseline (2026-07)

**Status:** Documentation only. This does **not** create legal compliance.  
**Audience:** Founder, lawyer, future data partners  
**Related:** `docs/ops/maanta-comprehensive-audit-2026-07.md` §5–§6 · `maanta-app/legal/`

---

## What the repo already enforces (technical)

| Control | Where | Notes |
|---|---|---|
| RLS + role guards | Migrations + `src/lib/{admin,merchant,agent}.ts` | App roles in Postgres |
| Money RPCs service_role-only | Security hardening migrations | Claim/verify via API + RPC |
| Admin ops audit log | `admin_ops_log` | Admin actions |
| Fee reversal notes | RPC + route | Required non-empty note |
| Rate limits | `check_rate_limit` | Claim / OTP / top-up / waitlist |
| Service role server-only | `SUPABASE_SERVICE_ROLE_KEY` never `NEXT_PUBLIC_*` | Do not expose in client bundles |
| Healthz never returns secret values | `src/lib/health.ts` | Booleans only |

---

## What is still missing (do not claim otherwise)

| Gap | Why it matters | Owner |
|---|---|---|
| Lawyer-reviewed Privacy / ToS | Launch + seed | Founder + lawyer |
| Documented retention / deletion schedule | Partner diligence | Founder + lawyer |
| Subject access / deletion request workflow | Kenya DPA / consumer trust | Founder |
| Cross-border transfer lawful basis (eu-west-1) | O6 tracker | Founder + lawyer |
| Anonymization method for aggregate exports | Oracle readiness | Founder + engineer |
| Data Processing Agreement template | Mall / council partners | Lawyer |
| Partner export API | Product not built | Engineer (later) |
| Cookie / analytics consent banner | PostHog/Sentry when live | Engineer + lawyer |
| Incident response runbook + breach SLA | Ops maturity | Founder |
| Separate `founder` vs `admin` DB role | Fee-reversal segregation | Engineer (when co-founder needs it) |

---

## Service-role usage (operator note)

- Browse/SSR uses service role with **browse views / public predicates** — correct for public feed today; increases blast radius if a filter bug ships.
- Prefer keeping money mutations behind SECURITY DEFINER RPCs (already done).
- Never paste service role keys into client code, screenshots, or chat logs.

## Data export sensitivity

Until a retention + anonymization policy exists:

- Do **not** send raw `redemptions` / phone / GPS dumps to mall operators or investors.
- Prefer aggregate counts from `/admin/reports` or SQL `count(*)` by day/node.
- Treat waitlist Resend contacts as marketing PII under Resend’s DPA + your privacy policy (once published).

## Partner-data readiness

See Oracle checklist in the comprehensive audit. **Not ready.** Sequence: live density → weekly mall report → DPA → aggregate export → partner talks.
