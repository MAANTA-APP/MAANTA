# AGENTS.md

For repo orientation, product context, source-of-truth hierarchy, and the frozen
business rules, read `CLAUDE.md` first. The application lives in `maanta-app/`
(Next.js 14 App Router + Supabase + Clerk, package manager: **npm**).

## Cursor Cloud specific instructions

The VM update script already runs `npm ci --prefix maanta-app`, so dependencies
are installed on startup. Run all app commands from `maanta-app/`. Standard
scripts are defined in `maanta-app/package.json` and summarized in `CLAUDE.md`
(`npm run dev` / `build` / `test`), plus `npm run lint` and `npm run typecheck`
(both run in CI — see `.github/workflows/ci.yml`).

### `.env.local` is required to run dev/build (and is gitignored)

Several modules throw at import time when their env vars are unset
(`src/lib/supabase/*.ts`, `src/lib/stripe.ts`), and `<ClerkProvider>` needs a
*well-formed* publishable key even to prerender the marketing pages. Because
`.env.local` is gitignored, it does **not** survive into a fresh VM — recreate
`maanta-app/.env.local` with these safe placeholders (identical to the CI build
env) before running `npm run dev` or `npm run build`:

```
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_cGxhY2Vob2xkZXIuY2xlcmsuYWNjb3VudHMuZGV2JA==
CLERK_SECRET_KEY=sk_test_placeholder
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/select-mall
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/select-mall
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

`npm run test` (vitest) needs **no** env vars.

### What works with placeholders vs. what needs real services

- Placeholders are enough for: lint, typecheck, vitest, `next build`, booting
  `npm run dev`, and server-rendering pages (all return HTTP 200).
- Placeholder Clerk keys let pages render server-side, but **client-side Clerk
  init cannot reach the fake `*.clerk.accounts.dev` instance**, so in a real
  browser, interactive/authenticated pages may stall on Clerk. To exercise
  auth-gated flows or click-through UI, supply real Clerk keys.
- Data-driven pages/actions (deals, wallet, redemptions) need a real Supabase
  project (see `docs/skills/clerk-auth.md`) or a local Supabase; placeholder
  Supabase returns no data.
- The CI `db-tests` job needs the Supabase CLI + Docker; it is independent of
  app development and not required to run the app.

### Sentry

Sentry no-ops unless `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client)
are set in `.env.local`. When set, verify capture at `/sentry-example-page`:
click **Throw Sample Error** and a green **"Error sent to Sentry."** confirms the
client DSN works; the `/api/sentry-example-api` route (HTTP 500) covers
server-side capture. The `@sentry/nextjs` "compatible with Turbopack on Next.js
15.4.1 or later" warning under `next dev --turbo` is expected on Next 14 and
harmless. Do not commit a real DSN — keep it in the gitignored `.env.local`.
