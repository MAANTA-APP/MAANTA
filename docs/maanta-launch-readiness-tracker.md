# MAANTA launch readiness tracker

Last updated: 2026-07-30 · Review weekly (Product track, Step 5). Update this
doc (and its Notion counterpart) whenever an item changes state; anything
marked **GATE** must be done before launch day. Behavior-changing decisions go
to `maanta-decisions-log.md`, not this file.

> **Staged readiness (now / launch / 10k / 100k):** see
> [`docs/maanta-staged-readiness-now-launch-10k-100k.md`](maanta-staged-readiness-now-launch-10k-100k.md)
> for CTO/ops checklists and scale matrices. This tracker remains the gate
> status source of truth.

> **2026-07-29 full-state audit:** repo × production × Notion reconciliation in
> `docs/skills/full-state-audit-2026-07-29.md`. Repo green: **293 vitest tests
> (45 files) + 16 SQL suites**, lint + typecheck clean. Production is **live and
> schema-aligned** — Supabase `axrrslqssmbngbataejg` ACTIVE_HEALTHY with 67
> migrations applied (this session adds + applies a 68th — the trial-expiry cron fix
> `20260729092118`, **applied to prod 2026-07-29**, see E11), Vercel prod deploying from `main` (100%
> READY), Sentry + PostHog ingesting. Data is **seed/rehearsal** (291 deals but 5
> redemptions). Remaining gates are verification-at-volume + money rails + legal,
> **not** deployment. Key fix from that audit: the trial-expiry cron job was
> never registered on prod (see E11) — corrective migration `20260729120000` added.
>
> **2026-07-24 repo audit:** earlier full repo-vs-prod readiness audit in
> `docs/skills/launch-audit-2026-07-24.md` (superseded by the 07-29 audit above
> for prod status; retained for its §4 prod-apply breakdown).
>
> **2026-07-24 Builder follow-up (same branch):** closed the audit's repo gaps —
> (1) **"Collect from shopper KES N"** now renders on the redeem success takeover
> (`amount_kes` threaded read-only through `/api/redemptions/verify`; no
> money-path change); (2) general **`GET /api/healthz`** + `src/lib/health.ts`
> (public liveness + admin-gated boolean env presence); (3) **FX provider
> abstraction** `src/lib/fx/**` with `toKes` refactored to delegate — behaviour
> preserved, docs in `docs/skills/fx-provider.md`. E9 (SLA-backed FX provider)
> stays open.

> **2026-07-30 session (branch `claude/maanta-role-hardening-62ut64`, PR #131 — open, CI green):**
> role hardening, a durable CI-enforced design-truth contract, and the launch-copy
> governance work it surfaced. Repo green: **565 vitest tests (53 files) + 17 SQL
> suites + 141 design-truth Layer-1 assertions**, lint + typecheck + build clean;
> `playwright test --list` resolves 35 tests across 3 spec files. New gates
> **E17–E20** below. **One migration applied to production** during the session
> (`20260730120000`, per-node opening-credit cap — see E20).
>
> Two real production defects were found and fixed behind design-drift rows, both
> in money-adjacent copy rather than the money path itself: the Stripe return
> declared a **credit the webhook had not made**, and `/for-merchants` advertised a
> **launch credit whose config gates had stopped granting it**. Neither changed a
> frozen rule. Detail in `docs/skills/{topup-rails-d06,support-pricing-d12,launch-credit-config-driven}-*.md`.

Status legend: ✅ done · 🟡 in progress / needs verification · 🔴 blocker · ⬜ not started

## Launch-critical product flows

| Flow | Status | Notes |
|---|---|---|
| Shopper browse → claim → ticket | ✅ | `claim_deal` RPC; ticket expiry = deal expiry + 15 min. Claim now gated on a **verified phone** (S2 ruling 2026-07-23): email-only sessions get a typed `phone_required` (403) → `/verify-phone` Clerk SMS OTP → back to the deal |
| Shopper redeem at counter (merchant verify) | ✅ | `verify_redemption` RPC: atomic verify + fee debit/arrears |
| Merchant onboarding → admin approval | ✅ | `onboard_merchant` / `activate_merchant` RPCs, agent attribution. **2026-07-30:** the Node 0 opening-credit cap inside `activate_merchant` was counted **globally**, so once Node 0 filled its 100 slots the next node's promo would have been dead on arrival — every activation there granting nothing, silently, while `/for-merchants` advertised the credit. Now counted **per node** (migration `20260730120000`, **applied to prod**); frozen amount/cap unchanged. See E20 |
| Merchant wallet top-up (Stripe card) | 🟡 | Works in **sandbox**; live keys + live-mode test pending (Nov cutover decision). Top-ups **settle arrears first**, then credit the remainder — both rails, migration `20260721120000` (§3 frozen rule); asserted by E12 tests. **2026-07-30 defect fixed:** the `?stripe=success` return rendered the green success takeover with `added: 0` and the pre-payment balance — claiming a credit the webhook had not made — and the card rail never polled, so `credited` could not render. The return now lands on a polling `confirming` screen, `credited` shows the **observed balance delta**, and a charged-but-uncredited card gets **`unsettled` — "Payment received"**, never the failure screen (`src/lib/topup-settlement.ts`) |
| Merchant wallet top-up (M-Pesa STK / IntaSend) | 🟡 | Code + webhook ready; do not assume IntaSend availability — needs account + live STK test. Inherits the settle-arrears-first top-up path. **Rail order is capability-driven, not declared:** M-Pesa leads wherever IntaSend credentials exist and card leads where they don't, so going live is an **ops event, not a code change**. **2026-07-30:** "configured" now means *usable* — a key pair disagreeing with `INTASEND_ENV` is refused on the money path, so it no longer counts as available and the rail is hidden rather than offered-then-broken (operator gets a warn-once log; merchant gets the honest 503 pointing at card) |
| Refund / dispute money movements | ✅ | Stripe webhook handles refund + dispute open/close, payment_intent-keyed idempotency |
| Fraud review on unknown fee status | ✅ | Verify-anyway + admin task (migration `20260703235152`) |
| Guardian v1 verify-time fraud checks | ✅ | velocity/geofence/collusion → clear / flag / soft-block (held) / hard-block (declined); blocks move no money. Admin held-review queue + release + hard-block appeal; thresholds live-tunable via `app_config`; outcomes to PostHog. Migrations `20260721140000`/`20260722140000`/`20260722160000`; PRs #36/#37/#44/#45/#46 |
| Admin success-fee reversal (dispute uphold) | ✅ | Admin-gated `reverse_success_fee` credits merchant wallet (settle-arrears-first, one per redemption, original redemption + fee rows never modified); action on `/admin/redemptions/[id]`; `fee_reversals` audit + export view. Migration `20260722120000`, PR #42. Backs the 72h dispute-SLA uphold path. **A decision note is now required on every reversal** (2026-07-23): route rejects an empty note (400) and the RPC enforces `note_required` as a backstop — migration `20260723150000` |
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
| E6 | M-Pesa STK end-to-end | Engineer | 🔴 blocked | GATE | Blocked on IntaSend API access; code path exists. Escalate credential request weekly. **2026-07-30 — read this before provisioning:** the rail appears only when the keys are *usable*, not merely present. A key pair whose `_test_`/`_live_` prefix disagrees with `INTASEND_ENV` is refused on the money path, so it now hides the rail instead of offering one that throws — the failure mode most likely at the exact moment credentials are first pasted in. On a mismatch the server logs `[intasend] M-Pesa top-up is hidden: <reason>` once per process; check it if the rail doesn't appear after provisioning. Parity between the capability check and the money path is asserted over a 7-config matrix in `src/lib/__tests__/intasend-guard.test.ts` |
| E7 | Waitlist live: `/waitlist` form → Resend audience (platform decided 2026-07-10: Resend) | Founder + engineer + AI lead | 🟡 in progress | GATE (marketing) | Built + end-to-end tested 2026-07-10 (real contact in Waitlist audience, confirmation email delivered; domain verified; properties created). **2026-07-23 prod debug:** confirmation emails weren't arriving; DB evidence (a live `claim:` rate-limit bucket but **zero** `waitlist:` buckets) strongly indicated every prod submission was failing *before* the rate-limit/Resend steps (so not env/limiter/service-role) — most likely the honeypot, the only pre-rate-limit step that returns a success-looking response. Hardened the honeypot against browser autofill (renamed `website`→`hp_url`, kept `display:none` + added password-manager ignore attrs) so a real signup can't be silently dropped, and added `GET /api/waitlist?healthz=1` (booleans only) to confirm the 3 Resend env vars are present on the running deployment. Remaining: deploy, read healthz, verify first production signup lands in the Waitlist segment |
| E8 | Campaign-source capture (UTM → `source_campaign` property on every signup, in Resend) | Agency + AI lead | 🟡 in progress | GATE (marketing) | Form captures `utm_source/medium/campaign` → contact properties; verify end-to-end once Resend is configured |
| E9 | FX provider replaced with SLA-backed source | Engineer | 🟡 repo-complete, prod-ops pending | GATE if non-KES live charges | **Repo (PR #70, on `main`):** FX **abstraction** landed — `src/lib/fx/**` (`kesPerUnit` resolver + static fallback), `currency.ts` `toKes` delegates, behaviour preserved + unit-tested, so swapping the source is now a config-level change (`docs/skills/fx-provider.md`). **Prod-ops pending (human):** choose + wire an SLA-backed provider and set prod FX rules/margin disclosure. Free tier today; fine to defer while launch is KES-only |
| E10 | Production env vars set on Vercel + Supabase secrets audit | Engineer | 🟡 in progress | GATE | **Deploy is live and schema-aligned** (2026-07-29 audit): Supabase `axrrslqssmbngbataejg` at 67/67 migrations, Vercel prod READY from `main`, seeds applied. Remaining founder-owned: confirm the **required-now** env values on Vercel Production (values not machine-readable) + `W3W_API_KEY`, per `docs/ops/backend-prod-setup-status-2026-07.md` + `founder-backend-prod-checklist-2026-07.md` |
| E11 | Trial-expiry job scheduling confirmed in production Supabase | Engineer | 🟡 in progress | GATE | **2026-07-29 audit found the job was never registered:** pg_cron is installed on prod but `cron.job` had **zero rows** — the old migrations' direct `INSERT INTO cron.job` (with `EXCEPTION … NULL`) silently failed, so `handle_trial_expiry` never ran (101 merchants on Elite trial, none would ever grace/downgrade). Corrective migration `20260729092118_schedule_trial_expiry_cron.sql` uses the supported `cron.schedule()` API. **Applied to prod 2026-07-29** — job `maanta_handle_trial_expiry` is registered and `active` (`0 2 * * *`), function smoke-run clean (0 trials past-due). Remaining: confirm the first real nightly run in `cron.job_run_details` |
| E12 | Money-path + golden-path automated tests (ENGINEERING_NOTES §8.3/§8.4) | Engineer | ✅ done | — | Merged PR #32 (2026-07-21). `supabase/tests/{golden_path,verify_redemption_money_path,topup_settles_arrears}_test.sql` run in CI `db-tests` against a real Supabase: one-winner double-verify / no double charge, owed@low-balance, unknown → fraud task, settle-first, ledger reconciliation |
| E13 | Frozen-rule enforcement ratchet + Locked-Rules audit (§8.5) | Engineer | ✅ done | — | Merged PR #32. `src/lib/__tests__/frozen-ui-rules.test.ts` fails CI on money-in-amber, banned vocabulary, red failure surfaces, or red error body text; audit in `docs/skills/frozen-ui-locked-rules-audit.md`. R1 (≤1 amber/screen) stays a manual PASS-2 item |
| E14 | Browser golden-path E2E (Playwright: `/demo` → claim → verify → wallet) | Engineer | 🟡 repo-complete, prod-ops pending | — | **Repo (PR #70, on `main`):** self-skipping Playwright golden path landed — `maanta-app/playwright.config.ts` + `maanta-app/e2e/golden-path.spec.ts` (browse → claim → verify, asserts the collect line) + opt-in `.github/workflows/e2e.yml`; skips without `E2E_BASE_URL`, `@playwright/test` not installed by default, so never false coverage; `docs/ops/e2e-golden-path.md`. The E12 RPC golden path already proves the money invariants. **Prod-ops pending (human):** provision a live Supabase + Clerk test env, set `E2E_BASE_URL` + storage-state secrets, then flip `e2e.yml` to gate CI. Supersedes the older standalone PR #35. **2026-07-30 (PR #131):** the suite is now **35 tests across 3 spec files** — `golden-path`, `role-access` (nav visibility per staff permission + route-guard negatives), and the contract-generated `design-truth-smoke` (18 frames). Reusable per-role Clerk session helpers in `e2e/helpers/roles.ts`; **no secrets in the repo** (storage states are env/CI secrets). The same single env unblocks E14 and E17's Layer 2 — one provisioning task, two gates |
| E15 | Pre-traffic security hardening | Engineer | ✅ done | GATE | Internal money RPCs locked to service_role, rate limits on claim/onboard/top-up, image magic-byte validation, atomic `capture_lead` (PRs #48/#50). CI `db-tests` now includes `security_hardening` + `capture_lead` suites; 11 SQL suites total on `main` |
| E16 | Product analytics (PostHog) instrumented | Engineer | ✅ done (events flowing) | — | Client + funnel instrumentation merged (PRs #45, #47), EU cloud project 211805. **Confirmed live 2026-07-29:** PostHog is ingesting (2,757 events / 217 persons over the prior 6 days; `deal_viewed` + `deal_claim_started` custom events firing), so the env vars (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`) are set on Vercel. Remaining: redemption/`guardian_outcome`/purchase events unverified (only 5 prod redemptions so far) — reconfirm once real volume exists |
| E17 | Design-truth contract + CI enforcement (design ↔ code parity) | Engineer | 🟡 repo-complete, Layer 2 env pending | — | **Repo (PR #131):** `maanta-app/design/current-reality/` holds the audited contract (**22 frames, 19 runtime rules, 11 drift rows — all `blockedOn: none`**), authored in Claude Design and schema-pinned as such. Three layers: **L1 static** (`src/lib/design-truth/`, **141 assertions**, every PR — fails on a renamed route, an undefined rule reference, a smoke anchor missing from the source it names, a `design-ahead` frame linked to a closed row, a stale `frameCount`, or an undisclosed repo-authored frame); **L2 behavioural smoke** (18 frames, generated from the contract, accessible locators only, no `data-testid`); **L3** `npm run test:design-truth` + `docs/design-truth-protocol.md`. Every guard negative-tested. **Pending (human):** L2 needs the same seeded non-prod env as E14. **Also owed (Claude Design):** redraw the canvas to match — handoff prompt in `docs/skills/claude-design-wireframe-update-prompt-2026-07-30.md`; nothing in the repo depends on that landing |
| E18 | Role-scoped merchant console + founder-role split | Engineer | 🟡 nav done, split deferred | — | **Done (PR #131):** `src/lib/merchant-nav.ts` is the single permission→surface mapping, so nav state and server guards cannot drift; verify-only staff get a verify-focused shell instead of tabs that dead-end. **Owner console unchanged by construction** (owners hold every permission). No server guard weakened — UI hiding is clarity only. Fixed in passing: `/merchant/topup` and `/merchant/plan/upgrade` rendered flows the API rejects, and the staff invite wizard defaulted `can_deals=true` while `/api/staff` defaults it false. **Deferred:** the founder/admin split itself needs a CHECK-constraint migration + RLS review — audit and extraction path in `docs/skills/founder-role-split.md`; `src/lib/roles.ts` scaffolding makes the cutover a one-file change. Fee reversal is the first power to extract |
| E19 | Public copy governance (plan names, launch offers) | Engineer + founder | ✅ done | — | **R-PLAN-NAMES was being violated in production:** both public plan cards priced Standard as **"Free"**, which also misstates the model — Standard carries the KES 30 success fee. Both now read **"No monthly fee"** with the fee visible beside the Standard card. The ungoverned **"Launch offer: first month of Elite free"** line is **withdrawn** by founder ruling (nothing backed it — no `app_config` key, no decisions-log entry). CI-enforced in `src/__tests__/cash-only-and-copy.test.ts`: no plan priced "Free", no launch-offer phrasing on any public page (comment-stripped, so the explanatory comment at the removal site neither satisfies nor trips it), Standard never described as free. **Standing rule:** a future Elite launch offer needs an `app_config` key **plus** a decisions-log entry before it is re-advertised |
| E20 | Node 0 opening-credit promise matches its config | Engineer | ✅ done (prod-applied) | — | The KES 300 / first-100 promo is gated live by `activate_merchant` on four `app_config` keys, but `/for-merchants` **hardcoded the amount and the cap** — so it kept advertising after ops retuned either number, after the window closed, after the cap filled, and even with the promo switched off. `src/lib/launch-credit.ts` now mirrors the SQL gate and both promo blocks render only when the grant would actually happen; it **fails closed** (a config error, unmeasurable cap, unparseable window or junk amount all show nothing). The cap is also now counted **per node** — migration `20260730120000`, **applied to prod 2026-07-30** and verified read-only; safe window, since prod had **0** credits granted, so the change was behaviour-identical on the day. SQL scenarios **E** (a filled node must not exhaust the next node's allowance) and **F** (the cap still binds within a node) pass in CI `db-tests` against real Supabase. Frozen amount/cap unchanged. **Known limit:** the count attributes a credit to the merchant's *current* node; nothing mutates `merchants.node` today, but a future relocation feature must move it to a grant-time snapshot |

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
- **PR #131 cannot be approved by automation** (2026-07-30). CI is green, but the
  Cursor Approval Agent declines because its Security Agent completes as
  *skipped* — so the required security signal never succeeds — and **no reviewers
  can be assigned, because only the PR author has collaborator access**. Founder
  action: grant a human reviewer collaborator access, or adjust that automation's
  required signals. No code change can clear this.
- **Production is ahead of `main` on one function** while #131 is unmerged:
  `activate_merchant` carries the per-node cap (migration `20260730120000`,
  applied 2026-07-30). Behaviour-identical today (0 credits granted), and the
  migration is committed on the branch — but if #131 were abandoned rather than
  merged, that migration would need re-homing. Merging closes the gap.

## Post-launch deferrals

- Additional malls / nodes beyond BBS Mall
- Mall-operator reporting dashboard
- Deal drafts, self-serve Elite payment rail (deferred from PR #11)
