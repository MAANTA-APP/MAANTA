# Ops — Auth strategies (dev/test vs launch)

**Audience:** engineers running rehearsal vs production launch.  
**Related:** `docs/skills/clerk-auth.md`, `docs/skills/global-phone-auth.md`.

## Summary

| Phase | Strategy | Sign-in | Phone OTP | Env |
|---|---|---|---|---|
| **Production (current)** | `supabase` | Email OTP via Supabase Auth | Disabled until Clerk SMS launch | `MAANTA_AUTH_STRATEGY=supabase` |
| **Launch (future)** | `clerk` | Email + phone via Clerk | Enabled (global E.164, `/verify-phone`) | `MAANTA_AUTH_STRATEGY=clerk` |

Flip between phases by changing env vars and redeploying — no code changes required.

## Toggle

Set **both** (server + client must agree):

```bash
MAANTA_AUTH_STRATEGY=supabase          # server: middleware, ensureAppUser, API routes
NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=supabase   # client: login UI, nav, verify-phone
```

Values: `supabase` (default) | `clerk` | `authjs` (reserved; same as supabase today).

Implementation: `maanta-app/src/lib/auth/strategy.ts`.

## Supabase strategy (production default)

- No `<ClerkProvider>` — no “Secured by Clerk” UI on public pages.
- `/login` and `/sign-up` render Supabase email OTP (`SupabaseEmailLogin`).
- Post-auth redirect: `/app-bootstrap` → role-aware dashboard (`/feed`, `/merchant/dashboard`, etc.).
- Supabase JWT `sub` (UUID) → `public.users.auth_uid`.
- Phone OTP at claim is relaxed until Clerk launch.

**Production Vercel:** set both strategy vars to `supabase` (code default when unset).

## Clerk strategy (future launch)

- `<ClerkProvider>` wraps the app (`src/components/auth/auth-providers.tsx`).
- `/login` and `/sign-up` render Clerk hosted components.
- Clerk JWT `sub` → `public.users.clerk_user_id`.
- Phone OTP at sign-in and `/verify-phone` for claim gate (S2 ruling).
- Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`.

**When enabling Clerk:** set both strategy vars to `clerk` and configure SMS in the Clerk dashboard.

## Local development

- `/verify-phone` shows “launch-only” copy when strategy is `supabase`.
- Enable Email OTP in the Supabase dashboard (Authentication → Providers → Email).

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
