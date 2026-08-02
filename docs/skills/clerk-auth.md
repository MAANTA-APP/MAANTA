# Skill — Clerk authentication (Clerk + Supabase third-party auth)

**Status:** code merged; **live Supabase project provisioned + Clerk dashboard
wired**; only the app's env cutover + redeploy remain (see "Live project").
**Decision:** decisions-log 2026-07-20. **Owner surface:** `maanta-app`.

## Live project — which Supabase DB is real (read this first)

There are **three** Supabase projects across **two accounts/orgs**; only one is
live. Don't rediscover this the hard way.

| Project ref | Org | Role |
|---|---|---|
| **`axrrslqssmbngbataejg`** | **MAANTA-APP's Org** (`qwubyqljgcsuntgjpour`) | ✅ **THE LIVE PROJECT.** Full schema, Clerk third-party auth enabled, Clerk migration applied. App points here. |
| `vcrfqsevompqjazbwzyh` | maantamvp's Org (`fajbfdrlkxgrihulknbe`) | ⚠️ Old/abandoned. Had the schema + pilot data (wiped 2026-07-21). Not used. |
| `hhpwmtzfpfdtuunetwfh` | maantamvp's Org | Empty throwaway (`maanta-mvp-goldenpath`). Ignore. |

- **URL:** `https://axrrslqssmbngbataejg.supabase.co`
- **Keys:** publishable + `service_role` from that project's Supabase → Project
  Settings → API Keys. (Not committed here — they belong in Vercel + `.env.local`.)
- **Connector gotcha:** the Supabase MCP is authed per-account. MAANTA-APP's Org
  lives under a **different Supabase login** than maantamvp's Org, so a connector
  authed to one org gets `-32600 permission denied` on the other. To operate on
  the live DB, the connector must be authed to the account that owns
  MAANTA-APP's Org.

### How the live DB was built (2026-07-21)
The project was empty. Rather than hand-shuttle 49 migrations through the MCP
(unreliable at that size) or use the CLI (`clerk`/`supabase` CLIs and direct
`psql` are all blocked from the remote container — IPv6-only DB host, pooler
closed, GitHub release download 403s), all 49 repo migrations were concatenated
in order into one transaction-wrapped script and run once in the **Supabase SQL
Editor**. Verified via the connector: 22 tables, 29 functions, 34 RLS policies,
`clerk_user_id` + dual-path helpers (behavioral smoke test passed),
`app_config` seeded (6 rows), `schema_migrations` holds all 49 versions so a
future `supabase db push` is a clean no-op.

### Env cutover (the one remaining step)
Set in Vercel (and local `.env.local`), then redeploy:
```
NEXT_PUBLIC_SUPABASE_URL=https://axrrslqssmbngbataejg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<this project's publishable key, sb_publishable_…>
SUPABASE_SERVICE_ROLE_KEY=<this project's service_role secret>
```
Keep the existing Clerk keys (`cheerful-sailfish-3` instance).

## The shape of it

Clerk is the **authentication layer**. Supabase stays the **data + RLS layer**.
Clerk is registered in Supabase as a **third-party auth provider**: Clerk mints
the session JWT, Supabase verifies it, and RLS runs off the claims inside it.

```
shopper ──▶ Clerk <SignIn> (phone OTP / email)
                │  issues session JWT  { sub: "user_2ab…", role: "authenticated" }
                ▼
Next.js server ── attaches JWT to every Supabase call (accessToken)
                │
                ▼
Postgres  auth.jwt()->>'sub' ─▶ public.users.clerk_user_id ─▶ current_user_id()
                │                                              current_user_role()
                ▼
        existing RLS policies + SECURITY DEFINER RPCs (unchanged)
```

### Why this was cheap to do
Every RLS policy and every authz-enforcing RPC calls `public.current_user_id()`
or `public.current_user_role()`. They were the only two functions that read
`auth.uid()`. Re-pointing **just those two** migrates the entire security model
without touching a single policy or RPC body. They resolve **Clerk-primary with
a legacy fallback**:

```sql
WHERE clerk_user_id = (auth.jwt() ->> 'sub')   -- Clerk: sub is opaque text
   OR auth_uid::text = (auth.jwt() ->> 'sub')  -- legacy Supabase-Auth: sub is a UUID
```

The fallback compares `auth_uid::text = sub` and **never** casts `sub::uuid`:
SQL doesn't short-circuit OR/AND, so a cast would be evaluated eagerly and throw
on a Clerk text id (`user_2ab…`). This was caught by local repro before merge —
see the migration's helper comment. The fallback is inert in Clerk-only
production (sub is always text) but keeps the `security_hardening_test.sql`
regression suite passing, since it authenticates by setting `sub = users.auth_uid`.

## What changed in code

| File | Change |
|---|---|
| `package.json` | added `@clerk/nextjs@^6` (v7 needs Next 15; we're on Next 14) |
| `src/app/layout.tsx` | wrapped app in `<ClerkProvider>` |
| `src/middleware.ts` | `clerkMiddleware()` runs **for the `clerk` strategy only**; the middleware branches on `authStrategy()` and falls back to Supabase session refresh. Corrected 2026-08-02 (drift **D62**): this row said Clerk "replaces the Supabase session-refresh middleware (deleted `src/lib/supabase/middleware.ts`)". That file was never deleted — `src/middleware.ts` imports `updateSession` from it and calls it on the **default** path, since `DEFAULT_AUTH_STRATEGY` is `supabase` |
| `src/app/login/[[...rest]]/page.tsx` | Clerk `<SignIn>` (replaced the custom OTP page) |
| `src/app/sign-up/[[...rest]]/page.tsx` | Clerk `<SignUp>` |
| `src/app/sign-out-button.tsx` | `useClerk().signOut()` |
| `src/lib/auth.ts` | **new** — `currentClerkUserId()` and `ensureAppUser()` (lazy provisioning) |
| `src/lib/supabase/server.ts`, `client.ts` | attach Clerk token via `accessToken` so RLS/RPCs see the caller |
| `src/lib/data.ts` (`getAppUser`) + all `/api/*` routes | `supabase.auth.getUser()` → `ensureAppUser` / `currentClerkUserId` |
| `supabase/migrations/20260720140000_clerk_third_party_auth.sql` | `users.clerk_user_id` + redefined identity helpers |
| ~~`src/components/nav/public-nav.tsx`~~ → `src/components/marketing/SiteHeader.tsx` | landing-nav auth controls: `<SignedOut>` Sign in + Get started, `<SignedIn>` My feed + `<UserButton>` (v6 uses `SignedIn`/`SignedOut`, not v7's `<Show>`). Corrected 2026-08-02 (drift **D62**): `public-nav.tsx` was deleted in the Phase 1 marketing shell and superseded by `SiteHeader`/`SiteFooter` — see `docs/ops/IMPLEMENTATION-REPORT.md` §3 |
| `.env.example`, `.github/workflows/ci.yml` | Clerk keys (CI uses a well-formed dummy publishable key) |

### Clerk CLI note
The `clerk` CLI (`clerk init`, `clerk doctor`) is **not usable from the remote
Claude Code container**: `clerk auth login` only does browser OAuth with a
localhost callback, which a remote/headless container can't complete. The
equivalent scaffolding was done manually (table above). Real keys for
`app_3GmniLbX1rRbA94uOT1l8BpPtEW` (instance `cheerful-sailfish-3`) live in
`maanta-app/.env.local` locally (gitignored) and must be set in the deploy
env (Vercel). Verified functionally: `npm run dev` boots and `/login` loads
the real Clerk instance. Run `clerk doctor` yourself on a machine with a
browser if you want the CLI's health check.

### Provisioning model
The old `on_auth_user_created` trigger fired on `auth.users` inserts — which
never happen under Clerk. Instead, `ensureAppUser()` (in `src/lib/auth.ts`)
upserts the `public.users` mirror row on the **first authenticated request**,
keyed by `clerk_user_id`, pulling phone/email/name from Clerk. Every server
entry point resolves identity through it, so provisioning is automatic.

## Launch auth = email + phone, phone required at claim (S2 ruling 2026-07-23)

Frozen at launch: sign-up/sign-in offers **both email and phone**, and a shopper
may complete auth with **either**. But **claiming a deal requires a verified
phone**. An email-only session that taps **Claim** is routed through phone OTP,
then returned to the deal to finish — the "phone required at claim" gate on the
shopper board.

**Dashboard config (Clerk → User & Authentication):**
- **Email address**: enabled, used for sign-up/sign-in.
- **Phone number**: enabled (SMS OTP). Kept as an **optional** account field at
  sign-up (so email-only sign-up stays possible) — the phone requirement is
  enforced at claim time by the app, not by making phone a required sign-up
  field. (Phone/SMS is a **paid** Clerk feature — see the Kenya caveat below.)

**App-side enforcement (this is the real gate, not just dashboard config):**
- `src/lib/auth.ts` → `currentUserHasVerifiedPhone()` reads the Clerk user's
  verified phone numbers.
- `src/app/api/redemptions/route.ts` (the claim route) calls it **before the
  `claim_deal` RPC** and returns `403 { code: "phone_required" }` for a
  phone-less session — the RPC is never reached without a phone.
- `src/app/(shopper)/deals/[id]/claim-flow.tsx` catches `phone_required` and
  routes to `/verify-phone?next=/deals/[id]`.
- `src/app/verify-phone/page.tsx` adds + verifies the phone on the shopper's own
  Clerk account (client SDK: `createPhoneNumber` → `prepareVerification` →
  `attemptVerification`), then returns to the deal. Test:
  `src/app/api/redemptions/__tests__/route.test.ts`.

## Required manual steps (nothing authenticates until these are done)

1. **Clerk dashboard**
   - Create the application (or use the existing MAANTA instance).
   - **User & Authentication → enable Phone number (OTP)** and **Email**
     (both offered at sign-up/sign-in; phone stays optional at sign-up and is
     required at claim by the app gate above).
     (Phone/SMS is a **paid** Clerk feature — see the Kenya caveat below.)
   - **Enable the Supabase integration** (Integrations → Supabase). This makes
     Clerk add the `role: "authenticated"` claim Supabase needs; without it
     requests are treated as `anon` and RLS blocks everything.
   - Copy the **Publishable key** and **Secret key**.
2. **Supabase dashboard → Authentication → Third-party Auth**
   - Add **Clerk** as a provider and paste the Clerk domain it asks for.
3. **Environment** (deploy target + local `.env`)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app-bootstrap` (and the sign-up equivalent)
4. **Apply the migration** `20260720140000_clerk_third_party_auth.sql` to the
   Supabase project (CI's db-tests job applies it automatically on PR).

## Verify it end-to-end (after the steps above)
- Sign in at `/login` with a phone number → land on `/app-bootstrap` → role home
  (shopper `/feed`, merchant `/merchant/dashboard`, etc.). See
  `docs/ops/pwa-install.md`.
- `select * from public.users where clerk_user_id is not null` shows your row.
- Hit an authenticated route (e.g. save a favourite) → succeeds, and the RPC's
  internal `current_user_id()` resolves (no `unauthorized` error).
- Sign out → `/login`.

## Open follow-ups
- **Kenya SMS**: validate Clerk phone-OTP deliverability and per-message cost
  for Kenyan numbers before relying on it. Launch auth is **email + phone with
  phone required at claim** (S2 ruling 2026-07-23), so SMS OTP must work for the
  claim gate even though email-only sign-in is allowed. If SMS proves unviable
  in Kenya, the claim gate is where the impact lands — revisit there.
- **Legacy user linking**: existing rows are keyed by `auth_uid` (Supabase
  Auth) with `clerk_user_id` NULL. The helpers keep a legacy `auth_uid`
  fallback, but that only helps a *Supabase-Auth* session — a user signing in
  through Clerk gets a Clerk `sub` and needs a `clerk_user_id`. If any real
  users predate Clerk, add a one-off backfill that matches by phone/email and
  sets `clerk_user_id` (or, pre-launch, have them re-register via Clerk).
- **`auth_uid`/trigger**: left in place but inert. Remove once no Supabase-Auth
  path remains.
