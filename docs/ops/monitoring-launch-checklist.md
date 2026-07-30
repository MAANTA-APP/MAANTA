# Monitoring launch checklist (Sentry + PostHog)

**Date:** 2026-07-28  
**Audience:** Engineer / founder  
**Code:** Sentry + PostHog are integrated and **no-op when env vars are unset**.

**Companions:** `docs/skills/sentry-monitoring.md`, `docs/ops/vercel-production-env-checklist.md`

---

## What the repo already does

| System | Behavior when env unset | Behavior when env set |
|---|---|---|
| Sentry | No-op init | Captures browser + server + edge errors |
| PostHog | No-op analytics | Client pageviews + server `captureServerEvent` |
| Healthz | Always works | `envPresence().monitoring` shows booleans |

Soft warning on boot: `warnMissingCriticalEnv()` in `src/instrumentation.ts` (auth/DB critical only — monitoring is optional and does not fail readiness).

---

## Env vars to set (Vercel Production + Preview)

### Sentry

| Variable | Where | Notes |
|---|---|---|
| `SENTRY_DSN` | Vercel | From Sentry → Project Settings → Client Keys |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | Usually same DSN; **redeploy** after set |
| `SENTRY_AUTH_TOKEN` | Vercel (build) | Optional; source maps (`project:releases`) |

Org: **`maanta`** · Project: **`javascript-nextjs`**

### PostHog

| Variable | Where | Notes |
|---|---|---|
| `POSTHOG_PROJECT_KEY` | Vercel | Server `phc_…` |
| `POSTHOG_HOST` | Vercel | `https://eu.i.posthog.com` |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Vercel | Client token; **redeploy** |
| `NEXT_PUBLIC_POSTHOG_HOST` | Vercel | If used by client provider |

Project: EU cloud **211805** (MAANTA org) — **Needs manual verification** that tokens match this project.

---

## Activation steps

1. Create/confirm Sentry project + copy DSN.
2. Create/confirm PostHog project + copy keys.
3. Paste into Vercel Production (and Preview).
4. **Redeploy**.
5. Run verification below.
6. Configure alerts (next section).

---

## Verification

### Sentry

1. Open `https://www.maanta.app/sentry-example-page` (admin/dev only in prod if you prefer Preview).
2. Click **Throw Sample Error**.
3. Confirm issue at https://maanta.sentry.io/issues/?project=javascript-nextjs
4. Optional: trigger a payment webhook failure path in sandbox and confirm `logWebhookFailure` message.

### PostHog

1. Open `https://www.maanta.app/` signed out → pageview.
2. Sign in → identify should fire (Clerk or Supabase sync in `posthog-provider.tsx`).
3. Confirm Live events in PostHog project 211805.
4. Recommended funnel: signup → claim → verify (by `node` when property exists).

### Healthz

```bash
curl -sS "https://www.maanta.app/api/healthz?ready=1" | jq .
# Monitoring does not gate readiness — missing Sentry/PostHog still "ready"
```

Admin: `?detail=1` → `env.monitoring.*` booleans true when set.

---

## Recommended alerts (create in dashboards — HUMAN)

### Sentry

- [ ] Spike in unresolved issues (e.g. >10 new in 1h)
- [ ] Payment webhook failure messages (`logWebhookFailure`)
- [ ] High error rate on `/api/redemptions` and `/api/redemptions/verify`
- [ ] Auth / middleware error spikes

### PostHog / product

- [ ] Daily claim count drops >50% WoW
- [ ] Verify success rate < 90% of claims (once volume exists)
- [ ] Funnel: `/login` → `/app-bootstrap` → `/feed`

### Platform

- [ ] Uptime probe on `GET /api/healthz` (every 1–5 min)
- [ ] Alert on `GET /api/healthz?ready=1` returning 503
- [ ] Supabase dashboard: CPU / connections / disk
- [ ] Vercel: function error rate on critical API routes

---

## Session replay / web vitals

| Feature | Status |
|---|---|
| Sentry Session Replay | Not required for launch; enable in Sentry project if desired |
| Web Vitals | Prefer Vercel Analytics or PostHog web vitals — **not fully documented in-repo** |
| LogRocket / Datadog | Explicitly deferred |

---

## Sign-off

- [ ] Sentry DSN live + test error received
- [ ] PostHog tokens live + pageview received **or** explicitly deferred with owner + date
- [ ] At least one Sentry alert configured
- [ ] Uptime probe on `/api/healthz`
