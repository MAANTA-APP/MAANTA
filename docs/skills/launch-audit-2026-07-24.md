# MAANTA launch-readiness audit — 2026-07-24

**Author:** Claude (Reviewer mode) · **Branch audited:** `claude/maanta-launch-audit-hn5qne`
(off `main` @ `2671f54`, merge #68) · **Scope:** repo + docs only.

## How to read this

This audit separates two things that are easy to conflate:

- **Ready in repo** — implemented, tested, and documented in this repository.
  Verifiable here, right now.
- **Ready in prod** — actually applied and verified by a human in the live
  environment (Supabase project, Vercel env, Clerk dashboard, money rails).
  **Nothing in this section can be proven from the repo** and is therefore
  listed as human-owned in §4.

A ✅ below means "ready in repo". It does **not** mean "live". The whole point of
§4 is that a repo-green audit is a precondition for launch, not a substitute for
the human deployment/verification steps.

### Note on the task's "starting context"

The brief for this session listed several artifacts as "already in place on
`main`". Verification found that some exist under different names/shapes and some
do not exist at all. This is recorded honestly below rather than assumed:

| Claimed in brief | Reality in repo |
|---|---|
| `docs/skills/launch-audit-2026-07-24.md` | Did not exist — **this file** is it |
| `docs/ops/supabase-migrations.md` | Does not exist; migration-apply steps live in `docs/skills/prod-handoff-security-audit-2026-07-23.md` and `docs/maanta-node0-rehearsal-checklist.md` |
| `docs/skills/fx-provider.md` | Does not exist; FX logic + provider notes live inline in `src/lib/currency.ts` |
| `docs/skills/agent-attribution.md` | Does not exist; attribution is documented in `docs/skills/ui-walkthrough-roles.md` (G1) and inline in the onboard route |
| `docs/ops/e2e-golden-path.md` | Does not exist; E2E status is tracked as E14 + decisions log |
| `src/lib/fx/**` FX abstraction | No `fx/` module; FX lives in `src/lib/currency.ts` (works, tested) |
| `src/lib/health.ts` + `GET /api/healthz` | No general healthz route; a narrow `GET /api/waitlist?healthz=1` boolean check exists |
| `src/lib/agent-attribution.ts` | No dedicated lib; attribution is inline in `src/app/api/merchants/onboard/route.ts` + the `onboard_merchant` RPC |
| Playwright `playwright.config.ts` + `e2e/golden-path.spec.ts` | **Does not exist — deliberately** (E14; decisions log: "an unrunnable suite is false coverage"). PR #35 open |
| Root `Makefile` with `db-link/db-list/db-push-dry/db-push` | No root Makefile exists |

None of these gaps are drift *within* the repo — the repo's own docs (tracker,
decisions log, prod-handoff) describe the true state accurately. The mismatch is
between the brief's assumptions and reality.

---

## §1 · Safe checks run this session

Run from `maanta-app/` on the audited branch:

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ clean |
| Lint | `npm run lint` (`next lint`) | ✅ no warnings or errors |
| Unit / integration | `npm test` (`vitest run`) | ✅ **94 tests / 18 files passed** |
| DB assertion suite | `supabase/tests/*.sql` (15 files) | ⏭️ **not runnable here** — needs a booted Supabase (Postgres+postgis+auth+roles). No `supabase` CLI / running server in this sandbox. Runs in CI `db-tests` (`.github/workflows/ci.yml`) |
| Browser E2E | Playwright | ⏭️ **nothing to run** — no Playwright suite exists (E14, intentional). Not a self-skip; the suite is absent by design |
| Prod build | `npm run build` | Not run this session (not required for a repo audit; build runs in CI) |

The 15 SQL suites present: `admin_ops_log`, `browse_views`, `capture_lead`,
`fee_reversal`, `golden_path`, `guardian_hard_block_appeal`,
`guardian_thresholds_config`, `guardian_v1`, `node0_opening_credit`,
`onboard_agent_attribution`, `revoke_authenticated_writes_core_tables`,
`security_hardening`, `success_fee_reference_link`, `topup_settles_arrears`,
`verify_redemption_money_path`.

---

## §2 · BBS rehearsal track — item-by-item

Legend: ✅ ready in repo · ⚠️ partial / caveat · ❌ missing.

### Golden path (browse → claim → verify → KES 30 fee/arrears → wallet)
- **Status:** ✅ ready in repo.
- **Evidence:** `claim_deal` + `verify_redemption` RPCs (migrations
  `20260702092952`, `…093134`, `…093258`); `src/app/api/redemptions/route.ts`
  (claim), redeem UI `src/app/merchant/(app)/redeem/redeem-keypad.tsx`
  (two-step resolve → confirm), `RedemptionResult` takeover. Money invariants
  asserted by `supabase/tests/golden_path_test.sql` and
  `verify_redemption_money_path_test.sql` (one-winner double-verify, no double
  charge, owed@low-balance, unknown→fraud task, ledger reconciliation).

### KES 30 success fee + arrears when wallet can't cover
- **Status:** ✅ ready in repo.
- **Evidence:** fee shown in `FeeDisclosure` + `RedemptionResult`
  ("charged" vs "recorded as arrears"); `topup_settles_arrears` (migration
  `20260721120000`) settles arrears before crediting; fee amount hardened
  (`20260702094145`). Frozen-rule tests in
  `src/lib/__tests__/frozen-ui-rules.test.ts`.

### Fee reversal with required decision note
- **Status:** ✅ ready in repo (this branch).
- **Evidence:** `src/app/api/admin/redemptions/[id]/reverse-fee/route.ts`
  rejects an empty note (400) at the edge; `reverse_success_fee` RPC enforces
  `note_required` as a backstop and writes `fee_reversals` + admin ops-log
  atomically (migration `20260723150000_reverse_success_fee_note_required.sql`).
  Covered by `supabase/tests/fee_reversal_test.sql` and the route test
  `…/reverse-fee/__tests__/route.test.ts` (4 tests, incl. note-required → 400
  mapping).

### Agent-assisted onboarding attribution (`agent_assisted` + `assisted_by_agent_id`)
- **Status:** ✅ ready in repo (this branch).
- **Evidence:** `src/app/api/merchants/onboard/route.ts` forwards the selected
  agent id (UUID-validated; null → self-serve) as **attribution only** — the
  authenticated submitter is always the merchant; the `onboard_merchant` RPC
  validates the id against an active `agents` row and records the mode
  (migration `20260702083812` + merchant-authored redesign `…085628`).
  Tests: `supabase/tests/onboard_agent_attribution_test.sql` and
  `…/onboard/__tests__/route.test.ts` (5 tests).

### Phone required at claim + `/verify-phone` OTP + sanitized return URL
- **Status:** ✅ ready in repo (this branch).
- **Evidence:** `currentUserHasVerifiedPhone()` in `src/lib/auth.ts` (true only
  for a Clerk-verified phone); `src/app/api/redemptions/route.ts` returns typed
  `code: "phone_required"` (403) before the claim RPC; `/verify-phone` page
  drives Clerk phone OTP and returns to the deal with a sanitized `next`;
  `claim-flow.tsx` routes an email-only shopper through it. (S2 ruling
  2026-07-23.)

### Success-takeover "Collect from shopper KES N" line (distinct from the KES 30 fee)
- **Status:** ❌ **not implemented in repo.**
- **Evidence:** `src/components/ui/redemption-result.tsx` and the disclosure
  screen show **only** the KES 30 success fee (charged/arrears) + wallet
  balance + reference id. Neither the resolve screen nor the success takeover
  surfaces the shopper's YOU PAY amount for the merchant to collect at the
  counter. The YOU PAY model itself exists (`src/lib/pricing.ts`, shopper deal
  UI), but it is not echoed on the merchant redeem success screen.
- **Impact:** minor for the rehearsal (merchant can read YOU PAY on the deal),
  but it is a real product gap: the counter flow does not tell the merchant how
  much cash to take. Flagged as a repo follow-up in §3, **not** built this
  session (new UI surfacing a money amount; touches the resolve/verify RPC
  return shape — outside "obviously safe, non-behavioural").

### Guardian v1 (verify-time fraud checks) + Node 0 KES 300 credit
- **Status:** ✅ ready in repo.
- **Evidence:** `guardian_check` invoked post-claim in the claim route;
  velocity/geofence/collusion → clear/flag/soft-block/hard-block; thresholds in
  `app_config` (migrations `20260721140000`, `…22140000`, `…22160000`); tests
  `guardian_v1`, `guardian_thresholds_config`, `guardian_hard_block_appeal`.
  Node 0 opening credit on activation (migration `20260716084804`, test
  `node0_opening_credit_test.sql`).

### Zero-balance gate on deal creation
- **Status:** ✅ ready in repo. Migration `20260703190627_zero_balance_gate_deals.sql`.

### Auth (Clerk email + phone SMS OTP)
- **Status:** ⚠️ code ready; **prod config is human-owned**.
- **Evidence:** Clerk owns the session — `ClerkProvider` in `layout.tsx`,
  `clerkMiddleware()` in `src/middleware.ts`, `@clerk/nextjs/server` in
  `src/lib/auth.ts`; Supabase wired as a Clerk third-party auth provider
  (migration `20260720140000`, `docs/skills/clerk-auth.md`). **Caveat:** whether
  email OTP + phone SMS OTP are actually enabled in the Clerk dashboard is a
  live-config fact the repo cannot prove → §4. The `node0-rehearsal-checklist`
  auth section (which described the *old* Supabase-Auth email OTP + Supabase
  SMTP) was corrected this session.

### FX for non-KES top-ups
- **Status:** ⚠️ functional, not production-grade.
- **Evidence:** `src/lib/currency.ts` fetches live KES rates from
  `open.er-api.com` (keyless free tier), caches 6h, 5s timeout, static fallback
  if unreachable; `toKes()` tested in `src/lib/__tests__/currency.test.ts`.
  **Caveats:** (a) no `src/lib/fx/**` abstraction as the brief assumed — logic
  is inline; (b) free tier, no SLA — replacing it is tracker gate **E9** (not
  started; only matters if non-KES charges go live).

### healthz / config presence
- **Status:** ⚠️ narrow form only.
- **Evidence:** `GET /api/waitlist?healthz=1` returns booleans for the 3 Resend
  env vars (added for the E7 prod debug). There is **no** general
  `src/lib/health.ts` + `GET /api/healthz` liveness/admin-gated endpoint as the
  brief assumed. Building one is optional and listed as a repo follow-up (§3).

### Node 0 rehearsal seed + checklist
- **Status:** ✅ present (checklist corrected this session).
- **Evidence:** `supabase/seed/node0_rehearsal_seed.sql`;
  `docs/maanta-node0-rehearsal-checklist.md` (Supabase project ref + auth
  section corrected 2026-07-24 — see §3).

---

## §3 · Safe changes performed this session

All changes are docs-only; no code/behaviour touched.

1. **Created this audit** (`docs/skills/launch-audit-2026-07-24.md`) — satisfies
   the mandatory durable-artifact rule and the task's missing audit doc.
2. **`docs/maanta-node0-rehearsal-checklist.md`** — corrected two drift items
   that could actively mislead a rehearsal operator:
   - Supabase project ref `vcrfqsevompqjazbwzyh` (the **abandoned** project per
     `clerk-auth.md`) → the pinned live project **`axrrslqssmbngbataejg`**.
   - Auth section rewritten from the old Supabase-Auth email-OTP + Supabase-SMTP
     instructions to reflect that **Clerk** now owns auth (email + phone SMS OTP
     configured in the Clerk dashboard), and that phone SMS OTP is what powers
     the phone-at-claim gate. Dated inline.
3. **`docs/maanta-launch-readiness-tracker.md`** — added a dated pointer to this
   audit and reflected this branch's merged work (phone-at-claim, fee-reversal
   note-required).

### Repo follow-ups identified but **not** built this session (need an owner/ticket)
These are real but are new behaviour/subsystems without an existing audit item,
so per the session constraints they were flagged rather than implemented:
- "Collect from shopper KES N" line on the merchant redeem resolve/success
  screen (needs the resolve/verify RPC to surface YOU PAY).
- General `/api/healthz` + `src/lib/health.ts` (if a liveness probe beyond the
  waitlist config check is wanted).
- Playwright browser golden path (E14 / PR #35) — gated on a live Supabase +
  Clerk test env; deliberately unscaffolded until then.
- Optional refactor of FX out of `currency.ts` into `src/lib/fx/**` (cosmetic;
  only worth it alongside the E9 SLA-provider swap).

---

## §4 · Human-only tasks (cannot be done from the repo)

Owner for all: **Human (founder / ops / engineering / legal)**. Inputs list the
repo docs to consult.

### A) BBS rehearsal (near-term)
1. **Supabase — apply migrations to the live project.** Link/apply all
   migrations in `supabase/migrations/` to **`axrrslqssmbngbataejg`** and run
   the SQL assertion suites there. Inputs: `docs/skills/clerk-auth.md`,
   `docs/skills/prod-handoff-security-audit-2026-07-23.md`.
   *(There is no Makefile "verify" target — this is manual: Supabase SQL editor
   or `supabase db push` from a human-linked CLI, then run `supabase/tests/*.sql`
   with `ON_ERROR_STOP=1`.)*
2. **Supabase — apply the Node 0 rehearsal seed.** Run
   `supabase/seed/node0_rehearsal_seed.sql` in the live project's SQL editor.
   Inputs: `docs/maanta-node0-rehearsal-checklist.md`.
3. **Vercel — confirm `NEXT_PUBLIC_SUPABASE_URL`** points at
   `https://axrrslqssmbngbataejg.supabase.co` (not the abandoned project).
   Inputs: `docs/skills/clerk-auth.md`.
4. **Clerk — configure email + phone (SMS OTP)** so phone is optional at sign-up
   but available for `/verify-phone`, and confirm the claim gate works end-to-end
   in the live app. Inputs: `src/lib/auth.ts`, `docs/skills/clerk-auth.md`.
5. **Email/SMTP — confirm production signup/login email deliverability** (Clerk
   email OTP + Resend transactional). Inputs: `docs/maanta-waitlist-data-schema.md`.
6. **Monitoring — set env vars + confirm dashboards.** PostHog (4 vars, tracker
   E16 — no-op until set) and Sentry. Confirm health + key events show up.
   Inputs: `docs/skills/sentry-monitoring.md`, tracker E16.
7. **Waitlist — deploy + read `?healthz=1` + verify first prod signup** lands in
   the Resend segment. Inputs: tracker E7.
8. **On-site logistics** — devices, staff training, one-page counter runbooks for
   fee reversal, disputes, and agent-assisted onboarding. Inputs:
   `docs/maanta-launch-ops-runbook.md`, `docs/skills/redemption-disputes.md`,
   `docs/skills/fee-reversals.md`.

### B) Real shopper launch (later)
1. **Money rails — M-Pesa / IntaSend.** Obtain account access, validate live STK,
   reconcile settlements (tracker **E6**, blocked). Inputs:
   `docs/skills/payments-rails.md`, `src/lib/intasend.ts`.
2. **Stripe — live-mode cutover** and `STRIPE_ENV` guard verification (tracker
   E5/E10). Inputs: `src/lib/stripe.ts`.
3. **FX — replace the free provider with an SLA-backed source** and decide
   production FX rules/margin disclosure before any non-KES charges (tracker
   **E9**). Inputs: `src/lib/currency.ts`.
4. **Env completeness + hardening** — audit and lock all prod env vars for auth,
   payments, monitoring, feature gates (tracker E10). Inputs:
   `docs/skills/security-hardening.md`, `docs/skills/prod-handoff-security-audit-2026-07-23.md`.
5. **Trial-expiry job scheduling** confirmed to actually run in prod Supabase
   (tracker **E11**). Inputs: migration `20260701111223`.
6. **Data protection / legal** — lawyer-reviewed contracts, Kenya DPA
   cross-border basis for Supabase region, published privacy commitments
   (tracker **O5/O6**, blocked on incorporation). Inputs: `maanta-app/legal/`.
7. **Full ops runbooks** — incident response, Guardian/fraud escalation,
   fee-reversal + 72h dispute SLA, agent onboarding/offboarding. Inputs:
   `docs/maanta-launch-ops-runbook.md`, `docs/skills/redemption-disputes.md`.
8. **Browser E2E gating** (Playwright, tracker E14 / PR #35) once a live test env
   exists — automates the E2–E4 device passes.

---

## §5 · Bottom line

- **Repo:** the BBS-rehearsal golden path, fee/arrears, fee-reversal-with-note,
  agent attribution, phone-at-claim, Guardian v1, and the Node 0 credit are
  **implemented and tested in repo** (94 vitest + 15 SQL suites). The one real
  product gap on the rehearsal path is the missing "Collect from shopper" line.
- **Prod:** **unproven from here.** Migrations applied to
  `axrrslqssmbngbataejg`, Vercel/Clerk/monitoring config, and every money rail
  are human-owned (§4). Do **not** read this audit as "prod is hardened / launch
  ready" — it certifies the repo, and lists what a human must still verify live.
</content>
</invoke>
