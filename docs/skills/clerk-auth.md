# Skill — Clerk authentication (Clerk + Supabase third-party auth)

**Status:** code wired, **dashboard steps required before it authenticates**.
**Decision:** decisions-log 2026-07-20. **Owner surface:** `maanta-app`.

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
`auth.uid()`. Re-pointing **just those two** at the Clerk `sub` migrates the
entire security model without touching a single policy or RPC body.

## What changed in code

| File | Change |
|---|---|
| `package.json` | added `@clerk/nextjs@^6` (v7 needs Next 15; we're on Next 14) |
| `src/app/layout.tsx` | wrapped app in `<ClerkProvider>` |
| `src/middleware.ts` | `clerkMiddleware()` replaces the Supabase session-refresh middleware (deleted `src/lib/supabase/middleware.ts`) |
| `src/app/login/[[...rest]]/page.tsx` | Clerk `<SignIn>` (replaced the custom OTP page) |
| `src/app/sign-up/[[...rest]]/page.tsx` | Clerk `<SignUp>` |
| `src/app/sign-out-button.tsx` | `useClerk().signOut()` |
| `src/lib/auth.ts` | **new** — `currentClerkUserId()` and `ensureAppUser()` (lazy provisioning) |
| `src/lib/supabase/server.ts`, `client.ts` | attach Clerk token via `accessToken` so RLS/RPCs see the caller |
| `src/lib/data.ts` (`getAppUser`) + all `/api/*` routes | `supabase.auth.getUser()` → `ensureAppUser` / `currentClerkUserId` |
| `supabase/migrations/20260720140000_clerk_third_party_auth.sql` | `users.clerk_user_id` + redefined identity helpers |
| `src/components/nav/public-nav.tsx` | landing-nav auth controls: `<SignedOut>` Sign in + Get started, `<SignedIn>` My feed + `<UserButton>` (v6 uses `SignedIn`/`SignedOut`, not v7's `<Show>`) |
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

## Required manual steps (nothing authenticates until these are done)

1. **Clerk dashboard**
   - Create the application (or use the existing MAANTA instance).
   - **User & Authentication → enable Phone number (OTP)** and **Email**.
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
   - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/select-mall` (and the sign-up equivalent)
4. **Apply the migration** `20260720140000_clerk_third_party_auth.sql` to the
   Supabase project (CI's db-tests job applies it automatically on PR).

## Verify it end-to-end (after the steps above)
- Sign in at `/login` with a phone number → land on `/select-mall`.
- `select * from public.users where clerk_user_id is not null` shows your row.
- Hit an authenticated route (e.g. save a favourite) → succeeds, and the RPC's
  internal `current_user_id()` resolves (no `unauthorized` error).
- Sign out → `/login`.

## Open follow-ups
- **Kenya SMS**: validate Clerk phone-OTP deliverability and per-message cost
  for Kenyan numbers before relying on it for shopper login. If it's not
  viable, fall back to email/social and revisit phone. (Frozen assumption:
  shopper login is phone-first.)
- **Legacy user linking**: existing rows are keyed by `auth_uid` (Supabase
  Auth) with `clerk_user_id` NULL. If any real users predate Clerk, add a
  one-off backfill that matches by phone/email and sets `clerk_user_id`. The
  identity helpers are Clerk-only now, so unlinked legacy users can't sign in
  until linked. (Pre-launch, the simplest path is to have them re-register via
  Clerk.)
- **`auth_uid`/trigger**: left in place but inert. Remove once no Supabase-Auth
  path remains.
