# Sentry error monitoring — MAANTA Next.js

Handoff for operators and builders. Sentry org **`maanta`**, project **`javascript-nextjs`**.

## What is wired

| File | Role |
|---|---|
| `maanta-app/src/instrumentation-client.ts` | Browser init (Turbopack-safe; replaces deprecated `sentry.client.config.ts`) |
| `maanta-app/sentry.server.config.ts` | Node.js / API routes / SSR |
| `maanta-app/sentry.edge.config.ts` | Middleware / edge runtimes |
| `maanta-app/src/instrumentation.ts` | Registers server + edge configs; exports `onRequestError` |
| `maanta-app/next.config.mjs` | `withSentryConfig` — org `maanta`, project `javascript-nextjs` |
| `maanta-app/src/app/global-error.tsx` | Captures App Router root errors |
| `maanta-app/src/lib/merchant-ledger.ts` | `logWebhookFailure()` also calls `Sentry.captureMessage` |

All Sentry init is a **no-op when DSN env vars are unset** (local dev, CI).

## Environment variables

Set in Vercel (and locally in `.env.local` when testing):

| Variable | Scope | Purpose |
|---|---|---|
| `SENTRY_DSN` | Server | Server/edge error capture |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Browser error capture (same DSN value) |
| `SENTRY_AUTH_TOKEN` | CI/deploy only | Source map upload at build time |

Copy from Sentry → Project Settings → Client Keys (DSN). Create an auth token with `project:releases` + `org:read` for CI.

## Verify setup

1. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in `.env.local`.
2. `cd maanta-app && npm run dev`
3. Open `/sentry-example-page` and click **Throw Sample Error**.
4. Confirm a new issue appears at https://maanta.sentry.io/issues/?project=javascript-nextjs

The example page exercises client error, server API error (`/api/sentry-example-api`), and a performance span.

## Wizard note

The official wizard requires interactive Sentry login:

```bash
cd maanta-app
npx @sentry/wizard@latest -i nextjs --saas --org maanta --project javascript-nextjs
```

This repo already contains the wizard output (manual equivalent). Re-run the wizard only if you need to refresh DSN injection or add Session Replay / Logs.

## Production checklist

- [ ] DSN vars set on Vercel production + preview
- [ ] `SENTRY_AUTH_TOKEN` on Vercel for source maps (optional but recommended)
- [ ] Smoke test `/sentry-example-page` on preview deploy
- [ ] Payment webhook failure path tested (see `docs/skills/payments-rails.md`)

**Session:** 2026-07-23 — completed wizard-equivalent setup + example verification routes.
