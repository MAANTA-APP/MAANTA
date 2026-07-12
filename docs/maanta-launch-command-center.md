# MAANTA launch command center

Last updated: 2026-07-12. Running log of launch-readiness security/ops fixes as
they land. Behavior-changing decisions also go to `maanta-decisions-log.md`;
launch-gate flow status lives in `maanta-launch-readiness-tracker.md`. This doc
is the at-a-glance "what shipped, is it verified" board.

Status legend: ✅ done · 🟡 needs verification · 🔴 blocker · ⬜ not started

## Security & data-access hardening

| Item | Status | Notes |
|---|---|---|
| RLS & storage hardening | ✅ | **Applied to live 2026-07-12.** Added admin-only `FOR ALL` RLS policies to `organizations` and `payment_webhook_failures` (RLS explicitly enabled on the latter), and dropped the over-broad `deal_images_public_read` listing policy on the `deal-images` bucket while keeping the scoped merchant-own-folder upload/delete policies. Migration `20260712120000_rls_policies_and_storage_hardening` is in live history (project `vcrfqsevompqjazbwzyh`, eu-west-1). Security advisor: the two `rls_enabled_no_policy` findings and the `public_bucket_allows_listing` WARN are **cleared**. CI gate green (lint, typecheck, 17/17 tests, build). **Safe because** every write to these three surfaces already goes through the service role, which bypasses RLS, and public deal-image URLs are served without the listing policy — so shopper feed, merchant uploads, and webhook logging are unaffected. |

## Deploy readiness

| Item | Status | Notes |
|---|---|---|
| Prod deploy (Vercel) | 🟡 ready once envs are set | Stock Next.js 14 App Router deploy (no `vercel.json` needed; deploy target not pinned in-repo). **Required Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (=`https://maanta.app`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ENV`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `W3W_API_KEY`, and (when IntaSend access lands) `INTASEND_API_KEY`/`INTASEND_SECRET`/`INTASEND_WEBHOOK_SECRET`/`INTASEND_ENV`. **Not Vercel vars:** `TWILIO_*` (set in Supabase Auth SMS provider), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (unused — server Checkout redirect, no client Stripe.js), `NODE_ENV` (Vercel-managed). **Gaps/risk:** missing Supabase URL/anon → whole-site 500 (middleware runs on all routes); missing `SUPABASE_SERVICE_ROLE_KEY` → all privileged API routes throw; missing `NEXT_PUBLIC_APP_URL` → Stripe success/cancel redirect to localhost; missing `STRIPE_*` + unregistered Stripe webhook → top-ups/wallet crediting break. **Non-Vercel deps:** Supabase Auth email-SMTP and/or Twilio must be enabled or OTP login never delivers; Supabase Site-URL allow-list must include the domain; Stripe webhook endpoint (`/api/webhooks/stripe`) registered with its signing secret == `STRIPE_WEBHOOK_SECRET`; **redeploy after setting envs** (Vercel doesn't retro-apply envs). No secret is mis-scoped (all secrets are server-only; none prefixed `NEXT_PUBLIC_`). No code changes were needed. Mirrors tracker item **E10**. **Verdict: ready once envs are set** — M-Pesa/IntaSend remains blocked on external access (tracker E6) but does not gate deploy or non-payment QA. |
| Prod smoke test (browser + device) | ⬜ not started | Run after envs are set + redeploy. Seed identities (all email-OTP → founder Gmail inbox): admin `aragagency@gmail.com`, shopper `aragagency+shopper@gmail.com`; live pending redemption ticket **OTP `431977`** on Nuur's abaya deal for a no-payment merchant-verify check. **Desktop (Chrome+Safari):** load `/` → `/login` email-OTP → `/feed` → open a deal → browse→claim→`/tickets/[id]` → `/admin` loads. **Mobile (Android+iOS):** `/` + `/login` layout intact, CTA tappable, no overflow; shopper claim path renders. **PASS** = no crash on all 4 browsers, OTP login completes, one browse→claim→ticket works, admin loads, no mobile layout breaks. **Needs another session** = app-wide 500 (missing Supabase env), OTP undelivered (Supabase SMTP/Twilio), localhost redirects (`NEXT_PUBLIC_APP_URL`), or a payment/webhook step is required. |

### Required env vars — quick reference (set in Vercel → Settings → Environment Variables)

`NEXT_PUBLIC_*` values are intentionally public (shipped in the browser bundle); everything else is a server secret. Set for Production + Preview unless noted.

| Var | Role | Priority | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | HIGH | Public. Missing → app-wide 500. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | HIGH | Public. Missing → app-wide 500. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | HIGH | **Secret.** All API routes fail if unset. |
| `NEXT_PUBLIC_APP_URL` | App | HIGH | `https://maanta.app` in Production; only value that differs per env. |
| `STRIPE_SECRET_KEY` | Stripe | HIGH | **Secret.** `sk_test_…` now → `sk_live_…` at cutover. |
| `STRIPE_WEBHOOK_SECRET` | Stripe | HIGH | **Secret.** Must equal the registered webhook endpoint's signing secret. |
| `STRIPE_ENV` | Stripe | HIGH | `test` now; `live` only when key is live (guard refuses mismatch). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push | MED | Public. |
| `VAPID_PRIVATE_KEY` | Web Push | MED | **Secret.** |
| `VAPID_SUBJECT` | Web Push | MED | `mailto:admin@maanta.app`. |
| `W3W_API_KEY` | what3words | MED | **Secret.** Onboarding geocoding (degrades to null if unset). |
| `INTASEND_API_KEY` / `INTASEND_SECRET` / `INTASEND_WEBHOOK_SECRET` / `INTASEND_ENV` | IntaSend | LOW | Secrets (except env). Blocked on IntaSend access (E6); app runs without them. |

## Known advisor items still open (later pass)

Out of scope for the 2026-07-12 fix; do **not** change the GraphQL/RPC model
piecemeal — scope these deliberately:

| Advisor lint | Scope | Status | Notes |
|---|---|---|---|
| `pg_graphql_anon_table_exposed` (0026) | Most `public` tables | ⬜ not started | `anon` has `SELECT` grant, so tables are discoverable in the GraphQL schema. RLS still blocks row access; this is schema-discoverability, not a data leak. Fix = revoke `SELECT` from `anon` on tables that shouldn't be pre-sign-in discoverable — verify PostgREST access paths first. |
| `pg_graphql_authenticated_table_exposed` (0027) | Most `public` tables | ⬜ not started | Same as above for the `authenticated` role. |
| `authenticated_security_definer_function_executable` (0029) | Core RPCs (`claim_deal`, `verify_redemption`, `onboard_merchant`, `purchase_boost`, …) | ⬜ not started | These RPCs are self-authorizing and intended to be callable by signed-in users; review each before revoking `EXECUTE` or switching to `SECURITY INVOKER`. |
| `auth_leaked_password_protection` | Auth config | ⬜ not started | Dashboard toggle — enable HaveIBeenPwned check in Supabase Auth settings. |
