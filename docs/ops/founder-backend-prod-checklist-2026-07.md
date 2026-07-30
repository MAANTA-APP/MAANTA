# Founder checklist — backend production (2026-07)

**You are not expected to run developer tools.**  
Cursor already inspected the live database and applied safe seed refreshes.  
Your job is dashboards + browser checks.

Full technical report: `docs/ops/backend-prod-setup-status-2026-07.md`

---

## What Cursor already did

1. Confirmed production database is project **`axrrslqssmbngbataejg`** (same as the live app).
2. Confirmed **all 67 migrations** are already applied — schema is up to date (nothing left to push).
3. Refreshed the **100 BBS Mall deals** seed (they had all expired) → **100 live deals** again.
4. Applied the **Nairobi 150-merchant** seed (BBS + CBD Galleria + Westlands Hub).
5. Applied **@maanta.app role test accounts** (founder / admin / agent / merchants / shoppers), safely around your existing Clerk `admin@maanta.app` logins.
6. Wrote an env-var audit and this checklist.

---

## What you must do in Vercel (15 minutes)

Open: **Vercel → project `maanta-nuia` → Settings → Environment Variables → Production**

### A. Confirm these exist (required now)

Copy this checklist and tick in Vercel (names only — paste values from Supabase / Clerk dashboards):

```
[ ] NEXT_PUBLIC_SUPABASE_URL          = https://axrrslqssmbngbataejg.supabase.co
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY     = (Supabase → Project Settings → API → anon/public)
[ ] SUPABASE_SERVICE_ROLE_KEY         = (same page → service_role — server only, never public)
[ ] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = (Clerk Production instance — pk_live_…)
[ ] CLERK_SECRET_KEY                  = (matching sk_live_… for that same instance)
[ ] NEXT_PUBLIC_APP_URL               = https://www.maanta.app
[ ] MAANTA_AUTH_STRATEGY              = clerk
[ ] NEXT_PUBLIC_MAANTA_AUTH_STRATEGY  = clerk
```

**Important:** Any change to a name starting with `NEXT_PUBLIC_` requires a **Redeploy** of Production, or the browser keeps the old value.

### B. Confirm these if you want monitoring / waitlist / maps (required soon)

```
[ ] SENTRY_DSN
[ ] NEXT_PUBLIC_SENTRY_DSN
[ ] POSTHOG_PROJECT_KEY
[ ] NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
[ ] POSTHOG_HOST                      = https://eu.i.posthog.com
[ ] RESEND_API_KEY
[ ] RESEND_AUDIENCE_ID
[ ] RESEND_FROM_EMAIL
[ ] W3W_API_KEY
```

### C. Do not turn on yet (unless you intentionally go live on money)

```
[ ] STRIPE_ENV=live          — only with live Stripe keys
[ ] INTASEND_ENV=live        — only with live IntaSend keys
```

Leave Stripe/IntaSend unset or in test/sandbox for rehearsal.

### D. After saving env vars

1. Vercel → Deployments → **Redeploy** the latest Production deployment.
2. Wait until status is Ready.

---

## What you must do in Supabase (optional cleanup)

1. Open project **`axrrslqssmbngbataejg`**.
2. There are **two** `admin@maanta.app` user rows (both set to role `admin`). Keep the one you actually use in Clerk; ask an engineer later to remove the duplicate if it confuses login.
3. You do **not** need to paste migrations — they are already applied.

---

## What you must verify on the live app

Use a normal browser (and one private window for a second role).

| Step | Open | Expect |
|---|---|---|
| 1 | `https://www.maanta.app/login` | Clerk sign-in loads (not a blank / “Invalid host” page) |
| 2 | Sign in → `/feed` with location **BBS Mall** | Many deals visible (not empty, not error card) |
| 3 | `/browse` | Map/pins or list for BBS; can switch to CBD Galleria / Westlands Hub |
| 4 | Sign in as `admin@maanta.app` (Clerk) → `/admin` | Admin console loads |
| 5 | Optional: `/founder` if using founder account | Founder overview |

If feed is empty: check the `maanta_node` cookie is **BBS Mall** (stale other-node cookie hides deals).

### Role accounts (for later multi-role rehearsal)

Documented in `docs/ops/test-accounts-seed-2026-07.md`:

- `founder@maanta.app`, `agent@maanta.app`, merchant/shopper `@maanta.app` emails  
- With **Clerk** strategy: sign up / sign in once with that email, then if needed link `clerk_user_id` in SQL (engineer step).  
- With **Supabase** strategy: email OTP works against seeded `auth.users` (only if you flip both strategy env vars to `supabase` and redeploy).

---

## What is blocked / risky (plain language)

| Item | Meaning |
|---|---|
| **M-Pesa (IntaSend)** | Still blocked on account access — not required for browse/claim rehearsal |
| **Live card charges** | Keep Stripe in test until you decide go-live |
| **Duplicate admin@maanta.app** | Two Clerk-linked rows — cleanup later |
| **Deal expiry** | Seeded deals expire (~5h flash / ~21h standard for 100-deal set). Re-run seed when rails look empty again |
| **DB password in agent secrets** | If a connection string was ever pasted into chat/logs, rotate the Supabase database password |

---

## Ready for live rehearsal?

**Almost — yes for browse/feed data; confirm auth + env first.**

After you finish the Vercel ticks + redeploy + login smoke above, BBS rehearsal on production is unblocked for Discover/Browse. Full claim → verify → fee rehearsal still needs working Clerk login for shopper + merchant on two devices.
