# Ops — Auth strategies (dev/test vs launch)

**Audience:** engineers running rehearsal vs production launch.  
**Related:** `docs/skills/clerk-auth.md`, `docs/skills/global-phone-auth.md`.

## Summary

| Phase | Strategy | Sign-in | Phone OTP | Env |
|---|---|---|---|---|
| **Production rehearsal (default)** | `supabase` | Email OTP via Supabase Auth | Disabled (no Clerk SMS cost) | unset or `MAANTA_AUTH_STRATEGY=supabase` |
| **Production launch** | `clerk` | Email + phone via Clerk | Enabled (global E.164, `/verify-phone`) | **both** vars `=clerk` |

Flip between phases by changing env vars and redeploying — no code changes required.

**Important:** `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` is inlined at **build time**. After changing it on Vercel, trigger a new production deployment (not just a runtime env save).

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
