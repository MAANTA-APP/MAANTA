# MAANTA — Production Rollout Plan (main → live)

**Prepared by:** release-engineering session, 2026-07-24
**Scope:** promote current `main` (Merge #72, `6618559`) — the S1–S2–S3–M3–M4
experience — to production for real BBS Mall (Node 0) users, preserving every
money-path and safety invariant.
**Nature of this document:** a procedure + checklist for **humans**. Claude Code
does not run any production change here (repo-only). Dashboard/config/DB steps
are done by a human operator with the right credentials.

> **Companion docs (read alongside):**
> `docs/ops/supabase-migrations.md` (exact CLI commands + verification SQL),
> `docs/skills/prod-handoff-security-audit-2026-07-23.md`,
> `docs/skills/sentry-monitoring.md`, `docs/maanta-launch-ops-runbook.md`,
> `docs/maanta-guardian-v1.md`, `docs/ops/e2e-golden-path.md`.

---

## 0. TL;DR — the one blocker you must clear first

**The production database is NOT in sync with `main`, in *both* directions.**
Do not promote the frontend until this is reconciled and the migrations are
applied. Nothing else in this plan is blocked; this is.

**State as originally discovered** (before this PR): repo had **61** migrations,
prod had **50** applied. They share **49**, which reconciles both directions:

| Direction | Count | Detail |
|---|---:|---|
| **Repo → prod (pending)** | **12** | Migrations `20260721120000` onward, in the repo but **not applied** to prod (topup-settles-arrears, Guardian v1, admin fee-reversal, Guardian thresholds, Guardian hard-block appeal, lock-down internal money RPCs, capture-lead atomic (+ambiguity fix), revoke-authenticated-writes, browse-views security-invoker, admin-ops-log, reverse-success-fee-note). `61 = 49 shared + 12`. |
| **Prod → repo (drift, not in repo)** | **1** | `20260723001651_lock_down_merchant_financial_columns` was **applied on prod but had no file in the repo.** Confirmed live: the DB has `public.protect_merchant_financial_columns()` (flagged by the security advisor). Violates "repo is source of truth for schema." `50 = 49 shared + 1`. |

**What this PR does to reconcile:** back-fills the 1 drift migration into the
repo (so it's no longer drift, and `db push` skips it on prod) **and** adds 1
new forward migration `20260724120000` that **drops** the guard (money-path fix —
see below). Net for **Phase B**: `supabase db push` applies **13** migrations to
prod — the 12 pending + the new drop; the back-fill stays skipped.

Why it blocks the deploy: `main`'s **server code depends on the pending
migrations** — the reverse-fee route needs `fee_reversals` + the reversal RPC,
admin actions need `admin_ops_log`, the waitlist needs the atomic
`capture_lead`, and the redeem path expects the Guardian-aware
`verify_redemption`. Ship the code without the schema and those paths 500 in
production. **DB goes first, then the frontend.**

> **Latent money-path bug the reconcile caught (now fixed).** Bringing the
> prod-only back-fill into the full migration chain revealed that
> `protect_merchant_financial_columns` (the hand-applied trigger) **breaks the
> core money-path**: the app calls `verify_redemption` / `purchase_boost` /
> `move_boost` with the signed-in user's client, so `auth.role()` is
> `authenticated` inside those SECURITY DEFINER RPCs, and their legitimate
> internal writes (trust recalculation, KES 30 fee debit / arrears, boost
> balance debit) are rejected with `protected_column`. On prod this is latent
> only because no live redemption has run since the trigger was applied — the
> rollout would expose it on day one. **Fixed by dropping the trigger** in
> `20260724120000_drop_redundant_merchant_financial_guard.sql`: it adds no
> protection beyond `20260723120000_revoke_authenticated_writes_core_tables`
> (which already revokes `UPDATE` on `merchants` from `authenticated`, so a
> direct client write can't reach these columns — proven by
> `revoke_authenticated_writes_core_tables_test` Scenario B), and every
> *legitimate* writer runs under a merchant's authenticated JWT, so the
> `auth.role()` check can't separate sanctioned writes from abuse anyway.
> Dropping it also removes the function the security advisor flagged (0028/0029).
> Regression-covered by `security_hardening_test.sql` Scenario D (merchant-driven
> verify now succeeds). Applies to repo **and** prod in Phase B; the faithful
> back-fill (`20260723001651`) is retained so the histories still reconcile.

Facts confirmed this session:
- Prod project ref **`axrrslqssmbngbataejg`** (MAANTA-APP org, eu-west-1, PG 17,
  `ACTIVE_HEALTHY`). 50 migrations applied; repo has 61.
- **maskedPhone / verifiedAt need NO migration** — both are read-only/derived
  (`maskPhone(users.phone)` and `new Date().toISOString()` in
  `src/app/api/redemptions/verify/route.ts`). Confirmed against the code.
- **No data-destructive DDL** in any pending migration — no table/column drops,
  no `TRUNCATE`/`DELETE`, nothing that loses rows. There are two deliberate,
  non-data DROPs: (1) `DROP FUNCTION public.verify_redemption(...)` in
  `guardian_v1`, immediately re-created with Guardian logic (a function swap);
  and (2) `20260724120000_drop_redundant_merchant_financial_guard.sql`, which
  **`DROP TRIGGER` + `DROP FUNCTION`** to remove the redundant merchant-financial
  guard (the money-path fix — intentional object removal, no data touched; the
  column protection stays enforced by the table-grant revoke). Both are
  money-path-sensitive; apply in a low-traffic window.

---

## Rollout plan (numbered, code → live)

Legend: **[CODE]** = repo commit/PR · **[CFG]** = dashboard/config change ·
**[DB]** = database migration · **[HUMAN-APPROVE]** = requires explicit human
sign-off (money rails / flags / irreversible).

### Phase A — Reconcile the database drift (do this first)
1. **[DB][HUMAN-APPROVE]** Reconcile the prod-only migration
   `20260723001651_lock_down_merchant_financial_columns`.
   - **DONE (this branch):** the missing SQL has been **back-filled** into the
     repo as
     `maanta-app/supabase/migrations/20260723001651_lock_down_merchant_financial_columns.sql`,
     reconstructed verbatim from the live objects (`pg_get_functiondef` /
     `pg_get_triggerdef`). Prod already records version `20260723001651`, so
     `supabase db push` **skips it on prod** (no re-run); the file exists so
     fresh DBs (CI `db-tests`, staging, rebuilds) reproduce prod's exact state in
     the correct filename order (after `…722200000`, before `…723120000`).
   - **Human step:** verify LOCAL == REMOTE for that version with
     `supabase migration list`, and validate the file on a throwaway stack with
     `make db-verify` (local only). Merge this branch into `main` before promotion.
   - **Faithfulness note:** the back-fill reproduces prod's trigger as-is (do not
     edit it). The trigger is then **dropped** by the forward migration below —
     which both fixes the money-path break and removes the function the advisor
     flagged (0028/0029), so there is nothing left to harden.
   - **DONE (this branch):** forward migration
     `20260724120000_drop_redundant_merchant_financial_guard.sql` drops the
     trigger + function on repo and prod (see the money-path callout above). It is
     a **new** version, so `supabase db push` **applies it to prod** in Phase B.
     Verified indirectly by `security_hardening_test.sql` Scenario D (merchant
     verify succeeds) and `revoke_authenticated_writes_core_tables_test.sql`
     (the table-grant control that actually protects the columns); CI `db-tests`
     runs both on every PR.
2. **[DB]** Confirm the app really points at `axrrslqssmbngbataejg`: read Vercel
   Production `NEXT_PUBLIC_SUPABASE_URL` and check it contains that ref. If not,
   stop and fix the env first (never push to the old ref `vcrfqsevompqjazbwzyh`).

### Phase B — Apply pending migrations (staging first, then prod)
3. **[DB]** In a **staging / preview DB** (Supabase branch or a throwaway
   project) apply all pending migrations (the 12 feature/hardening migrations +
   the new `20260724120000` migration that drops the redundant guard = 13) with
   `supabase db push --dry-run`
   then `supabase db push`, and run the SQL test subset from
   `docs/ops/supabase-migrations.md §5`. Because prod has an out-of-order version
   (`20260723001651` sorts *after* several pending local versions), verify the
   CLI applies the older-numbered pending migrations cleanly here **before**
   touching prod — this is exactly what staging is for.
4. **[DB]** Compare staging vs prod schema after step 1's reconcile so the only
   difference is "the not-yet-applied migrations."
5. **[DB][HUMAN-APPROVE]** Take a prod **PITR snapshot / backup**, then in a
   low-traffic window run `supabase db push` against prod
   (`make db-push`). `db push` is **forward-only — no auto-rollback.** Then run
   the read-only verification SQL (§5 of the ops doc): six+ hardening versions
   present, core-table writes revoked from `authenticated`, `admin_ops_log` /
   `guardian_events` / `fee_reversals` exist, internal money RPC is
   service-role-only. **Also confirm the redundant guard is actually gone**
   (otherwise a partially reconciled DB would still block the money-path):
   ```sql
   -- Expect both false: the trigger and its function must NOT exist post-push.
   SELECT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'trg_protect_merchant_financial_columns'
              AND NOT tgisinternal
          ) AS trigger_present,
          to_regprocedure('public.protect_merchant_financial_columns()') IS NOT NULL
            AS function_present;
   ```
6. **[DB]** Re-run the Supabase **security advisor** after the push. Several
   pending migrations (revoke-authenticated-writes, lock-down internal money
   RPCs, anon least-privilege) should *reduce* warnings; confirm no new ones.

### Phase C — Environment configuration
7. **[CFG][HUMAN-APPROVE]** Verify Vercel **Production** env vars against
   `Configs and secrets` below — real prod keys only, no test/staging values.
   Pay special attention to the **Clerk instance**: `supabase/config.toml`
   pins the **development** instance `cheerful-sailfish-3.clerk.accounts.dev`.
   Production must use a **Clerk Production instance** (`pk_live_…` / `sk_live_…`)
   with a custom domain (e.g. `clerk.maanta.app`) and matching Supabase
   third-party-auth `domain`. Flipping Clerk dev→prod is a **[HUMAN-APPROVE]**
   auth-rail change.
8. **[CFG]** Set/verify `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and confirm the
   Sentry `environment` resolves to `production` (see Monitoring below).

### Phase D — Staging smoke test & sign-off
9. **[CFG]** Ensure a **staging/preview deployment runs current `main`**
   (Vercel preview from `main`, pointed at the staging DB from Phase B).
10. **[HUMAN-APPROVE]** Complete the **Staging sign-off** checklist below
    (S1–S2–S3–M3–M4, cash-only, masked phone, EAT timestamps, read-only wallet
    header). All boxes ticked before promotion.

### Phase E — Promote to production
11. **[CFG]** Confirm all CI checks green on `main` (`ci.yml`: lint, typecheck,
    vitest, build, `db-tests`) and staging sign-off done.
12. **[CFG][HUMAN-APPROVE]** Promote: trigger the Vercel **Production** deploy
    from `main` (Git → Production branch, or "Promote to Production" on the
    passing preview). The **release owner** (a human role, e.g. eng lead) presses
    Deploy. DB (Phase B) must already be applied.
13. **[CODE]** Ensure the deploy records a Sentry **release** tagged with the
    commit and `environment: production` (see Monitoring). Confirm the deploy
    email/notification shows `vercel-production`.

### Phase F — Post-deploy verification
14. **[CFG]** Hit `GET /api/healthz` (public liveness) — expect `status: ok` and
    the deployed short commit SHA. As an admin, hit `/api/healthz?detail=1` and
    confirm every production rail shows `true` (Supabase, Clerk, Sentry; payments
    per launch posture).
15. **[HUMAN-APPROVE]** Run the **Money-path invariants** spot-checks below on
    prod (one masked-phone redemption journey, EAT timestamp, no card UI).
16. Watch Sentry / Supabase / Vercel per **Monitoring and rollback** for the
    first 30–60 min and through the first real redemptions.

---

## Configs and secrets (checklist to verify in Production)

Source of truth for names: `.env.example` + `src/lib/health.ts` (`envPresence`).
Verify each is present **and** is a real production value (no `_test` / placeholder).

**Supabase**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` → contains `axrrslqssmbngbataejg`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` → prod anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` → prod service-role key (server-only; never `NEXT_PUBLIC`)

**Clerk (auth)** — must be the **Production** instance
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_…`
- [ ] `CLERK_SECRET_KEY` = `sk_live_…`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `…SIGN_UP_URL=/sign-up`,
      `…SIGN_IN_FALLBACK_REDIRECT_URL=/select-mall`, `…SIGN_UP_FALLBACK_REDIRECT_URL=/select-mall`
- [ ] Clerk dashboard → **Production** instance configured for Supabase
      compatibility (session token carries `role: authenticated`)
- [ ] Supabase → Auth → third-party `clerk` `domain` matches the **prod** Clerk
      domain (NOT `cheerful-sailfish-3.clerk.accounts.dev`)

**Sentry (monitoring)**
- [ ] `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` set (org `maanta`, project `javascript-nextjs`)
- [ ] Deploy resolves `environment: production` (see Monitoring note — currently
      wired to `NODE_ENV`, which Vercel sets to `production`)
- [ ] `SENTRY_AUTH_TOKEN` in the Vercel/CI build env for source-map upload

**App / identity**
- [ ] `NEXT_PUBLIC_APP_URL=https://maanta.app` (live domain)
- [ ] `NODE_ENV=production` (Vercel sets automatically on Production)

**Payments (launch posture — Node 0 is cash-only for shoppers)**
- [ ] Stripe kept in **sandbox/test** during testing (`STRIPE_ENV` unset/not `live`);
      `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are merchant **top-up** rails only
- [ ] IntaSend (M-Pesa STK, merchant top-up) — availability **not assumed**;
      `INTASEND_ENV` stays sandbox unless a human flips it. There is **no shopper
      checkout** either way.

**Analytics / email / push / geo (non-blocking)**
- [ ] `POSTHOG_PROJECT_KEY` (+ `POSTHOG_HOST` EU) — server capture off if unset
- [ ] `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `RESEND_FROM_EMAIL` (verified domain)
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- [ ] `W3W_API_KEY`

**If we change the domain, update these 3 places (in this order):**
1. **Vercel** — Production domain + `NEXT_PUBLIC_APP_URL`.
2. **Supabase** — Auth → URL Configuration: Site URL + Redirect URLs → live domain.
3. **Clerk** — Production instance allowed origins / redirect URLs / custom domain (CNAME).

---

## Staging sign-off (humans tick before approving Production)

Run the full loop on the **staging deployment of `main`** (staging DB from Phase B):

- [ ] **S1 `/feed`** — loading, empty, and error states each render (no crash / blank).
- [ ] **S2 `/verify-phone`** — 6-box OTP; paste + type; 6-digit gate; ~1.2s success
      dwell then redirect; resend cooldown; timer cleared on unmount (no double-redirect).
- [ ] **S3 `/deals/[id]` & `/tickets/[id]`** — "YOU PAY" emphasis correct; ticket
      card "breathes"; **collect/you-pay amount is display-only**, not an in-app charge.
- [ ] **M3 `/merchant/redeem`** — discloses Collect-from-shopper, MAANTA fee, wallet
      balance; "Cancel charges nothing"; wallet header + chevron present.
- [ ] **M4 Redeemed takeover** — cash-only copy; **masked** shopper phone only
      (e.g. `+254 7xx xxx 678`); server-issued `verifiedAt` shown.
- [ ] **Cash-only:** no card / checkout / "Pay now" UI anywhere in the shopper flow.
- [ ] **Masked phone only:** raw shopper number never appears in DOM/network on
      merchant screens.
- [ ] **Timestamps:** redeemed time reads in **Africa/Nairobi (EAT)** and matches
      server time (formatted from the server `verifiedAt`, not the device clock).
- [ ] **Wallet header + chevron** render and are **read-only** (no balance mutation
      from the header).
- [ ] Playwright `test:e2e` golden path green **against the staging URL** (never a
      `*maanta.app*` host — the suite charges a real KES 30 fee and self-guards
      against prod; see `e2e.yml`).
- [ ] CI on `main` fully green (lint, typecheck, vitest, build, `db-tests`).

**Sign-off:** _release owner_ ______  _QA_ ______  date ______

---

## Monitoring and rollback

**Watch (first 30–60 min, then through first real redemptions):**
- **Sentry** — filter to `environment:production` and the new release; watch
  `verify_redemption` / redeem, webhook (`logWebhookFailure`), and auth errors.
  Note: `sentry.server.config.ts` sets `environment: process.env.NODE_ENV`;
  Vercel Production sets `NODE_ENV=production`, so prod events tag `production`.
  Confirm the first event's environment tag before relying on alerts.
- **Supabase** — DB health, connections, auth error rate, `payment_webhook_failures`
  table, `admin_ops_log` / `guardian_events` populating as expected. Re-check the
  security advisor post-push.
- **Vercel** — Production deployment status, function latency, and **5xx rate** on
  `/api/redemptions/*`, `/api/webhooks/*`, `/api/healthz`.

**Rollback (fast, code path):**
1. In Vercel → Deployments, **Promote the previous successful Production
   deployment** (instant re-point; or redeploy the prior commit / pin the older
   commit). This reverts the frontend without a rebuild.
2. Because migrations are **forward-only**, a code rollback leaves the newer
   schema in place. The pending migrations are **additive + additive-grant**
   (no data drops), so the previous code runs fine on the newer schema — that's
   why DB-first ordering is safe. Do **not** attempt to "roll back" the DB; if a
   specific migration misbehaves, write a **forward fix** migration.

**Rollback / freeze triggers (any one → roll back frontend + freeze sign-ups):**
- Sentry error rate on redeem/verify or webhooks **> ~5 errors/min** sustained,
  or any spike of a brand-new error class tied to this release.
- **Any wallet/fee anomaly:** a KES 30 fee debited more than once per redemption,
  a fee debited on a Cancel, an arrears row that shouldn't exist, or a wallet
  balance that moves without a matching ledger entry.
- **Any card/checkout UI** appearing in the shopper flow (invariant breach).
- Auth failures blocking real users at `/verify-phone` / login above baseline.

Freeze new sign-ups by disabling the sign-up path (Clerk restriction or a
maintenance gate) while you roll back — keep existing sessions working so
in-progress redemptions at the counter aren't stranded.

---

## Money-path invariants (must hold after rollout)

These are the frozen rules (see `CLAUDE.md` + `docs/maanta-decisions-log.md`).
Validate each on prod after deploy.

1. **No in-app shopper payment / card flow.** Shopper pays cash at the counter.
   *Validate:* walk S3 → ticket → M4; grep the shipped shopper bundle for any
   Stripe/checkout element — there must be none. `collectAmount` / "YOU PAY" is a
   **display** figure, not a charge.
2. **KES 30 success fee unchanged** — one fee per verified redemption, debited at
   merchant verification, recorded as arrears if the wallet can't cover it.
   *Validate:* one real redemption → exactly one fee ledger entry; confirm a
   zero-balance merchant records arrears (not a double debit) and the
   zero-balance gate still blocks new deal creation.
3. **Node 0 opening credit, Guardian thresholds, arrears logic behave exactly as
   before.** These now live in the just-applied migrations (`guardian_v1`,
   `guardian_thresholds_config`, `guardian_hard_block_appeal`,
   `node0_opening_credit_on_activation`, `topup_settles_arrears_first`).
   *Validate:* spot-check `guardian_events` populates on a redemption; a top-up on
   a merchant in arrears settles arrears first; thresholds match
   `docs/maanta-guardian-v1.md`.
4. **Phone numbers always masked client-side-safe.** The full number never leaves
   the server; only `maskPhone()` output reaches the client.
   *Validate:* inspect the M4 network response — `maskedPhone` only, no raw `phone`.
5. **Redeemed timestamps are server-driven and labelled.** `verifiedAt` is issued
   by the server (`new Date().toISOString()`); the client formats it to EAT.
   *Validate:* the M4 time matches server time in Africa/Nairobi, not the device.
6. **Reverse-fee requires a note; every admin money action is audited.**
   (`reverse_success_fee_note_required`, `admin_ops_log`.)
   *Validate:* a fee reversal without a note is rejected; the action lands in
   `admin_ops_log`.

**How to validate in prod:** the read-only SQL subset in
`docs/ops/supabase-migrations.md §5` (grants, audit tables, RPC privileges), one
real end-to-end redemption journey with a test merchant, and an audit-log spot
check. Do the paid redemption with an internal merchant/phone, in a low-traffic
window, and reconcile the single KES 30 debit afterwards.

---

## Who does what (roles, not names)

| Step | Owner |
|---|---|
| Reconcile drift migration into repo (Phase A) | Backend/eng |
| Apply migrations to staging + prod (Phase B) | Operator w/ Supabase CLI + prod creds |
| Verify env/secrets, Clerk dev→prod (Phase C) | Eng lead **(approves auth/money rails)** |
| Staging sign-off (Phase D) | Release owner + QA |
| Press "Deploy" to Production (Phase E) | **Release owner** |
| Post-deploy money-path spot checks (Phase F) | Eng + ops |
| Rollback / freeze decision | Release owner (on trigger) |

**Preconditions to press Deploy:** drift reconciled · all pending migrations applied to
prod + verified · all env/secrets confirmed prod values · CI green on `main` ·
staging sign-off complete.
