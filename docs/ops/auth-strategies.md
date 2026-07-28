# Ops — Auth strategies (dev/test vs launch)

**Audience:** engineers running rehearsal vs production launch.  
**Related:** `docs/skills/clerk-auth.md`, `docs/skills/global-phone-auth.md`.

## Summary

| Phase | Strategy | Sign-in | Phone OTP | Env |
|---|---|---|---|---|
| **Dev / staging rehearsal** | `supabase` | Email OTP via Supabase Auth | Disabled (no Clerk SMS cost) | `MAANTA_AUTH_STRATEGY=supabase` |
| **Production launch** | `clerk` | Email + phone via Clerk | Enabled (global E.164, `/verify-phone`) | `MAANTA_AUTH_STRATEGY=clerk` |

Flip between phases by changing env vars and redeploying — no code changes required.

## Toggle

Set **both** (server + client must agree):

```bash
MAANTA_AUTH_STRATEGY=clerk          # server: middleware, ensureAppUser, API routes
NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=clerk   # client: login UI, nav, verify-phone
```

Values: `clerk` (default) | `supabase` | `authjs` (reserved; same as supabase today).

Implementation: `maanta-app/src/lib/auth/strategy.ts`.

## Clerk strategy (launch)

- `<ClerkProvider>` wraps the app (`src/components/auth/auth-providers.tsx`).
- `/login` and `/sign-up` render Clerk hosted components.
- Clerk JWT `sub` → `public.users.clerk_user_id`.
- Phone OTP at sign-in and `/verify-phone` for claim gate (S2 ruling).
- Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`.

**Production Vercel:** set both strategy vars to `clerk`.

## Supabase strategy (dev/test)

- No `<ClerkProvider>` — Clerk keys optional for rehearsal.
- `/login` and `/sign-up` render email OTP form (`SupabaseEmailLogin`).
- Supabase Auth session cookie; JWT `sub` (UUID) → `public.users.auth_uid`.
- Phone claim gate **relaxed** — `phoneOtpEnabled()` is false so rehearsal can
  exercise claim → verify without SMS spend.
- `/verify-phone` shows “launch-only” copy instead of Clerk SMS flow.
- E.164 `PhoneField` UI remains in the codebase for launch.

**Local / staging:** set both strategy vars to `supabase`. Enable Email OTP in
the Supabase dashboard (Authentication → Providers → Email).

### Production email OTP checklist (when strategy=`supabase`)

Canonical host is **`https://www.maanta.app`** (`maanta.app` 308s there). Configure:

| Setting | Value |
|---|---|
| Site URL | `https://www.maanta.app` |
| Redirect URLs (allow list) | `https://www.maanta.app/auth/callback` **and** `https://maanta.app/auth/callback` |
| Vercel `NEXT_PUBLIC_APP_URL` | `https://www.maanta.app` |

**Preferred sign-in path:** 6-digit OTP typed on `/login` (same browser that
requested the email). Magic-link PKCE fails when iPhone Mail / Outlook opens
the link in a different browser than the one that called `signInWithOtp`.

For clickable email links that survive that handoff, use a **token_hash**
template (not only `{{ .ConfirmationURL }}`):

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/app-bootstrap">
  Sign in to Maanta
</a>
<p>Or enter this code: {{ .Token }}</p>
```

`/auth/callback` accepts both PKCE `?code=` and `?token_hash=&type=`, and
writes session cookies onto the redirect response. `/app-bootstrap` is
strategy-aware (Supabase session vs Clerk).

Diagnostics: browser + server logs tagged `[maanta-auth]` with stages
`send` | `verify_otp` | `callback_parse` | `session_exchange` | `bootstrap`.

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
| `src/components/auth/supabase-email-login.tsx` | Email OTP UI + stage-specific errors |
| `src/lib/auth/supabase-email-auth.ts` | Redirect URL + error mapping + `[maanta-auth]` logs |
| `src/app/auth/callback/route.ts` | PKCE / token_hash callback (cookies on redirect) |
| `src/app/app-bootstrap/page.tsx` | Role router (Clerk or Supabase session) |
| `src/middleware.ts` | Clerk vs Supabase session refresh |
| `src/app/login`, `src/app/verify-phone` | Strategy-aware pages |
| `docs/skills/supabase-prod-email-auth.md` | Production email-auth recovery skill |
