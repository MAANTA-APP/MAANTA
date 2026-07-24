# MAANTA launch-ability audit (2026-07-24)

**Scope:** Evidence-based, repo-only answer to "are we launch-ready?" for two
horizons — the **BBS Mall Node 0 rehearsal** (merchants + controlled shoppers on
the frozen UI) and a **real shopper-facing launch**.

**Method & honesty boundary:** grounded strictly in the MAANTA repo, its tests,
and `docs/`. **No migrations were run and no deployment was touched.** Every
deployment-side fact (Vercel env vars, which Supabase project is actually live,
Clerk dashboard wiring, whether migrations are applied to prod) is treated as
**unknown unless a repo file or doc encodes it.** Where a doc asserts a prod
fact, it is cited as a doc claim, not verified truth.

**Primary sources:** `docs/skills/prod-handoff-security-audit-2026-07-23.md`,
`docs/skills/security-hardening.md`, `docs/skills/ui-walkthrough-roles.md`
(the 4-role acceptance walkthrough), `docs/maanta-launch-readiness-tracker.md`,
`docs/maanta-decisions-log.md`, `docs/maanta-node0-rehearsal-checklist.md`,
`docs/maanta-guardian-v1.md`, `.github/workflows/ci.yml`, and the code under
`maanta-app/`.

**Repo baseline confirmed this session:** 60 migration files in
`maanta-app/supabase/migrations/`; 14 SQL regression suites in
`supabase/tests/`; 15 vitest files under `src/**/__tests__/`; CI runs
lint + typecheck + vitest + build **and** a `db-tests` job that boots Supabase,
applies every migration, and runs all 14 SQL suites.

---

## ⚠️ Cross-cutting risk found this session: which Supabase project is prod is itself in drift

The docs disagree on the live database, and this gates almost everything below:

| Doc (date) | Names as production |
|---|---|
| `ui-walkthrough-roles.md` (07-22) | **`axrrslqssmbngbataejg`** (MAANTA-APP org, Clerk `cheerful-sailfish-3`) |
| `prod-handoff-security-audit-2026-07-23.md` (07-23) | **`axrrslqssmbngbataejg`** LIVE; calls `vcrfqsevompqjazbwzyh` "abandoned (old org)" |
| `security-hardening.md` ops checklist (07-23) | Says apply migrations to **`vcrfqsevompqjazbwzyh`** |
| `maanta-node0-rehearsal-checklist.md` (07-20) | **`vcrfqsevompqjazbwzyh`** (eu-west-1) |

The repo **cannot** resolve this — the answer lives in Vercel's
`NEXT_PUBLIC_SUPABASE_URL`. **This is the single most important human check
before the rehearsal**, because the "hardening / money / Guardian" migrations
must be applied to whichever project Vercel actually points at, and the 07-20
remote-parity validation in `security-hardening.md` was done against
`vcrfqsevompqjazbwzyh`. Treat "backend is hardened in prod" as **unverified**
until this is pinned.

---

# Section 1 — Launch audit checklist

Five tracks. IDs are used again in Section 2 for the ✅/⚠️/❌ verdicts.

### Track 1 — Product & flows (shopper / merchant / admin / agent)
- **P1** Shopper browse → claim → ticket (YOU PAY carried tile→detail→ticket, code + expiry)
- **P2** Merchant redeem: two-step preflight (fee disclosure) → Confirm → KES 30 debit
- **P3** Verify-anyway at empty/low wallet → KES 30 recorded as arrears, shopper still "Verified"
- **P4** Guardian v1 at verify time (clear / flag / soft-block held / hard-block declined + appeal)
- **P5** Merchant onboarding → admin approval → **KES 300 Node 0 opening credit** at activation
- **P6** Zero-balance gate (no balance ⇒ can't create deals)
- **P7** Dispute → admin review → **success-fee reversal** (72h SLA uphold path)
- **P8** Merchant top-up (Stripe card, sandbox) with **settle-arrears-first**
- **P9** Merchant top-up (M-Pesa STK / IntaSend)
- **P10** Elite trial (30d) → 7d grace → downgrade
- **P11** Frozen UI money/colour/vocabulary rules (R1–R7) across all surfaces
- **P12** **Success-takeover "amount to COLLECT FROM SHOPPER" (YOU PAY) — recorded drift**
- **P13** Agent-assisted onboarding attribution (leads → merchant credit)

### Track 2 — Technical infrastructure (backend / frontend / tests / monitoring)
- **T1** Money-path RPCs (`claim_deal`, `verify_redemption`, fee debit/arrears) — atomic
- **T2** Security hardening (revoke `authenticated` writes, internal RPC lockdown, rate limits, admin ops log)
- **T3** Migrations applied to the **production** Supabase project
- **T4** SQL regression suites (14) run in CI `db-tests`
- **T5** Vitest unit/route suite + frozen-UI ratchet in CI
- **T6** CI gates: lint / typecheck / test / build
- **T7** Browser golden-path E2E (Playwright, PR #35)
- **T8** Sentry error monitoring (client + server + edge)
- **T9** Multi-currency top-up + FX conversion (`toKes`, live rate provider)
- **T10** Trial-expiry job scheduled in production Supabase
- **T11** Auth: Clerk third-party auth wired to Supabase RLS (`current_user_id()`)
- **T12** Production env vars audited/set on Vercel + Supabase secrets

### Track 3 — Operational readiness (runbooks / training / pilot logistics)
- **O1** Node 0 rehearsal script (5-account walkthrough A–F)
- **O2** Rehearsal seed data (`node0_rehearsal_seed.sql`) + `/demo` login index
- **O3** Login/OTP path for rehearsal (email OTP; custom SMTP for volume)
- **O4** Dispute + on-ground agent escalation SOP (72h SLA)
- **O5** Merchant onboarding support process (who answers merchants during onboarding week)
- **O6** BBS Mall operator reporting expectations
- **O7** On-site what3words capture (replace placeholder addresses)
- **O8** Founder/admin testing plan (family-assisted)

### Track 4 — Analytics & measurement (events / dashboards / pilot metrics)
- **A1** PostHog client + funnel instrumentation (deal/claim/top-up/onboard/webhook)
- **A2** Guardian outcome instrumentation (`guardian_outcome` per verify) + dashboard spec
- **A3** PostHog env vars set on Vercel (analytics is no-op until then)
- **A4** Webhook-failure alerting (`payment_webhook_failures` log)
- **A5** Campaign-source / UTM capture on signups (Resend contact properties)
- **A6** Pilot KPI review format

### Track 5 — Legal & governance (contracts / fee & dispute rules / privacy)
- **L1** KES 30 success fee rule (frozen, coded)
- **L2** 72h dispute-resolution SLA + fee-reversal governance
- **L3** Node 0 opening credit as promotional credit (not a collection — manual-billing ban intact)
- **L4** MoU / Term Sheet / Pilot Pack governance synced to code
- **L5** Legal docs lawyer-reviewed & published (blocked on incorporation)
- **L6** Kenya DPA cross-border data basis (Supabase eu-west-1)
- **L7** Stripe-Kenya payouts / payment-processor final choice
- **L8** FX disclosure for non-KES card charges

---

# Section 2 — Status by item

Legend: ✅ verified in repo/tests · ⚠️ partially done (in repo, not confirmed in prod, or has a known gap) · ❌ not done / decision pending.
Task-type tag on every ⚠️/❌: **[eng]** repo code/test, **[deploy]** dashboard/config, **[founder/legal]** human decision.

## Track 1 — Product & flows

| ID | Verdict | Evidence / what's missing |
|---|---|---|
| P1 | ✅ | `claim_deal` snapshots `redemptions.amount_kes` = YOU PAY; live shopper fetch in `ui-walkthrough-roles.md` shows KES 572 identical tile→detail→ticket, code `981101`, expiry = deal + 15 min. Pricing single-sourced in `src/lib/pricing.ts` (+ `pricing.test.ts`). |
| P2 | ✅ | Two-step redeem (`redeem-keypad.tsx:96-129`): preflight discloses fee & "charges nothing"; Confirm debits KES 30 via `verify_redemption`. Golden path asserted by `golden_path_test.sql` + `verify_redemption_money_path_test.sql`. |
| P3 | ✅ | Verify-anyway: Confirm never disabled by wallet state; underfunded → `owed`/arrears (`redemption-result.tsx` owed branch). Asserted owed@balance-20 in `verify_redemption_money_path_test.sql`; frozen rule in decisions log 2026-07-03/07-18. |
| P4 | ✅ | Guardian v1 in `verify_redemption` (`guardian_v1.sql`), live-tunable thresholds (`guardian_thresholds_config.sql`), hard-block appeal (`guardian_hard_block_appeal.sql`). 3 SQL suites green in CI. Admin held-review/appeal UI present. |
| P5 | ✅ | `activate_merchant` grants KES 300 (`node0_opening_credit_on_activation.sql`), config-driven (`app_config`), cap 100, idempotent; `node0_opening_credit_test.sql` A–D. Rehearsal step D. |
| P6 | ✅ | DB trigger + `/api/deals` 402 (`zero_balance_gate_deals.sql`, decisions 2026-07-03). **Affordance concern (M1):** wizard never receives `balance`, so block shows only at Publish as plain text with no top-up CTA — cosmetic, not a rule breach. |
| P7 | ✅ | `reverse_success_fee` admin-gated, one-per-redemption, settle-arrears-first, original rows intact (`admin_fee_reversal_wallet_credit.sql`, `fee_reversal_test.sql`, PR #42). 72h SLA in decisions log 2026-07-22, SOP `docs/skills/redemption-disputes.md`. |
| P8 | ⚠️ **[deploy]** | Code + settle-arrears-first path complete and green in **sandbox** (`topup_settles_arrears_test.sql`, E5 done). **Missing:** live-mode key test, and the FX-currency path is only reachable by API (`topup-flow.tsx` sends KES only) — no real non-KES top-up has been run. |
| P9 | ❌ **[deploy/founder]** | STK + webhook code exists (`src/lib/intasend.ts`, sandbox URL switch) but **blocked on IntaSend account access** (tracker E6, `🔴`). Not exercisable from repo; do-not-assume-availability is a frozen rule. |
| P10 | ⚠️ **[deploy]** | `handle_trial_expiry` implemented (`20260701110443/111223`). **Missing:** confirmation that the scheduled invocation actually runs in prod Supabase (tracker E11, `⬜`). |
| P11 | ✅ | 4-role walkthrough: **no FAIL-level Locked-Rule violations**; R1–R7 hold (money is ink never amber, S5 card, closed vocabulary). CI ratchet `frozen-ui-rules.test.ts` fails on money-in-amber/banned vocab/red error bodies. Residual findings are low-sev polish (see doc). |
| P12 | ⚠️ **[eng] — the recorded behaviour drift** | The M4 success takeover (`redemption-result.tsx`) shows "Verified" + KES 30 fee (charged/arrears) + wallet balance + reference ID, but **never shows the cashier how much to COLLECT FROM SHOPPER** — the `amount_kes` / YOU PAY figure is snapshotted at claim yet not surfaced on the merchant success screen. The component's props don't even accept it. Not fixed. Repo-fixable (thread `amountKes` from verify response into `RedemptionResult`); needs a founder nod as a frozen-UI copy change. |
| P13 | ⚠️ **[eng/founder]** | Agent attribution unreachable (G1): `api/merchants/onboard/route.ts:48` hardcodes `p_onboarding_agent_id: null`, so every onboarding records `self_serve` despite full DB support. Leads (`leads.agent_id`) never FK-link to the resulting merchant (G4 partially closed 07-22). Needs UI + trust-boundary decision. |

## Track 2 — Technical infrastructure

| ID | Verdict | Evidence / what's missing |
|---|---|---|
| T1 | ✅ | Atomic money RPCs; one-winner double-verify / no-double-charge proven in `golden_path_test.sql` + `verify_redemption_money_path_test.sql`; ledger via `record_merchant_ledger_entry`. |
| T2 | ✅ (in repo) | PRs #59–#61: revoke `authenticated` INSERT/UPDATE/DELETE on merchants/deals/redemptions (`20260723120000`), internal money-RPC lockdown (`20260722180000`), rate limits, `admin_ops_log` (`20260723140000`). SQL suites: `security_hardening`, `revoke_authenticated_writes_core_tables`, `browse_views`, `admin_ops_log`. |
| T3 | ⚠️ **[deploy]** | **This is the key unverified item.** The 6 hardening migrations + all 60 exist in repo; the 07-20 remote-parity check applied the *earlier* chain to `vcrfqsevompqjazbwzyh`. Whether **the six #48–#61 migrations are applied to whatever project Vercel points at** is unconfirmed and cannot be checked from repo. Compounded by the project-identity drift above. |
| T4 | ✅ | `.github/workflows/ci.yml` `db-tests`: `supabase start` applies all migrations, then runs all 14 `supabase/tests/*.sql` with `ON_ERROR_STOP=1`. |
| T5 | ✅ | 15 vitest files (pricing, currency, frozen-ui-rules, merchant-ledger, waitlist, image-bytes, intasend-guard, analytics, stripe webhook route, boosts routes, …); walkthrough reports 40/40 green. |
| T6 | ✅ | CI `ci` job: lint → typecheck → test → build (build uses placeholder env; real values are deploy-side). |
| T7 | ❌ **[eng/deploy]** | No Playwright config / `e2e/` / npm script on `main`; PR #35 open, unmerged. Deliberately not scaffolded (unrunnable = false coverage). RPC golden path already covers money invariants. Needs a live Supabase + Clerk test env. |
| T8 | ✅ (code) ⚠️ (prod) | Sentry wired: `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`, `src/app/global-error.tsx`, `next.config.mjs`. **No-op until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` set on Vercel** — [deploy]. |
| T9 | ⚠️ **[eng/deploy]** | `src/lib/currency.ts` `toKes()` + `currency.test.ts` cover conversion; live provider is keyless `open.er-api.com` with static fallback. **Not run in a real env**, and a paid/SLA provider is a pending decision (E9). Fine to defer if launch is KES-only. |
| T10 | ⚠️ **[deploy]** | Same as P10 — job exists; prod schedule unconfirmed (E11). |
| T11 | ⚠️ **[deploy]** | Clerk-as-third-party-auth coded end-to-end (`20260720140000_clerk_third_party_auth.sql`, `src/lib/auth.ts`, middleware, providers) — see decisions log 2026-07-20. **Requires manual Clerk + Supabase dashboard wiring before it works**; open follow-ups: Kenya SMS deliverability, backfill legacy `auth_uid`→`clerk_user_id`. |
| T12 | ❌ **[deploy]** | Tracker E10 `⬜`. No prod env var is confirmed set (Supabase URL/keys, Clerk, Stripe `STRIPE_ENV` guard, IntaSend, Sentry, PostHog×4, W3W, `NEXT_PUBLIC_APP_URL`). Code fails **closed** if unset (Stripe 503, W3W 503, service-role throws), so silent-wrong-behaviour risk is low, but nothing is proven present. |

## Track 3 — Operational readiness

| ID | Verdict | Evidence / what's missing |
|---|---|---|
| O1 | ✅ | `maanta-node0-rehearsal-checklist.md` — full A–F script, ~30 min, 5 accounts. |
| O2 | ✅ | `supabase/seed/node0_rehearsal_seed.sql` (idempotent) + `/demo` index (`src/app/demo/page.tsx`); live OTP ticket `431977`. |
| O3 | ⚠️ **[deploy]** | Email OTP only (phone SMS not configured); Supabase built-in SMTP ~2 emails/hr will stall a 5-account run. **Custom SMTP (Resend) is a one-time dashboard task, not yet done.** |
| O4 | ✅ | O3 gate done; SOP in `docs/skills/redemption-disputes.md`; 72h SLA in runbook + decisions log. |
| O5 | ❌ **[founder]** | Tracker O2 `⬜` — no defined owner for merchant questions during onboarding week. |
| O6 | ❌ **[founder]** | Tracker O4 `⬜` — BBS operator reporting expectations not documented. |
| O7 | ⚠️ **[founder/on-site]** | Seeded what3words addresses are **placeholders**; geofence checks are meaningless until real ///addresses captured on-site. Guardian geofence bands depend on this. |
| O8 | ✅ | Founder/admin testing plan (family-assisted) in `maanta-launch-ops-runbook.md` (O1 done). |

## Track 4 — Analytics & measurement

| ID | Verdict | Evidence / what's missing |
|---|---|---|
| A1 | ✅ (code) ⚠️ (prod) | Client + funnel instrumentation merged (PRs #45/#47), `src/components/posthog-provider.tsx`, EU project 211805. No-op until env set. |
| A2 | ✅ (code) ⚠️ (prod) | `captureGuardianOutcome` fires per verify (`src/lib/analytics.ts` + `analytics.test.ts`), best-effort/non-blocking; dashboard spec in `maanta-guardian-v1.md` §8. Live dashboard provisioning pending. |
| A3 | ❌ **[deploy]** | 4 PostHog env vars (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`) not confirmed on Vercel — analytics emits nothing until set (E16 `🟡`). |
| A4 | ✅ | `payment_webhook_failures` log path in `webhooks/stripe/route.ts` (+ route test); missing webhook secret → 401 + failure row (`add_multicurrency_and_webhook_failure_log.sql`). |
| A5 | ⚠️ **[deploy]** | Form captures `utm_source/medium/campaign` → Resend contact properties; end-to-end unverified until Resend configured (E8 `🟡`). |
| A6 | ❌ **[founder]** | Weekly KPI review format not established (M6 `⬜`); KPI set exists in agency brief. |

## Track 5 — Legal & governance

| ID | Verdict | Evidence / what's missing |
|---|---|---|
| L1 | ✅ | KES 30 pin coded (`harden_success_fee_amount.sql`, `30.00` fallback); explicitly NOT under review (decisions log). |
| L2 | ✅ | 72h SLA + fee-reversal governance in decisions log 2026-07-22; audit table `fee_reversals` + export view; shopper copy fixed 24h→72h (PR #51). |
| L3 | ✅ | KES 300 credit classed as promotional (same class as free Elite trial), not a collection — manual-billing ban intact (decisions log 2026-07-16). |
| L4 | ✅ (per docs) | Governance docs reported largely synced to code (task context; tracker/decisions log mirrors). Notion is authoritative — flag, don't silently reconcile. |
| L5 | ❌ **[founder/legal]** | Drafts in `maanta-app/legal/` (unpublished, not lawyer-reviewed); **blocked on Nov 2026 Nairobi incorporation** (O5 `🔴`). |
| L6 | ❌ **[founder/legal]** | Kenya DPA cross-border basis for Supabase eu-west-1 undecided (O6 `⬜`); flagged in `legal/privacy-policy.md`. |
| L7 | ❌ **[founder/legal]** | Payment-processor final choice / Stripe-Kenya payouts pending Nov 2026 (`legal/payment-processor-comparison.md`). |
| L8 | ❌ **[founder/legal]** | FX-source disclosure for non-KES charges undecided (E9 / pending decisions). Only bites if non-KES card charges go live. |

---

# Section 3 — Launch ability summary

## BBS rehearsal (merchants + controlled shoppers, frozen UI)

**Verdict: essentially ready — the *code and UI* can run the rehearsal today, but it is gated on a handful of one-time deployment tasks, none of which require new engineering.** The golden path (browse → claim → verify → fee/arrears → wallet), Guardian, opening credit, arrears, and fee-reversal are all implemented and green in CI, and the frozen UI has no FAIL-level violations. The rehearsal script and seed already exist.

**Blockers that must be resolved before the rehearsal (all human/deploy):**
1. **Pin the live Supabase project** (`axrrslqssmbngbataejg` vs `vcrfqsevompqjazbwzyh`) from Vercel `NEXT_PUBLIC_SUPABASE_URL`, and **fix the doc drift** so the rehearsal seeds/tests the right DB. *(gates 2–3)*
2. **Apply the six #48–#61 migrations** to that project and run the audit SQL subset (T3). Without this the redeem/fee/Guardian paths may not match the tested behaviour.
3. **Clerk ↔ Supabase dashboard wiring** (T11) — auth does not work until Clerk enables phone+email + the Supabase integration and Supabase adds Clerk as a third-party provider.
4. **Custom SMTP in Supabase Auth** (O3) — the built-in ~2 emails/hr will stall a 5-account email-OTP run.
5. **Seed applied** to the live project and deal windows fresh (O2).

**Nice-to-have but not rehearsal-blocking:** Sentry/PostHog env (helpful to observe the run), the P12 "collect from shopper" copy fix (merchants can read the amount off the shopper's ticket in the meantime), real what3words addresses (only needed to exercise geofence disputes for real — the rehearsal uses a pre-seeded dispute).

## Shopper launch (open beyond the rehearsal)

**Verdict: NOT ready.** The product core is sound, but opening to real shoppers/merchants at scale adds deployment, ops, and legal gates that are open by design.

**Additional blockers on top of the rehearsal list:**
- **[deploy]** Full Vercel env audit (T12/E10): Stripe `STRIPE_ENV` guard, IntaSend, Sentry×2, PostHog×4, W3W, `NEXT_PUBLIC_APP_URL=https://maanta.app`.
- **[deploy]** Trial-expiry job scheduling confirmed in prod (T10/E11) — otherwise Elite trials never downgrade.
- **[deploy/founder]** M-Pesa STK live (P9/E6) — blocked on IntaSend access; a KES pilot that can't take M-Pesa top-ups is a real UX gap for merchants.
- **[deploy]** Sentry + PostHog actually receiving events (T8/A3) — flying blind on errors/funnel otherwise.
- **[eng]** Resolve the auth "split-brain": backfill legacy `auth_uid` users to `clerk_user_id`; confirm Clerk SMS deliverability/cost for Kenya (T11 follow-ups).
- **[eng/founder]** P12 success-takeover "collect from shopper" fix and P13 agent attribution (only a launch blocker if agents onboard merchants at launch).
- **[founder/legal]** L5 lawyer-reviewed & published legal docs, **L6 Kenya DPA cross-border data basis** (both GATE), L7 payment-processor/Stripe-Kenya payouts, L8 FX disclosure if non-KES charges go live.
- **[deploy]** Real (test-mode) non-KES top-up + ledger verification (P8/T9) before advertising card top-ups; live FX provider (E9) before real non-KES charges.
- **[eng/deploy]** Browser E2E gating (T7/PR #35) — recommended before opening the funnel.

---

# Section 4 — Claude Code worklist (repo-level tasks I can execute)

These need no dashboard, no real money, no founder ruling to *implement* (some
want a founder sign-off before merge because they touch frozen-UI copy):

- **P12 — surface "COLLECT FROM SHOPPER" on the success takeover.** Thread the
  claimed `amount_kes` (YOU PAY) from the verify response into `RedemptionResult`
  and render it as the cashier's collect amount (ink, tabular, above the KES 30
  fee line). Add a frozen-UI-rules assertion + a unit test. *(Founder sign-off:
  it's a frozen-UI copy addition.)*
- **T7 / PR #35 — Playwright golden-path suite** `/demo → claim → verify → wallet`.
  I can author/rebase the suite and the CI job; it stays skipped until a live
  Supabase + Clerk test env exists (the human decision), so it isn't false coverage.
- **P13 / G1 — agent attribution plumbing.** Capture the agent in `onboard-wizard.tsx`
  and stop hardcoding `p_onboarding_agent_id: null` in `api/merchants/onboard/route.ts:48`;
  FK-link `leads.agent_id` → merchant (G4). *(Needs the product/trust-boundary
  decision first; I can implement once the "who may act as an agent" rule is set.)*
- **M1 affordance — zero-balance top-up CTA.** Pass `balance` into the deal wizard
  and replace the bare Publish-time refusal with an actionable top-up CTA.
- **A1 event dispatch shim / self-check** — a repo-level `GET` healthz-style
  assertion that the PostHog/Sentry env booleans are present (mirroring the
  existing `/api/waitlist?healthz=1` pattern) so a human can verify prod wiring
  without exposing secrets.
- **Doc reconciliation (durable artifact):** open a one-line fix PR aligning
  `security-hardening.md` / `node0-rehearsal-checklist.md` to the single correct
  prod Supabase ref **once the human confirms which it is** (I can stage the diff
  now with a `TBD` marker).
- **T9 — FX provider abstraction.** Refactor `src/lib/currency.ts` behind a
  provider interface so swapping keyless `open.er-api.com` for an SLA-backed
  source (E9) is a config change, with expanded `currency.test.ts` coverage.
- **Keep the SQL/vitest suites current** for any of the above; CI already gates them.

**I cannot, from the repo:** apply migrations to prod, set env vars, wire Clerk/
Supabase dashboards, run real or sandbox top-ups against a live deployment,
provision Sentry/PostHog projects, or make legal/pricing rulings.

---

# Section 5 — Human-only runbook

Grouped for a human operator. Fuller step-by-step versions live in
`docs/skills/prod-handoff-security-audit-2026-07-23.md` §Human runbook.

### A. Production DB / migrations
1. **Pin the live project:** read Vercel `NEXT_PUBLIC_SUPABASE_URL` → note the ref. Resolve the `axrrslqssmbngbataejg` vs `vcrfqsevompqjazbwzyh` drift and correct the two docs.
2. Check applied versions: `SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '20260722%' OR version LIKE '20260723%' ORDER BY version;`
3. Apply the six #48–#61 migrations in filename order (see the handoff's table) via `supabase db push` or the SQL editor.
4. Spot-check grants: `has_table_privilege('authenticated','public.merchants','UPDATE')` → **false**; `to_regclass('public.admin_ops_log')` → **not null**.
5. Run the audit SQL subset (`security_hardening`, `capture_lead`, `revoke_authenticated_writes_core_tables`, `browse_views`, `admin_ops_log`), then confirm zero `__test%` residue.

### B. Env vars & deploy (Vercel Production)
1. **Auth:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
2. `NEXT_PUBLIC_APP_URL=https://maanta.app` (else Stripe checkout 503 — fail-closed by design).
3. **Stripe (pre-launch):** `sk_test_*`, `STRIPE_WEBHOOK_SECRET`, leave `STRIPE_ENV` non-`live`. (Setting `STRIPE_ENV=live` with a test key **hard-fails** by design — and vice-versa.)
4. **IntaSend:** keys + `INTASEND_WEBHOOK_SECRET`, `INTASEND_ENV` matching key type.
5. **Monitoring/analytics:** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`; all 4 PostHog vars; `W3W_API_KEY`.
6. **Clerk ↔ Supabase dashboard wiring** (per `docs/skills/clerk-auth.md`): Clerk enable phone+email + Supabase integration (token carries `role: authenticated`); Supabase add Clerk as third-party provider. Then backfill legacy `auth_uid`→`clerk_user_id`.
7. **Supabase Auth custom SMTP** (Resend) so OTP emails don't rate-limit.
8. Redeploy `main`; smoke: sign in → top-up page loads → Stripe test checkout starts → an admin action writes an `admin_ops_log` row → a test error reaches Sentry.

### C. FX test (only if marketing non-KES card top-ups)
1. Stripe **test** mode. Sign in as a `can_topup` merchant.
2. `POST /api/topup/stripe {"amount":1,"currency":"USD"}` (UI defaults to KES; the currency path is API-only).
3. Complete with `4242…`; confirm redirect `.../merchant/topup?stripe=success`.
4. Verify `merchant_transactions`: `currency='USD'`, `charged_amount=1`, `amount` ≈ KES equivalent; balance up by KES `amount` (net of any `arrears_settlement`). Then decide on a paid FX provider (E9) before **live** non-KES charges.

### D. CI / E2E
1. Confirm the trial-expiry job is actually scheduled in prod Supabase (E11) — verify `handle_trial_expiry` runs.
2. Review PR #35 (Playwright); decide merge/defer and whether to gate CI; provision a Clerk test user + test Supabase if gating. Update tracker E14.

### E. Legal / governance
1. Schedule lawyer review ahead of the Nov 2026 Nairobi trip so it **signs** decisions (O5): publish legal docs, resolve incorporation.
2. Decide the **Kenya DPA cross-border basis** for Supabase eu-west-1 (O6) — adequacy/contract clauses or region migration.
3. Payment-processor final choice / Stripe-Kenya payouts (L7); FX-source disclosure if non-KES charges launch (L8).

---

## Bottom line

- **Rehearsal:** the build is ready; **~5 one-time deploy/ops tasks** (pin+migrate the right DB, Clerk wiring, custom SMTP, seed) stand between here and a clean Node 0 run. No new engineering required.
- **Shopper launch:** blocked on the rehearsal list **plus** env audit, prod monitoring, M-Pesa access, auth backfill, and the legal/DPA gates — mostly human, not code.
- **One recorded code drift** worth fixing before either horizon for merchant confidence: the success takeover doesn't tell the cashier the **YOU PAY amount to collect from the shopper** (P12).

*Repo-only audit, 2026-07-24. No prod system was inspected or changed; deployment-side status is unknown unless a repo file or doc encodes it.*
