# Ops — Auth strategies (dev/test vs launch)

**Audience:** engineers running rehearsal vs production launch.  
**Related:** `docs/skills/clerk-auth.md`, `docs/skills/global-phone-auth.md`.

## Summary

| Phase | Strategy | Sign-in | Phone OTP | Env |
|---|---|---|---|---|
| **Production rehearsal (default)** | `supabase` | Email OTP via Supabase Auth | Disabled (no Clerk SMS cost) | both vars `=supabase` or unset |
| **Production launch** | `clerk` | Email + phone via Clerk | Enabled (global E.164, `/verify-phone`) | **both** vars explicitly `=clerk` |

Flip between phases by changing env vars and redeploying — no code changes required.

**Important:** `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` is inlined at **build time**. After changing it on Vercel, trigger a new production deployment (not just a runtime env save).

## How strategy selection works

Implementation: `maanta-app/src/lib/auth/strategy.ts`.

| Check | Rule |
|---|---|
| **Clerk mode** | `MAANTA_AUTH_STRATEGY=clerk` **and** `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=clerk` (both explicit) |
| **Supabase mode (default)** | Any other combination — unset, `supabase`, partial `clerk`, or mismatched server/client values |
| **Server SSR + middleware** | `isClerkAuth()` / `authStrategy()` — requires both vars |
| **Client bundle** | `isClerkAuthClient()` — `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` only (build-time) |

Partial clerk (only one var set to `clerk`) or server/client mismatch **never** enables Clerk UI on `/login` or `/sign-up`. Routes use `export const dynamic = 'force-dynamic'` so auth UI is chosen at request time, not baked in at build.

## Production checklist

Use this before and after every production deploy that touches auth.

### Supabase rehearsal (current default)

1. In Vercel **Production** environment variables, set **both**:
   ```bash
   MAANTA_AUTH_STRATEGY=supabase
   NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=supabase
   ```
2. Trigger a **full production redeploy** (required — `NEXT_PUBLIC_*` is inlined at build time).
3. Run the [post-deploy smoke test](#post-deploy-smoke-test) below.
4. Confirm `/login` shows email OTP — **no** Clerk script, **no** “Secured by Clerk”.

### Clerk launch (future)

1. Set **both** vars to `clerk`:
   ```bash
   MAANTA_AUTH_STRATEGY=clerk
   NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=clerk
   ```
2. Confirm Clerk keys in Vercel Production (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
3. Enable phone SMS in Clerk dashboard (Kenya / global E.164).
4. **Full production redeploy** (both vars + client bundle must agree).
5. Run the smoke test — `/login` should show Clerk UI including “Secured by Clerk”.
6. Smoke-test `/verify-phone` claim gate.

### Why a full redeploy is required

- `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` is compiled into the JavaScript client bundle at **build** time.
- Changing it in the Vercel UI without redeploying leaves the old strategy in cached JS chunks.
- `MAANTA_AUTH_STRATEGY` is read at **runtime** on the server, but client components (`AuthProviders`, nav) still use the baked-in public var.
- **Always redeploy after changing any `NEXT_PUBLIC_*` auth variable.**

## Post-deploy smoke test

Run after every production deploy that touches auth strategy or Clerk keys.

### `/login`

| Strategy | Expected |
|---|---|
| **supabase** | Email OTP form (“Email address”, “Send code” / similar). Copy mentions email sign-in for rehearsal. **No** Clerk script (`clerk.maanta.app` or `@clerk/clerk-js`). **No** “Secured by Clerk”. |
| **clerk** | Clerk sign-in UI loads. Footer shows “Secured by Clerk”. Email and phone options available. |

Quick check (optional):

```bash
curl -sL https://maanta.app/login | rg -i 'clerk|Send code|email OTP|Secured by Clerk' || true
```

- Supabase: should match email-related copy; should **not** match `clerk` or `Secured by Clerk`.
- Clerk: should match `clerk` / `Secured by Clerk`.

### `/sign-up`

| Strategy | Expected |
|---|---|
| **supabase** | Same email OTP flow as login. After verify, user lands on `/app-bootstrap` → role router sends shoppers to `/feed`. |
| **clerk** | Clerk sign-up UI. Post-signup redirect to `/app-bootstrap`. |

### Redirects (`?next=`)

1. Visit a protected path while signed out (e.g. `/profile`).
2. Confirm redirect to `/login?next=...` (or sign-up equivalent).
3. Complete sign-in.
4. Confirm landing on the original `next` path (or `/app-bootstrap` when no `next`).

### Regression guard

If `/login` shows Clerk loading skeleton or “Secured by Clerk” while strategy is configured for Supabase:

1. Verify **both** env vars are `supabase` in Vercel Production.
2. Trigger a **new production deployment** (not “Redeploy” without rebuild if env just changed).
3. Hard-refresh or incognito — stale CDN chunks can briefly show old UI.

## Toggle

Set **both** (server + client must agree for Clerk launch):

```bash
MAANTA_AUTH_STRATEGY=clerk          # server: middleware, ensureAppUser, API routes, /login SSR
NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=clerk   # client: AuthProviders, nav, verify-phone (build-time)
```

For Supabase rehearsal (default when unset):

```bash
MAANTA_AUTH_STRATEGY=supabase
NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=supabase
```

Values: `clerk` | `supabase` | `authjs` (reserved; same as supabase today).

Implementation: `maanta-app/src/lib/auth/strategy.ts`.

## Supabase strategy (default / rehearsal)

- No `<ClerkProvider>` — Clerk keys optional for rehearsal.
- `/login` and `/sign-up` render email OTP form (`SupabaseEmailLogin`) when strategy ≠ clerk.
- Routes use `export const dynamic = 'force-dynamic'` so auth UI is not baked in at build time.
- Supabase Auth session cookie; JWT `sub` (UUID) → `public.users.auth_uid`.
- Phone claim gate **relaxed** — `phoneOtpEnabled()` is false so rehearsal can
  exercise claim → verify without SMS spend.
- `/verify-phone` shows “launch-only” copy instead of Clerk SMS flow.
- E.164 `PhoneField` UI remains in the codebase for launch.

**Local / staging:** set both strategy vars to `supabase` (or leave unset). Enable Email OTP in
the Supabase dashboard (Authentication → Providers → Email).

## Clerk strategy (launch)

- `<ClerkProvider>` wraps the app (`src/components/auth/auth-providers.tsx`).
- `/login` and `/sign-up` render Clerk hosted components (`ClerkAuthShell`).
- Clerk JWT `sub` → `public.users.clerk_user_id`.
- Phone OTP at sign-in and `/verify-phone` for claim gate (S2 ruling).
- Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`.

**Production Vercel:** set both strategy vars to `clerk`.

## Role assignment

Unchanged in both strategies:

- New users provision as `customer` via `ensureAppUser()` (or the
  `handle_new_auth_user` trigger for Supabase Auth sign-ups).
- Promote test merchants/admins via SQL seed or admin RPCs — see
  `docs/ops/test-accounts.md`.

## Switching back to Clerk for launch

1. Set `MAANTA_AUTH_STRATEGY=clerk` and `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=clerk`.
2. Confirm Clerk keys in Vercel Production.
3. Enable phone SMS in Clerk dashboard (Kenya / global E.164).
4. Redeploy.
5. Smoke-test `/login` (email + phone) and `/verify-phone` claim gate.

## Files

| Path | Role |
|---|---|
| `src/lib/auth/strategy.ts` | Toggle helpers |
| `src/lib/auth.ts` | Dual-path `ensureAppUser` |
| `src/components/auth/auth-providers.tsx` | Conditional ClerkProvider |
| `src/components/auth/supabase-email-login.tsx` | Dev email OTP UI |
| `src/middleware.ts` | Clerk vs Supabase session refresh |
| `src/app/login`, `src/app/verify-phone` | Strategy-aware pages |
