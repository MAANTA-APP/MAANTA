# MAANTA launch readiness tracker

Last updated: 2026-07-23 · Review weekly (Product track, Step 5). Update this
doc (and its Notion counterpart) whenever an item changes state; anything
marked **GATE** must be done before launch day. Behavior-changing decisions go
to `maanta-decisions-log.md`, not this file.

Status legend: ✅ done · 🟡 in progress / needs verification · 🔴 blocker · ⬜ not started

## Launch-critical product flows

| Flow | Status | Notes |
|---|---|---|
| Shopper browse → claim → ticket | ✅ | `claim_deal` RPC; ticket expiry = deal expiry + 15 min |
| Shopper redeem at counter (merchant verify) | ✅ | `verify_redemption` RPC: atomic verify + fee debit/arrears |
| Merchant onboarding → admin approval | ✅ | `onboard_merchant` / `activate_merchant` RPCs, agent attribution |
| Merchant wallet top-up (Stripe card) | 🟡 | Works in **sandbox**; live keys + live-mode test pending (Nov cutover decision). Top-ups now **settle arrears first**, then credit the remainder — both rails, migration `20260721120000` (§3 frozen rule); asserted by E12 tests |
| Merchant wallet top-up (M-Pesa STK / IntaSend) | 🟡 | Code + webhook ready (sandbox URL switch in `src/lib/intasend.ts`); do not assume IntaSend availability — needs account + live STK test. Inherits the settle-arrears-first top-up path |
| Refund / dispute money movements | ✅ | Stripe webhook handles refund + dispute open/close, payment_intent-keyed idempotency |
| Fraud review on unknown fee status | ✅ | Verify-anyway + admin task (migration `20260703235152`) |
| Guardian v1 verify-time fraud checks | ✅ | velocity/geofence/collusion → clear / flag / soft-block (held) / hard-block (declined); blocks move no money. Admin held-review queue + release + hard-block appeal; thresholds live-tunable via `app_config`; outcomes to PostHog. Migrations `20260721140000`/`20260722140000`/`20260722160000`; PRs #36/#37/#44/#45/#46 |
| Admin success-fee reversal (dispute uphold) | ✅ | Admin-gated `reverse_success_fee` credits merchant wallet (settle-arrears-first, one per redemption, original redemption + fee rows never modified); action on `/admin/redemptions/[id]`; `fee_reversals` audit + export view. Migration `20260722120000`, PR #42. Backs the 72h dispute-SLA uphold path |
| Elite trial expiry → grace → downgrade | ✅ | `handle_trial_expiry`; confirm the scheduled invocation runs in production |
| Frozen wireframe UI (all surfaces) | ✅ | Merged 2026-07-09 (PR #11); device-level QA pass still owed (E2–E4 below) |
| Admin panel | ✅ | Merchant approval, fraud audit, plans/trials, reporting; role self-escalation blocked. Added: customers/users list, redemption detail, Guardian held-review queue + release/appeal (PRs #40, #37) |
| Web push notifications | ✅ | Top-up received, trial tasks |
| Public waitlist capture | 🟡 | Built 2026-07-10: `/waitlist` page + stateless `POST /api/waitlist` → Resend audience contact + segment confirmation email. Needs Resend env config (API key, audience, verified from-domain) + QA before go-live. Spec: `maanta-waitlist-data-schema.md` |

## Product & engineering gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| E1 | Frozen UI reviewed, approved, merged | Engineer + founder | ✅ done | GATE | Merged 2026-07-09 (PR #11) |
| E2 | Shopper journey smoke-tested on real devices (browse → claim → redeem) | Engineer | 🟡 in progress | GATE | Rehearsal data seeded 2026-07-10 (`supabase/seed/node0_rehearsal_seed.sql`); `/demo` page indexes the seeded shopper/merchant/admin logins (§8.2). Automated golden-path RPC test (`golden_path_test.sql`) now covers claim → verify → ledger with one shared reference. Manual device (browser) pass still owed — automatable via E14 |
| E3 | Merchant journey smoke-tested (onboard → approval → post deal → verify → fee debit) | Engineer | 🟡 in progress | GATE | Includes arrears path when wallet is empty; claim→verify-anyway→arrears loop now covered by the E12 money-path SQL suite (charged / owed@balance-20 / unknown, settle-first, ledger reconciliation) in CI, not just an ad-hoc rolled-back test |
| E4 | Admin journey smoke-tested (approve, fraud/dispute review) | Engineer | 🟡 in progress | GATE | `unknown` fee status opening a `fraud_review`/high task is now asserted by `verify_redemption_money_path_test.sql`; seeded pending merchant + open merchant_override dispute ready for the admin pass |
| E5 | Stripe sandbox top-ups stable | Engineer | ✅ done | — | Multi-currency + webhook idempotency + failure log in place |
| E6 | M-Pesa STK end-to-end | Engineer | 🔴 blocked | GATE | Blocked on IntaSend API access; code path exists. Escalate credential request weekly |
| E7 | Waitlist live: `/waitlist` form → Resend audience (platform decided 2026-07-10: Resend) | Founder + engineer + AI lead | 🟡 in progress | GATE (marketing) | Built + end-to-end tested 2026-07-10 (real contact in Waitlist audience, confirmation email delivered; domain verified; properties created). **2026-07-23 prod debug:** confirmation emails weren't arriving; DB evidence (a live `claim:` rate-limit bucket but **zero** `waitlist:` buckets) proved every prod submission died *before* the rate-limit/Resend steps — i.e. at the honeypot, not env/limiter/service-role. Hardened the honeypot against browser autofill (renamed `website`→`hp_url`, off-screen + password-manager ignore attrs) so a real signup can't be silently dropped, and added `GET /api/waitlist?healthz=1` (booleans only) to confirm the 3 Resend env vars are present on the running deployment. Remaining: deploy, read healthz, verify first production signup lands in the Waitlist segment |
| E8 | Campaign-source capture (UTM → `source_campaign` property on every signup, in Resend) | Agency + AI lead | 🟡 in progress | GATE (marketing) | Form captures `utm_source/medium/campaign` → contact properties; verify end-to-end once Resend is configured |
| E9 | FX provider replaced with SLA-backed source | Engineer | ⬜ not started | GATE if non-KES live charges | Fine to defer if launch is KES-only |
| E10 | Production env vars set on Vercel + Supabase secrets audit | Engineer | ⬜ not started | GATE | Verify `STRIPE_ENV` guard behavior on deploy |
| E11 | Trial-expiry job scheduling confirmed in production Supabase | Engineer | ⬜ not started | GATE | `handle_trial_expiry` must actually run on schedule |
| E12 | Money-path + golden-path automated tests (ENGINEERING_NOTES §8.3/§8.4) | Engineer | ✅ done | — | Merged PR #32 (2026-07-21). `supabase/tests/{golden_path,verify_redemption_money_path,topup_settles_arrears}_test.sql` run in CI `db-tests` against a real Supabase: one-winner double-verify / no double charge, owed@low-balance, unknown → fraud task, settle-first, ledger reconciliation |
| E13 | Frozen-rule enforcement ratchet + Locked-Rules audit (§8.5) | Engineer | ✅ done | — | Merged PR #32. `src/lib/__tests__/frozen-ui-rules.test.ts` fails CI on money-in-amber, banned vocabulary, red failure surfaces, or red error body text; audit in `docs/skills/frozen-ui-locked-rules-audit.md`. R1 (≤1 amber/screen) stays a manual PASS-2 item |
| E14 | Browser golden-path E2E (Playwright: `/demo` → claim → verify → wallet) | Engineer | ⬜ not started | — | Own ticket, depends on a live Supabase + Clerk test env. Automates the E2 device pass and would gate CI once built; the E12 RPC golden path already proves the money invariants. Deliberately not scaffolded (an unrunnable suite is false coverage) — see decisions log. Open PR #35 |
| E15 | Pre-traffic security hardening | Engineer | ✅ done | GATE | Internal money RPCs locked to service_role, rate limits on claim/onboard/top-up, image magic-byte validation, atomic `capture_lead` (PRs #48/#50). CI `db-tests` now includes `security_hardening` + `capture_lead` suites; 11 SQL suites total on `main` |
| E16 | Product analytics (PostHog) instrumented | Engineer | 🟡 in progress | — | Client + funnel instrumentation merged (PRs #45, #47) — deal/claim/top-up/onboard/webhook events, EU cloud project 211805. **No-op until the 4 PostHog env vars are set on Vercel** (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`); safe (emits nothing) until then |

## Marketing & growth gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| M1 | Shopper + merchant landing pages live | Agency + engineer | ⬜ not started | GATE (campaign) | Separate CTAs; segment set at the form, see waitlist spec |
| M2 | Email platform configured with segments + automations | Agency + AI lead | ⬜ not started | GATE (campaign) | `shopper` / `merchant` / `mall_operator` from signup |
| M3 | Welcome sequences written and activated | Agency | ⬜ not started | GATE (campaign) | Drafts in the three sequence docs |
| M4 | 4-week social content calendar | Agency | ⬜ not started | GATE (campaign) | One-month pre-launch push |
| M5 | Creative approval workflow agreed | Agency + founder | ⬜ not started | — | |
| M6 | Weekly KPI review format established | Agency + AI lead | ⬜ not started | — | KPI set in agency brief |
| M7 | Agency brief handed off | Founder | ⬜ not started | GATE (campaign) | `maanta-marketing-agency-brief.md` + KPI sheet |

## Operations & legal gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| O1 | Founder/admin testing plan documented | Founder | ✅ done | — | In `maanta-launch-ops-runbook.md`, incl. family-assisted testing |
| O2 | Merchant onboarding support process defined | Founder + AI lead | ⬜ not started | GATE | Who answers merchant questions during onboarding week |
| O3 | Dispute + on-ground agent escalation path documented | AI lead | ✅ done | GATE | Verify-anyway routing logged in `maanta-decisions-log.md`; paths in the runbook. **72h dispute-resolution SLA** (founder ruling 2026-07-22): admin resolves within 72h — uphold → redemption reversed + KES 30 credited back via fee-reversal; reject → fee stands. Shopper copy fixed 24h→72h (PR #51); SOP in `docs/skills/redemption-disputes.md` |
| O4 | BBS Mall reporting expectations + operator comms | Founder | ⬜ not started | — | |
| O5 | Legal docs lawyer-reviewed and published | Founder + lawyer | 🔴 blocked | GATE | Drafts in `maanta-app/legal/`; blocked on incorporation decisions (Nov Nairobi trip) |
| O6 | Kenya DPA cross-border data decision (Supabase `eu-west-1`) | Founder + lawyer | ⬜ not started | GATE | Adequacy/contractual basis or region migration |

## Blockers

- E6 (IntaSend API access) — escalate weekly.
- O5 (legal review) — blocked on incorporation; schedule lawyer ahead of the
  November trip so the trip signs decisions rather than starting them.

## Post-launch deferrals

- Additional malls / nodes beyond BBS Mall
- Mall-operator reporting dashboard
- Deal drafts, self-serve Elite payment rail (deferred from PR #11)
