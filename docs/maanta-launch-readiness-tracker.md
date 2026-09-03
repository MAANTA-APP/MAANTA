# MAANTA launch readiness tracker

Last updated: 2026-09-03 (header only — see the 2026-09-03 block below; the gate tables themselves still need the founder-owned revision pass recorded as **D219**) · Review weekly (Product track, Step 5). Update this
doc (and its Notion counterpart) whenever an item changes state; anything
marked **GATE** must be done before launch day. Behavior-changing decisions go
to `maanta-decisions-log.md`, not this file.

> **2026-09-03 — three migrations applied to production; ledger 110/110.**
> Under founder authorisation the claim-allocation (D223/D236), blacklist
> enforcement (D171) and tenant-policy repair (D168) migrations were applied in
> order, each with its own read-back, and the complete ledger was diffed against
> `supabase/migrations/`: **110 files, 110 rows, zero differences.**
> `verify_redemption`'s definition md5 is unchanged, so the money path is
> provably untouched. Post-apply read-only smoke: 247 live deals, 0
> over-subscribed, an independent hand-count across all 198 deals holding
> claims returns zero mismatches against the new derived allocation, and the
> ten previously-stale claims now release their slots without any row being
> mutated. Evidence integrity unchanged — **external field validation is still
> 0**. Fast Visit remains **OFF**. Full record:
> `docs/ops/merchant-01-engineering-completion-2026-09-03.md` and
> `docs/ops/migration-deployment-plan-2026-09-03.md`.
>
> **The next gate is operational, not engineering: E14 / D172 — browser E2E has
> still never executed.** 200 workflow runs, every sampled one skipped. The
> exact provisioning procedure is
> `docs/ops/browser-e2e-provisioning-2026-09-03.md`. Merchant 01 follows a
> genuinely green browser run.

> **STALENESS WARNING, added 2026-09-01.** The gate tables below have not been
> revised since 2026-08-08 and predate most of what has since become true:
> Node 0 Field Validation Mode (2026-08-22), the Node 0 GO ruling (2026-08-23),
> the ratified evidence protocol and kill criterion (2026-08-24), the Elite
> price de-anchoring (2026-08-24), the demo-mode ruling (2026-08-26), and the
> Fast Visit / counter-QR packages (2026-08-26/27). Individual rows below
> (notably E10, E14, E17, O2, O5–O9) carry their own later updates and are
> reliable; the **header narrative and the gate set as a whole are not a current
> view.** For the current operating position read `CLAUDE.md`'s "Operating
> state: Node 0 Field Validation Mode" section and
> `docs/ops/node0-known-limitations.md`; for what is decided read
> `docs/maanta-decisions-log.md`; for what is broken read
> `docs/maanta-drift-register.md`.
>
> **This tracker is still the gate-status source of truth** — that has not
> changed, and no second tracker has been created. It needs a founder-owned
> revision pass, which is a decision, not a documentation edit: several gates
> (M2–M7 in particular) may no longer be the right gates for a controlled
> field-validation run. Recorded as drift **D219**.

> **2026-08-01 — production is live and serving, but it was NOT a clean mirror
> of `main`** (superseding the "live and schema-aligned" wording in the
> 2026-07-29 block below and in E10). **Updated 2026-08-05: the schema side is
> reconciled** — the drift rows that carried this, and how they closed:
>
> - ~~**D24**~~ — **closed 2026-08-05**: the migration ledger is fully
>   reconciled — production's `schema_migrations` and `supabase/migrations/`
>   agree on all **85** version/name pairs, verified by a full read-back diff.
>   Prod's uncommitted `node_scoped_opening_credit_cap` is now exported into the
>   repo (its change was relanded and **applied 2026-08-08** — see **D73**, closed), the notes
>   migration was renamed to match the ledger, and the MCP-minted pause-gate
>   versions were repaired to the repo filenames.
> - ~~**D25** (`pending-deploy`)~~ — **closed 2026-08-04**: the `claim_deal`
>   pause gate is live on production (founder-authorized MCP apply, verified by
>   `pg_get_functiondef` read-back); ledger repaired to the repo filenames
>   2026-08-05.
> - **D69** — **closed 2026-08-05**: the `cofounder` role CHECK is applied to
>   production, ledger version `20260804010000` matching the repo filename.
>   Re-verified live 2026-08-05 (evening): exact string `'cofounder'`, zero
>   holders. Its narrower-than-admin scope was app-enforced only until the
>   policy layer applied — tracked as **D74**, closed 2026-08-08 (eight
>   SELECT-only policies read back).
>
> The schema-side reconciliation (E17) is **done**, and its residue cleared on
> 2026-08-08: **D73** (per-node cap reland) and **D74** (cofounder policy
> layer) both applied to production with read-backs — ledger 87/87 *on that
> date*. It has since gone one row out: **D107** (opened 2026-08-16) — the
> D106 attribution migration `20260816020000` is applied and verified live but
> unrecorded in `schema_migrations`, and one INSERT closes it. The open
> residue is now the deployment-side promote guard (**D71** — narrowed
> 2026-08-05: Vercel Authentication is enabled at scope
> `all_except_custom_domains`, so branch/preview URLs are no longer public;
> the promote path itself remains ungated). The register rows are the detail.
>
> **Updated 2026-08-02 — the *deployment* half is closed.** **D37** (`main` and
> the deployed commit diverged both ways) closed on 2026-08-01, verified against
> the Vercel deployment rather than assumed: production serves `main`. It came
> apart twice that day, the second time by a manual dashboard promote of an open
> PR branch (**D53**, also closed), so treat deployment alignment as a thing to
> re-check rather than a settled state. When auditing it, compare **trees, not
> commit SHAs** — a squash merge mints a new SHA, so an ancestry check against a
> promoted branch commit fails forever even when the content is identical. The
> database side fully reconciled on 2026-08-05 (D24 closed); the deployment
> side re-broke and re-closed twice more on 2026-08-04 — D71 has the incident
> record and the guard work (a 30-minute tripwire; prevention remains a
> dashboard/RBAC task).

> **Node 0 field validation (2026-08-22):** the pilot sequence — field
> activation → Merchant 01 → Staff 01 → first physical attribution → 5 → 20
> redemptions → merchant repost → controlled expansion — is
> [`docs/maanta-node0-field-validation-timeline.md`](maanta-node0-field-validation-timeline.md).
> It closes **E2/E3/E4** by running them with real people rather than asserting
> them. Read its "before Week 1" section first: it names the opening-credit
> wall at 10 redemptions, the demo-mode claim hazard, and the one Clerk
> dashboard fact the plan's email premise rests on.

> **Staged readiness (now / launch / 10k / 100k):** see
> [`docs/maanta-staged-readiness-now-launch-10k-100k.md`](maanta-staged-readiness-now-launch-10k-100k.md)
> for CTO/ops checklists and scale matrices. This tracker remains the gate
> status source of truth.

> **2026-07-29 full-state audit** (dated record — read with the 2026-08-01 note
> above; its "schema-aligned" finding no longer holds): repo × production ×
> Notion reconciliation in
> `docs/skills/full-state-audit-2026-07-29.md`. Repo green: **293 vitest tests
> (45 files) + 16 SQL suites**, lint + typecheck clean. Production is **live and
> schema-aligned** — Supabase `axrrslqssmbngbataejg` ACTIVE_HEALTHY with 67
> migrations applied (this session adds + applies a 68th — the trial-expiry cron fix
> `20260729092118`, **applied to prod 2026-07-29**, see E11), Vercel prod deploying from `main` (100%
> READY), Sentry + PostHog ingesting. Data is **seed/rehearsal** (291 deals but 5
> redemptions). Remaining gates are verification-at-volume + money rails + legal,
> **not** deployment. Key fix from that audit: the trial-expiry cron job was
> never registered on prod (see E11) — corrective migration
> `20260729092118_schedule_trial_expiry_cron.sql` added. (Corrected 2026-08-02:
> this line previously said `20260729120000`, a version number with no file in
> the repo, while E11 below named the real one — drift **D61**.)
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

Status legend: ✅ done · 🟡 in progress / needs verification · 🔴 blocker · ⬜ not started

## Launch-critical product flows

| Flow | Status | Notes |
|---|---|---|
| Shopper browse → claim → ticket | ✅ | `claim_deal` RPC; ticket expiry = deal expiry + 15 min. Claim now gated on a **verified phone** (S2 ruling 2026-07-23): email-only sessions get a typed `phone_required` (403) → `/verify-phone` Clerk SMS OTP → back to the deal. **Paused deals:** new claims raise `deal_paused` (repo gate `180000`, browse filter `190000`; **live on prod since 2026-08-04**, ledger repaired to those filenames 2026-08-05 — D25 and D24 closed). Claimed-while-active tickets stay in My deals and remain verifiable — `docs/skills/paused-deal-semantics.md` |
| Shopper redeem at counter (merchant verify) | ✅ | `verify_redemption` RPC: atomic verify + fee debit/arrears |
| Merchant onboarding → admin approval | ✅ | `onboard_merchant` / `activate_merchant` RPCs, agent attribution |
| Merchant wallet top-up (Stripe card) | 🟡 | Works in **sandbox**; live keys + live-mode test pending (Nov cutover decision). Top-ups now **settle arrears first**, then credit the remainder — both rails, migration `20260721120000` (§3 frozen rule); asserted by E12 tests |
| Merchant wallet top-up (M-Pesa STK / IntaSend) | 🟡 | Code + webhook ready (sandbox URL switch in `src/lib/intasend.ts`); do not assume IntaSend availability — needs account + live STK test. Inherits the settle-arrears-first top-up path |
| Refund / dispute money movements | ✅ | Stripe webhook handles refund + dispute open/close, payment_intent-keyed idempotency |
| Fraud review on unknown fee status | ✅ | Verify-anyway + admin task (migration `20260703235152`) |
| Guardian v1 verify-time fraud checks | ✅ | velocity/geofence/collusion → clear / flag / soft-block (held) / hard-block (declined); blocks move no money. Admin held-review queue + release + hard-block appeal; thresholds live-tunable via `app_config`; outcomes to PostHog. Migrations `20260721140000`/`20260722140000`/`20260722160000`; PRs #36/#37/#44/#45/#46 |
| Admin success-fee reversal (dispute uphold) | ✅ | Admin-gated `reverse_success_fee` credits merchant wallet (settle-arrears-first, one per redemption, original redemption + fee rows never modified); action on `/admin/redemptions/[id]`; `fee_reversals` audit + export view. Migration `20260722120000`, PR #42. Backs the 72h dispute-SLA uphold path. **A decision note is now required on every reversal** (2026-07-23): route rejects an empty note (400) and the RPC enforces `note_required` as a backstop — migration `20260723150000` |
| Elite trial expiry → grace → downgrade | ✅ | `handle_trial_expiry`; nightly cron confirmed running on production — `succeeded` in `cron.job_run_details` through 2026-08-07 (E11, closed) |
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
| E7 | Waitlist live: `/waitlist` form → Resend audience (platform decided 2026-07-10: Resend) | Founder + engineer + AI lead | 🟡 in progress | GATE (marketing) | Built + end-to-end tested 2026-07-10 (real contact in Waitlist audience, confirmation email delivered; domain verified; properties created). **2026-07-23 prod debug:** confirmation emails weren't arriving; DB evidence (a live `claim:` rate-limit bucket but **zero** `waitlist:` buckets) strongly indicated every prod submission was failing *before* the rate-limit/Resend steps (so not env/limiter/service-role) — most likely the honeypot, the only pre-rate-limit step that returns a success-looking response. Hardened the honeypot against browser autofill (renamed `website`→`hp_url`, kept `display:none` + added password-manager ignore attrs) so a real signup can't be silently dropped, and added `GET /api/waitlist?healthz=1` (booleans only) to confirm the 3 Resend env vars are present on the running deployment. Remaining: deploy, read healthz, verify first production signup lands in the Waitlist segment |
| E8 | Campaign-source capture (UTM → `source_campaign` property on every signup, in Resend) | Agency + AI lead | 🟡 in progress | GATE (marketing) | Form captures `utm_source/medium/campaign` → contact properties; verify end-to-end once Resend is configured |
| E9 | FX provider replaced with SLA-backed source | Engineer | 🟡 repo-complete, prod-ops pending | GATE if non-KES live charges | **Repo (PR #70, on `main`):** FX **abstraction** landed — `src/lib/fx/**` (`kesPerUnit` resolver + static fallback), `currency.ts` `toKes` delegates, behaviour preserved + unit-tested, so swapping the source is now a config-level change (`docs/skills/fx-provider.md`). **Prod-ops pending (human):** choose + wire an SLA-backed provider and set prod FX rules/margin disclosure. Free tier today; fine to defer while launch is KES-only |
| E10 | Production env vars set on Vercel + Supabase secrets audit | Engineer | 🟡 in progress | GATE | **Deploy is live and serving; migration ledger reconciled at 85/85 on 2026-08-05** (D24 closed — see E17; this row previously warned "schema alignment is NOT current" while D24/D25 were open, and before that quoted the 2026-07-29 audit's 67/67 count). What remains here is the **environment and secrets** work: confirm the **required-now** env values on Vercel Production (values not machine-readable) + `W3W_API_KEY`, per `docs/ops/backend-prod-setup-status-2026-07.md` + `founder-backend-prod-checklist-2026-07.md` |
| E11 | Trial-expiry job scheduling confirmed in production Supabase | Engineer | ✅ done (2026-08-07) | GATE | **2026-07-29 audit found the job was never registered:** pg_cron is installed on prod but `cron.job` had **zero rows** — the old migrations' direct `INSERT INTO cron.job` (with `EXCEPTION … NULL`) silently failed, so `handle_trial_expiry` never ran (101 merchants on Elite trial, none would ever grace/downgrade). Corrective migration `20260729092118_schedule_trial_expiry_cron.sql` uses the supported `cron.schedule()` API. **Applied to prod 2026-07-29** — job `maanta_handle_trial_expiry` is registered and `active` (`0 2 * * *`), function smoke-run clean (0 trials past-due). **Closed 2026-08-07 — nightly runs confirmed in `cron.job_run_details`** (read-only MCP query against prod): job 1 `maanta_handle_trial_expiry` shows status `succeeded` for every nightly 02:00 UTC run observed, five consecutive (2026-08-03 through 2026-08-07), each completing in under a second. no guard: a scheduled prod job's continued execution cannot be asserted from CI — re-check `cron.job_run_details` in future prod audits |
| E12 | Money-path + golden-path automated tests (ENGINEERING_NOTES §8.3/§8.4) | Engineer | ✅ done | — | Merged PR #32 (2026-07-21). `supabase/tests/{golden_path,verify_redemption_money_path,topup_settles_arrears}_test.sql` run in CI `db-tests` against a real Supabase: one-winner double-verify / no double charge, owed@low-balance, unknown → fraud task, settle-first, ledger reconciliation |
| E13 | Frozen-rule enforcement ratchet + Locked-Rules audit (§8.5) | Engineer | ✅ done | — | Merged PR #32. `src/lib/__tests__/frozen-ui-rules.test.ts` fails CI on money-in-amber, banned vocabulary, red failure surfaces, or red error body text; audit in `docs/skills/frozen-ui-locked-rules-audit.md`. R1 (≤1 amber/screen) stays a manual PASS-2 item |
| E14 | Browser golden-path E2E (Playwright: `/demo` → claim → verify → wallet) | founder / ops | 🟡 repo-complete; **measured 2026-08-24: it has never executed** | **GATE — but not before Merchant 01** | **Repo (PR #70, on `main`):** self-skipping Playwright golden path landed — `maanta-app/playwright.config.ts` + `maanta-app/e2e/golden-path.spec.ts` (browse → claim → verify, asserts the collect line) + opt-in `.github/workflows/e2e.yml`; skips without `E2E_BASE_URL`, `@playwright/test` not installed by default, so never false coverage; `docs/ops/e2e-golden-path.md`. The E12 RPC golden path already proves the money invariants. **Prod-ops pending (human):** provision a live Supabase + Clerk test env, set `E2E_BASE_URL` + storage-state secrets, then flip `e2e.yml` to gate CI. Supersedes the older standalone PR #35. **Measured in full 2026-08-24 (drift D172):** the workflow has never run — **167 of 167 runs `skipped`, zero executions**, run #1 (2026-07-24) through run #167, because `E2E_BASE_URL` has never been set. The tally rises on every push to `main`, so cite the gate, not the number. **State the distinction precisely:** MAANTA **does** have automated database/RPC money-path coverage (E12), it **has had** a successful manual browser E2E, and what it lacks is an **automated browser E2E executing in CI**. **Founder ruling 2026-08-24: this does NOT block Merchant 01** — there is already more direct production evidence than a one-merchant controlled pilot requires, and mandating it now would return the project to engineering when the open question is market behaviour. **It becomes a hard gate before MAANTA moves from controlled Node 0 validation into routine or scaled releases**, when frequent deploys and dependent customers make "someone remembers to run it manually" an unacceptable control. Tracked as **D172** *(originally recorded in Notion as D168; renumbered 2026-08-24)*. No implementation task is authorized yet |
| E15 | Pre-traffic security hardening | Engineer | ✅ done | GATE | Internal money RPCs locked to service_role, rate limits on claim/onboard/top-up, image magic-byte validation, atomic `capture_lead` (PRs #48/#50). CI `db-tests` now includes `security_hardening` + `capture_lead` suites; that PR took the total to 11 SQL suites — **22 as of 2026-08-02** (`ls maanta-app/supabase/tests/*.sql`) |
| E16 | Product analytics (PostHog) instrumented | Engineer | ✅ done (events flowing) | — | Client + funnel instrumentation merged (PRs #45, #47), EU cloud project 211805. **Confirmed live 2026-07-29:** PostHog is ingesting (2,757 events / 217 persons over the prior 6 days; `deal_viewed` + `deal_claim_started` custom events firing), so the env vars (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`) are set on Vercel. Remaining: redemption/`guardian_outcome`/purchase events unverified (only 5 prod redemptions so far) — reconfirm once real volume exists |
| E17 | Production reconciled with `main`: migration ledger repaired, pause gate applied | Founder + engineer | ✅ done (2026-08-05) | GATE (proposed — founder to confirm or downgrade) | Opened 2026-08-01 from three drift rows; **all three now closed**. ~~**D37**~~ closed 2026-08-01 — production serves `main`. ~~**D25**~~ closed 2026-08-04 — pause gate live, verified by read-back (`pg_get_functiondef` contains `deal_paused`; `deals_public_browse` filters `is_paused`). ~~**D24**~~ closed 2026-08-05 — the ledger is fully reconciled: production's `schema_migrations` and `supabase/migrations/` agree on all **85** version/name pairs (full read-back diff). That took: exporting prod's uncommitted `node_scoped_opening_credit_cap` into the repo, renaming the notes migration to `20260730160000` to match the ledger, and repairing the MCP-minted pause-gate/cofounder versions to the repo filenames. Residue ~~**D73**~~ **closed 2026-08-08**: the reland `20260807160000` (and the D74 cofounder policy layer `20260807161000`) applied to production with read-backs — per-node lock and count live in `activate_merchant`, eight SELECT-only cofounder policies present, ledger 87/87 on repo filenames. Gate designation was proposed by the 2026-08-01 docs session, not a founder ruling |

## Marketing & growth gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| M1 | Shopper + merchant landing pages live | Agency + engineer | ✅ done | GATE (campaign) | **Shipped in the marketing site build** (corrected 2026-08-02 — this row read "not started" long after the pages went live; drift **D65**). `/shoppers` and `/merchants` are separate pages with separate CTAs, plus `/mall-operators` for the third audience; `/merchants/join` is the merchant lead form and `/waitlist` carries the hard segment selector. What shipped and why: `docs/ops/IMPLEMENTATION-REPORT.md`. The remaining campaign work is E7/E8 (Resend config + UTM capture), not page build |
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
| O2 | Merchant onboarding support process defined | Founder + AI lead | ⬜ not started | GATE | Who answers merchant questions during onboarding week. **Still open on the owner, not the process:** the visit protocol, the merchant-facing pack and the field SOP were written 2026-08-22 — `docs/ops/first-merchant-loop-test.md`, `docs/ops/merchant-welcome-pack.md`, `docs/ops/field-operator-day-sheet.md` (all listed in the admin resource centre). Each leaves the support contact as a blank the founder fills; the 2-business-hour response target is stated in `docs/maanta-launch-ops-runbook.md`. Closing this gate needs a named owner, which is a founder ruling. **Founder direction 2026-08-22: "good for now"** — accepted as-is for the controlled pilot, so the first merchant loop test is not blocked on it. That is an acceptance of the current state, **not a closure**: the gate stays open and a named owner is still required before launch. Do not re-raise it for the pilot |
| O3 | Dispute + on-ground agent escalation path documented | AI lead | ✅ done | GATE | Verify-anyway routing logged in `maanta-decisions-log.md`; paths in the runbook. **72h dispute-resolution SLA** (founder ruling 2026-07-22): admin resolves within 72h — uphold → redemption reversed + KES 30 credited back via fee-reversal; reject → fee stands. Shopper copy fixed 24h→72h (PR #51); SOP in `docs/skills/redemption-disputes.md` |
| O4 | BBS Mall reporting expectations + operator comms | Founder | ⬜ not started | — | |
| O5 | Legal docs lawyer-reviewed and published | Founder + lawyer | 🔴 blocked | GATE | Drafts in `maanta-app/legal/`; blocked on incorporation decisions (Nov Nairobi trip) |
| O6 | Kenya DPA cross-border data decision (Supabase `eu-west-1`) | Founder + lawyer | ⬜ not started | GATE | Adequacy/contractual basis or region migration |
| O7 | Privacy operational package — retention schedule mapped to tables/jobs, deletion/anonymisation procedure, DSR access/export procedure, breach/incident procedure, processor inventory | Founder + lawyer | ⬜ not started | GATE (public launch) | The published privacy policy already promises "Erasure — within 14 days" and a retention table nothing implements — drift **D144**. Distinct from O5 (review of the documents) and O6 (cross-border basis): this is the machinery the documents promise. Does NOT gate the controlled pilot |
| O8 | Backup posture read back and a full restore TESTED to a scratch project, restore runbook written from the drill | Founder + eng | ⬜ not started | GATE (commercial launch) | "Supabase managed backups on" is claimed in `docs/maanta-staged-readiness-now-launch-10k-100k.md` and has never been verified; no restore has ever been performed — drift **D145**. A backup never restored is an assumption. Does NOT gate the controlled pilot |
| O9 | ODPC registration status established, recorded with evidence, and owned | Founder | ⬜ not started | GATE (public launch) | The site states "Data protection registration with the ODPC is in progress" on every page (`REGULATORY_STATUS`) and nothing owns the truth of that sentence — drift **D146**. Notion check owed. Does NOT gate the controlled pilot |

## Blockers

- E6 (IntaSend API access) — escalate weekly.
- O5 (legal review) — blocked on incorporation; schedule lawyer ahead of the
  November trip so the trip signs decisions rather than starting them.

## Post-launch deferrals

- Additional malls / nodes beyond BBS Mall
- Mall-operator reporting dashboard
- Deal drafts, self-serve Elite payment rail (deferred from PR #11)
