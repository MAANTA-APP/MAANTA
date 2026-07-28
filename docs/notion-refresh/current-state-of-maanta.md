# Current State of MAANTA

**Status:** Canonical snapshot · **Last verified:** 2026-07-28 · **Audience:** founder, operator, engineer, advisor  
**Evidence bases:** `docs/maanta-launch-readiness-tracker.md`, Build OS Notion status (through 2026-07-27), `docs/skills/launch-audit-2026-07-24.md`, `docs/ops/auth-strategies.md`, `docs/skills/supabase-prod-email-auth.md`

## Purpose

A single “where we actually are” page. Prefer dates and evidence over slogans.

## Current reality (one paragraph)

MAANTA is in **pre-launch / Node 0 rehearsal**. The product loop (browse → claim → verify → KES 30 fee or arrears) is **implemented and CI-tested in the repo**. Production (`www.maanta.app` / Vercel + Supabase `axrrslqssmbngbataejg`) is **partially wired**: observability env (Sentry + PostHog) was confirmed on Vercel (2026-07-27), but **migrations/seeds, auth strategy cutover, money rails, and legal** remain human-owned gates. Marketplace density on prod may be **seeded** until real merchants are activated.

## Stage label

| Label | Meaning now |
|---|---|
| Stage | **Build — Node 0 repo-complete for pre-10k design**; BBS rehearsal gated on prod apply + device smoke; public shopper launch gated on money rails, legal/DPA, ops SLAs |
| Launch node | BBS Mall only (expansion is deliberate, not automatic) |
| Primary app | Next.js PWA at maanta.app / www.maanta.app |

## What is working (repo / CI)

| Area | Evidence |
|---|---|
| Claim → verify → fee/arrears | SQL suites: `golden_path`, `verify_redemption_money_path`, `topup_settles_arrears` |
| Guardian v1 | Migrations + `guardian_*` SQL tests; admin hold/release/appeal UI |
| Fee reversal | `reverse_success_fee` + note required; admin UI |
| Shopper UX | Feed rails, Browse map/list, YOU PAY pricing, Claude design system work on `main` |
| Security hardening | Rate limits, service_role money RPCs, capture_lead atomicity — CI covered |
| Waitlist | `/waitlist` + Resend proxy (prod signup QA still a gate) |
| Health | `GET /api/healthz` (+ ready/probe variants for operators) |

## What is working (production — confirmed / partial)

| Item | Status | Notes |
|---|---|---|
| Vercel deploy from `main` | Working | Domain Cloudflare → Vercel |
| Sentry + PostHog env on Vercel | Confirmed 2026-07-27 | Instrumentation no-ops without keys; keys reported wired |
| Resend waitlist delivery | Partially verified historically | Tracker E7 still requires ongoing prod signup confirmation |
| Auth | **Strategy-dependent** | Launch target = Clerk; rehearsal may use Supabase email OTP (`MAANTA_AUTH_STRATEGY`) — see Auth page |
| Live deal inventory | Uncertain without operator check | 100-deal seed may or may not be applied on prod |

## What is not yet ready

- Real-device golden path at BBS (2 phones) as a **signed-off** gate.
- IntaSend M-Pesa live credentials (tracker **E6 blocker**).
- Stripe **live** keys / live-mode top-up proof (sandbox OK).
- Lawyer-reviewed published legal docs (**O5 blocker** — incorporation).
- Kenya DPA / eu-west-1 cross-border basis (**O6**).
- Treating CBD Galleria / Westlands Hub as live launch nodes (they are **synthetic rehearsal nodes** in the registry/seed).

## Lenses (short)

| Lens | Verdict |
|---|---|
| Product reality | Core loop real in code; density may be staged |
| Technical readiness | Strong pre-10k repo posture; prod apply incomplete |
| Operational readiness | Agent rota + templates exist; support SLAs partially defined |
| GTM readiness | Waitlist/agency campaign not fully live |
| Merchant readiness | Onboarding/wallet/verify built; live top-up rails incomplete |
| Launch readiness | Not launch-ready for open shoppers |
| Investor readiness | Credible if staged vs real is explicit |
| Partnership readiness | MoU/term sheet drafts exist; unsigned |
| Data governance | Draft privacy only; DPA decision open |

## Risks

- Status drift between Notion Build OS changelog and this page.
- Auth docs disagreeing (Clerk-only vs dual strategy).
- Seed merchants misread as PMF.

## Dependencies

- Human prod apply (`make db-prod-fixup` / migrations runbook).
- Founder time for device rehearsal and merchant activation.
- External: IntaSend, lawyer, mall MoU signature.

## Next actions (ordered)

1. Confirm auth strategy currently set on Vercel Production and document it on **Auth and Identity**.
2. Run / verify prod migrations + seed; record counts on **Launch Readiness**.
3. Complete 2-phone golden path; file result on Launch Readiness.
4. Escalate IntaSend weekly; keep Stripe sandbox until cutover decision.
5. Schedule legal/incorporation work ahead of Nairobi trip — do not wait to start.

## Related pages

- What Is Real vs Staged vs Planned
- Launch Readiness
- Auth and Identity
- Observability and Production Verification
- Risks and Hard Truths
