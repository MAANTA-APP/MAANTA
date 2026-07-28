# Vercel production environment checklist

**Date:** 2026-07-28  
**Audience:** Operator with Vercel project access for `maanta.app`  
**Code catalog:** `maanta-app/src/lib/env.ts` (`ENV_CATALOG`) · mirror: `maanta-app/.env.example`

---

## Critical rules

1. **Set both** `MAANTA_AUTH_STRATEGY` and `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` to the **same** value. Mismatch = broken UI vs middleware.
2. **`NEXT_PUBLIC_*` vars are inlined at build time.** Changing them in the Vercel dashboard does **not** update an existing deployment until you **redeploy**.
3. **Production launch strategy = `clerk`.** Use `supabase` only for rehearsal / staging.
4. Never put `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, or payment secrets in `NEXT_PUBLIC_*`.
5. After env changes: **Redeploy Production**, then hit `GET /api/healthz?ready=1`.

---

## Step-by-step (Production)

1. Open Vercel → MAANTA project → **Settings → Environment Variables**.
2. Scope each variable to **Production** (and Preview where noted).
3. Fill the tables below. Prefer “Sensitive” for secrets.
4. Trigger **Redeploy** of the latest Production deployment (or push an empty commit).
5. Verify:
   ```bash
   curl -sS "https://www.maanta.app/api/healthz?ready=1" | jq .
   # expect: "status": "ready", "strategy": "clerk"
   ```
6. Admin detail (signed-in admin browser session):
   `https://www.maanta.app/api/healthz?detail=1` — boolean env map only.

---

## Environment matrix

### Auth (required)

| Variable | Dev | Preview | Production | Required | Build-time? | Example / notes |
|---|---|---|---|---|---|---|
| `MAANTA_AUTH_STRATEGY` | supabase or clerk | clerk | **clerk** | Yes | No | Must match public mirror |
| `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` | same | clerk | **clerk** | Yes | **Yes** | Redeploy after change |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | optional if supabase | yes | **yes** | If clerk | **Yes** | Production Clerk instance |
| `CLERK_SECRET_KEY` | optional if supabase | yes | **yes** | If clerk | No | Same instance as publishable |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` | `/login` | `/login` | Optional | **Yes** | |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | `/sign-up` | `/sign-up` | Optional | **Yes** | |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/app-bootstrap` | `/app-bootstrap` | `/app-bootstrap` | Optional | **Yes** | Not `/select-mall` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/app-bootstrap` | `/app-bootstrap` | `/app-bootstrap` | Optional | **Yes** | |
| `NEXT_PUBLIC_LAUNCH_AUTH_MODE` | — | email_and_phone | email_and_phone | Optional | **Yes** | |

### Supabase (required)

| Variable | Production value | Build-time? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://axrrslqssmbngbataejg.supabase.co` | **Yes** | Confirm ref |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase dashboard | **Yes** | |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase dashboard | No | Server only |

### App

| Variable | Production | Build-time? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://www.maanta.app` | **Yes** | Stripe redirects |

### Payments (optional until top-up go-live)

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` until live cutover |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook endpoint |
| `STRIPE_ENV` | Set `live` only when ready for real charges |
| `INTASEND_API_KEY` / `INTASEND_SECRET` / `INTASEND_WEBHOOK_SECRET` | Blocked on provider access (E6) |
| `INTASEND_ENV` | `live` only when ready |

### Monitoring (recommended before traffic)

| Variable | Build-time? | Notes |
|---|---|---|
| `SENTRY_DSN` | No | Server |
| `NEXT_PUBLIC_SENTRY_DSN` | **Yes** | Same DSN value typically |
| `SENTRY_AUTH_TOKEN` | No | Build/source maps |
| `POSTHOG_PROJECT_KEY` | No | Server |
| `POSTHOG_HOST` | No | `https://eu.i.posthog.com` |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | **Yes** | Client |
| `NEXT_PUBLIC_POSTHOG_HOST` | **Yes** | If used |

### Email / push / geo (as needed)

| Variable | Notes |
|---|---|
| `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `RESEND_FROM_EMAIL` | Waitlist |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push |
| `W3W_API_KEY` | Merchant onboard |

---

## Preview vs Production

| Concern | Preview | Production |
|---|---|---|
| Auth strategy | Prefer `clerk` with test keys, or `supabase` for email OTP rehearsal | `clerk` only |
| Stripe | Test keys | Test until cutover; then live + `STRIPE_ENV=live` |
| Supabase | Same prod DB is **risky** — prefer linked preview caution | Pinned `axrrslqssmbngbataejg` |
| Monitoring | Optional but useful | Required for launch |

---

## Common footguns

| Symptom | Likely cause |
|---|---|
| Clerk “Invalid host” | Placeholder or mismatched Clerk keys |
| `/app-bootstrap` loops to login (supabase) | Fixed in repo 2026-07-28 — redeploy needed |
| Env change has no effect | Forgot redeploy after `NEXT_PUBLIC_*` |
| Ready probe fails with Clerk missing under supabase | Expected if strategy is clerk; for supabase rehearsal set both strategy vars |
| Empty feed | Wrong `maanta_node` cookie, missing deals seed, or service_role/DB drift |

---

## Operator sign-off

- [ ] All critical Production vars set
- [ ] Strategy pair = `clerk` / `clerk`
- [ ] Supabase URL ref verified
- [ ] Redeployed after last env change
- [ ] `/api/healthz?ready=1` → ready
