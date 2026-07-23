# MAANTA — Security audit prod handoff (2026-07-23)

Handoff for **Claude Code** and human operators. Repo analysis only — no prod
changes performed in this document's authoring session.

**Related:** `docs/skills/security-audit-summary-2026-07-23.md`,
`docs/skills/security-hardening.md`, `docs/skills/clerk-auth.md`

---

## Claude Code summary

### Repo security state (PRs #59–#61, merged to `main`)

| PR | What it closed |
|---|---|
| **#59** | **C-1/C-2/C-3** — Revoked `INSERT`/`UPDATE`/`DELETE` on `merchants`, `deals`, `redemptions` from `authenticated`. Legit mutations stay on `service_role` API routes + SECURITY DEFINER RPCs. |
| **#60** | **H-1** — Anon browse views (`merchants_public_browse`, `deals_public_browse`) use `security_invoker = false`. **H-2** — `getAppOrigin()` fails closed in prod (no localhost Stripe redirects). **H-3** — IntaSend webhook JSON guarded. **M-1/M-2** — Rate limits on waitlist (per IP) and W3W validate (per user). |
| **#61** | **M-3** — `admin_ops_log` table + `logAdminOp()` on all 9 `/api/admin/*` mutation routes. |

**Still open (code or ops):** E10 env-vars audit on Vercel, FX live verification,
Playwright E2E CI gating (PR #35 open, not merged), Supabase advisor items
(`pg_graphql_*`, legacy SECURITY DEFINER RPCs).

### Live Supabase project (read before any migration apply)

| Project ref | Status |
|---|---|
| **`axrrslqssmbngbataejg`** | **LIVE** per `docs/skills/clerk-auth.md` — MAANTA-APP org, Clerk third-party auth |
| `vcrfqsevompqjazbwzyh` | Abandoned (old org); **do not apply** unless Vercel still points here |

Confirm via Vercel `NEXT_PUBLIC_SUPABASE_URL` before applying migrations.

---

### Migrations & tests map

#### Six production migrations (apply in order)

| # | File path |
|---|---|
| 1 | `maanta-app/supabase/migrations/20260722180000_lock_down_internal_money_rpcs.sql` |
| 2 | `maanta-app/supabase/migrations/20260722190000_capture_lead_atomic.sql` |
| 3 | `maanta-app/supabase/migrations/20260722200000_fix_capture_lead_column_ambiguity.sql` *(only if #2 applied without this fix)* |
| 4 | `maanta-app/supabase/migrations/20260723120000_revoke_authenticated_writes_core_tables.sql` |
| 5 | `maanta-app/supabase/migrations/20260723130000_fix_browse_views_security_invoker.sql` |
| 6 | `maanta-app/supabase/migrations/20260723140000_admin_ops_log.sql` |

#### SQL regression suites (`maanta-app/supabase/tests/`)

**Audit-focused (run after applying #48–#61 migrations):**

| File | Validates |
|---|---|
| `security_hardening_test.sql` | Scenarios A–H (incl. scenario H → migration #1) |
| `capture_lead_test.sql` | Scenarios A–C → migrations #2/#3 |
| `revoke_authenticated_writes_core_tables_test.sql` | Scenarios A–E → migration #4 |
| `browse_views_test.sql` | Scenarios A–B → migration #5 |
| `admin_ops_log_test.sql` | Scenarios A–B → migration #6 |

**Full CI suite (14 files, `.github/workflows/ci.yml` job `db-tests`):**

`fee_reversal_test.sql`, `golden_path_test.sql`, `guardian_hard_block_appeal_test.sql`,
`guardian_thresholds_config_test.sql`, `guardian_v1_test.sql`,
`node0_opening_credit_test.sql`, `success_fee_reference_link_test.sql`,
`topup_settles_arrears_test.sql`, `verify_redemption_money_path_test.sql`,
plus the five audit-focused files above.

**CI command shape** (local or prod `psql`):

```bash
cd maanta-app
export DATABASE_URL="postgresql://..."
for f in supabase/tests/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

---

### Env-vars usage

Source of truth for names: `maanta-app/.env.example`. Below maps **code behaviour**.

#### Auth (required for any signed-in flow)

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/server.ts`, `service.ts`, client | Wrong project → wrong data / RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same | Must match live project |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/service.ts` | Throws if unset; bypasses RLS — server-only |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk `<ClerkProvider>` | Required for auth UI |
| `CLERK_SECRET_KEY` | Clerk server | Required for session |

No localhost fallback on Supabase URLs.

#### App origin (audit H-2)

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `src/lib/app-url.ts` → `src/app/api/topup/stripe/route.ts` | **Development only:** falls back to `http://localhost:3000`. **Production:** returns `null` → Stripe checkout **503**. Safe fail-closed. |

#### Stripe

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `STRIPE_SECRET_KEY` | `src/lib/stripe.ts`, webhooks | Throws if unset |
| `STRIPE_ENV` | `src/lib/stripe.ts` | **Not `live` → test mode.** Refuses `sk_live_*` without `STRIPE_ENV=live`; refuses `STRIPE_ENV=live` with test key |
| `STRIPE_WEBHOOK_SECRET` | `src/app/api/webhooks/stripe/route.ts` | Missing → 401 + `payment_webhook_failures` row |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `.env.example` only in repo scan | Client Stripe.js if used |

#### IntaSend (M-Pesa)

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `INTASEND_ENV` | `src/lib/intasend.ts` | **Unset → sandbox URL** (`sandbox.intasend.com`). Same key-mismatch guard as Stripe |
| `INTASEND_API_KEY` / `INTASEND_SECRET` | `src/lib/intasend.ts` | Missing → STK returns null → 502 |
| `INTASEND_WEBHOOK_SECRET` | `verifyWebhookChallenge()` | Invalid challenge → 401 |

#### Monitoring

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `SENTRY_DSN` | `sentry.server.config.ts`, `sentry.edge.config.ts`, `merchant-ledger.ts` | Unset → no-op (safe) |
| `NEXT_PUBLIC_SENTRY_DSN` | `sentry.client.config.ts` | Unset → no-op |
| `SENTRY_AUTH_TOKEN` | `next.config.mjs` (source maps) | Build-time only |

#### Analytics (PostHog)

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `POSTHOG_PROJECT_KEY` | `src/lib/analytics.ts` (server) | Unset → server capture no-op (safe) |
| `POSTHOG_HOST` | `src/lib/analytics.ts` | Defaults to `https://eu.i.posthog.com` |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | `src/components/posthog-provider.tsx` (client) | **Not in all docs** — client init uses this name, not `POSTHOG_PROJECT_KEY` |

#### Other production-safety

| Variable | Where used | Unsafe default / risk |
|---|---|---|
| `W3W_API_KEY` | `src/app/api/w3w/validate/route.ts`, `src/lib/what3words.ts` | **Prod without key → fail closed** (503 validate). Dev → `unverified: true` |
| `NODE_ENV` | `app-url.ts`, W3W validate | Set by Vercel in production |

---

### FX / top-up behaviour

#### Routes

| Path | Currency | FX |
|---|---|---|
| `POST /api/topup` | **KES only** (M-Pesa STK) | None |
| `POST /api/topup/stripe` | `KES` default; accepts `USD`/`EUR`/`GBP` via body | Checkout in requested currency |
| `POST /api/webhooks/stripe` | Reads session currency | `toKes()` in `src/lib/currency.ts` |
| `POST /api/webhooks/intasend` | KES implied | No FX |

#### RPC / ledger

- All wallet credits go through **`record_merchant_ledger_entry`** (`src/lib/merchant-ledger.ts`).
- **Top-ups settle arrears first**, then credit balance (`20260721120000_topup_settles_arrears_first.sql`).
- Non-KES Stripe top-up: webhook writes `merchant_transactions` with:
  - `amount` = **KES credited** (after `toKes`)
  - `currency` = charged currency (e.g. `USD`)
  - `charged_amount` = original amount
  - `payment_provider` = `stripe`
  - `provider_reference` = Stripe Checkout Session id (idempotent)
- If merchant has `outstanding_arrears > 0`, expect an additional `arrears_settlement` row (negative amount) in the same RPC transaction.

#### FX provider

- Live: `https://open.er-api.com/v6/latest/KES` (6h cache, 5s timeout).
- Fallback static rates if provider down (`FALLBACK_KES_RATE` in `currency.ts`) — **approximate**; log line `Live FX rate fetch failed`.

#### UI note

`src/app/merchant/(app)/topup/topup-flow.tsx` sends `{ amount }` only to Stripe (KES default). **Non-KES FX test requires API call with `currency` field** (curl or devtools).

---

### Playwright / E2E status

| Item | Status |
|---|---|
| **In `main`** | **No Playwright config, no `e2e/` tests, no `playwright` npm script** (`package.json` has only `vitest`) |
| **PR #35** | Open: `test(e2e): browser-visible golden-path Playwright suite` — **not merged** |
| **CI** | `.github/workflows/ci.yml` runs lint, typecheck, vitest, build, `db-tests` (SQL) — **no browser E2E job** |
| **RPC golden path** | `supabase/tests/golden_path_test.sql` gates money invariants in CI |
| **Tracker** | E14 in `docs/maanta-launch-readiness-tracker.md` — not started on `main` |

---

## Human-only tasks

Tasks that require dashboard access, prod credentials, legal judgment, or real
money — cannot be done from repo-only automation.

### 1. Apply six migrations to production Supabase

- **Why human:** Needs live DB credentials and correct project selection.
- **Tool:** Supabase Dashboard SQL Editor and/or `supabase link` + `supabase db push` from a machine with CLI access.
- **Precondition:** Confirm live ref is `axrrslqssmbngbataejg` (or whatever Vercel uses).
- **Done when:** `SELECT version FROM supabase_migrations.schema_migrations` includes all six versions; spot-check grants (see runbook).

### 2. Run SQL regression suites on production

- **Why human:** Needs prod `DATABASE_URL`; tests mutate DB (self-cleaning but still ops action).
- **Tool:** `psql` with prod connection string.
- **Precondition:** Migrations applied.
- **Done when:** All chosen test files end with `ALL … scenarios passed` notices; no `__test%` residue.

### 3. E10 — Audit and set Vercel production env vars

- **Why human:** Secrets live in Vercel/Supabase dashboards, not in repo.
- **Tool:** Vercel → Project → Settings → Environment Variables (Production).
- **Precondition:** Know intended payment mode (test vs live for launch).
- **Done when:** Checklist in runbook verified; redeploy triggered; Stripe/IntaSend guards pass smoke test.

### 4. Supabase dashboard: Clerk third-party auth + API keys

- **Why human:** Dashboard configuration.
- **Tool:** Supabase project settings; Clerk dashboard (`cheerful-sailfish-3` per `config.toml`).
- **Precondition:** Live project identified.
- **Done when:** Clerk JWT works against Supabase; `current_user_id()` resolves in prod.

### 5. Real non-KES top-up + ledger verification

- **Why human:** Requires deployed app, Stripe test/live account, signed-in merchant, webhook delivery.
- **Tool:** Browser or curl + Stripe Dashboard + Supabase SQL Editor.
- **Precondition:** Migrations applied, env vars set, app deployed, webhook endpoint registered.
- **Done when:** `merchant_transactions` row shows correct `currency`, `charged_amount`, KES `amount`; balance updated.

### 6. Sentry / PostHog production configuration

- **Why human:** External SaaS projects and DSNs/tokens.
- **Tool:** Sentry.io, PostHog EU cloud.
- **Precondition:** Accounts provisioned.
- **Done when:** Test error appears in Sentry; test event in PostHog (client + server if keys set).

### 7. Playwright E2E CI gating decision

- **Why human:** Infra cost, Clerk test env, flake tolerance, merge decision on PR #35.
- **Tool:** GitHub PR review, CI workflow edit, Clerk test users.
- **Precondition:** Live or dedicated test Supabase + Clerk instance.
- **Done when:** Team decides merge/block PR #35 and whether to add CI job.

### 8. Legal / governance (Stripe Kenya, FX disclosure, data residency)

- **Why human:** Lawyer review, business decisions — not automatable.
- **Tool:** Legal counsel, `maanta-app/legal/` drafts, `docs/maanta-decisions-log.md`.
- **Precondition:** Product direction on worldwide card payments.
- **Done when:** Documented decision in decisions log; refund/wallet policy updated if FX goes live.

---

## Human runbook

### A. Production database & migrations

1. **Confirm target project:** Vercel `NEXT_PUBLIC_SUPABASE_URL` → note project ref.
2. **Check current state:**
   ```sql
   SELECT version FROM supabase_migrations.schema_migrations
   WHERE version LIKE '20260722%' OR version LIKE '20260723%'
   ORDER BY version;
   ```
3. **Apply missing migrations** in filename order (1→6). Prefer `supabase db push` from `maanta-app/`; fallback: paste each SQL file into Supabase SQL Editor.
4. **Spot-check after apply:**
   ```sql
   SELECT has_table_privilege('authenticated','public.merchants','UPDATE'); -- false
   SELECT to_regclass('public.admin_ops_log') IS NOT NULL;                  -- true
   ```
5. **Run SQL tests** (minimum audit subset or full CI suite):
   ```bash
   cd maanta-app && export DATABASE_URL="..." 
   for f in security_hardening_test.sql capture_lead_test.sql \
     revoke_authenticated_writes_core_tables_test.sql browse_views_test.sql \
     admin_ops_log_test.sql; do
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/tests/$f"
   done
   ```
6. **Verify no test residue:**
   ```sql
   SELECT COUNT(*) FROM merchants WHERE merchant_name LIKE '__test%';
   ```

**Done:** All six versions in `schema_migrations`; audit SQL tests pass; spot-checks match; zero `__test%` rows.

**Risk:** Apply during low-traffic window. Migrations are grant/view/table changes — brief lock possible. Do not apply to abandoned `vcrfqsevompqjazbwzyh` if app uses `axrrslqssmbngbataejg`.

---

### B. Env-vars & deployment

1. Open **Vercel → maanta-app → Production** environment variables.
2. Verify **auth:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Clerk keys.
3. Verify **`NEXT_PUBLIC_APP_URL=https://maanta.app`** (no trailing slash required; code strips it).
4. **Stripe (pre-launch test mode):** `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET`, unset or non-`live` `STRIPE_ENV`.
5. **IntaSend:** keys + `INTASEND_WEBHOOK_SECRET`; `INTASEND_ENV` matches key type.
6. **Monitoring:** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (optional but recommended).
7. **Analytics:** `POSTHOG_PROJECT_KEY` (server), `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` (client).
8. **W3W:** `W3W_API_KEY` set for production onboarding.
9. **Redeploy** production from `main` (includes PRs #59–#61 app code).
10. **Smoke:** Sign in → merchant top-up page loads; Stripe checkout starts (test); admin action creates `admin_ops_log` row.

**Done:** No 503 on Stripe checkout from missing app URL; payment guards don't throw on startup; Sentry receives a test event.

**Risk:** Setting `STRIPE_ENV=live` or `INTASEND_ENV=live` with wrong keys **hard-fails** the app (by design).

---

### C. Real-money test & FX verification

1. Use **Stripe test mode** unless deliberately going live.
2. Sign in as test merchant with `can_topup`.
3. **Non-KES FX test** (API — UI defaults to KES):
   ```http
   POST /api/topup/stripe
   Content-Type: application/json
   Cookie: <clerk session>

   {"amount": 1, "currency": "USD"}
   ```
4. Complete Stripe Checkout (`4242…` test card).
5. Confirm redirect to `https://maanta.app/merchant/topup?stripe=success`.
6. In Supabase SQL:
   ```sql
   SELECT amount, currency, charged_amount, payment_provider, provider_reference
   FROM merchant_transactions
   WHERE merchant_id = '<id>' AND transaction_type = 'topup'
   ORDER BY created_at DESC LIMIT 3;

   SELECT account_balance, outstanding_arrears FROM merchants WHERE id = '<id>';
   ```
7. If merchant had arrears, confirm `arrears_settlement` row and arrears reduced.

**Done:** `currency='USD'`, `charged_amount=1`, `amount` ≈ KES equivalent; balance increased by KES `amount` (net of arrears settlement).

**Risk:** Live mode moves real money. Run FX test in test mode first. Fallback FX rates are approximate — check logs for provider failures.

---

### D. CI / E2E gating

1. Review **PR #35** (Playwright golden path) — not on `main`.
2. Decide: merge as-is, merge with changes, or defer.
3. If gating CI: add GitHub Actions job with Playwright + secrets for Clerk test user + test Supabase (or dedicated env).
4. Update `docs/maanta-launch-readiness-tracker.md` E14 when done.

**Done:** Documented decision; if merged, CI fails on golden-path regression.

**Risk:** Flaky E2E without stable test env blocks merges.

---

### E. Legal / governance follow-ups

1. Review `.env.example` note on Stripe Kenya payouts / incorporation.
2. If marketing non-KES card top-ups: update legal docs for FX source (`open.er-api.com`) and rate disclosure.
3. Log decision in `docs/maanta-decisions-log.md`.

**Done:** Decision recorded; customer-facing policy matches implementation.

---

*Generated from repo analysis 2026-07-23. Do not treat `vcrfqsevompqjazbwzyh` as live without verifying Vercel env.*
