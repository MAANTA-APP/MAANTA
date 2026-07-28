# Skill — Supabase production email auth (OTP + callback)

**Status:** root-cause fix shipped (2026-07-28).  
**Surface:** `https://www.maanta.app` with `MAANTA_AUTH_STRATEGY=supabase`.  
**Related:** `docs/ops/auth-strategies.md`, `docs/skills/prod-auth-deals-recovery.md`.

## Symptom that led here

- Supabase Auth email **is delivered**.
- UI shows **“Couldn't send the code. Check the email and try again.”**
- Or magic link lands back on `/login` with no useful message.

## Root cause (composite)

1. **Misleading error copy** — `SupabaseEmailLogin` swallowed every `signInWithOtp`
   failure into the generic “Couldn't send the code…” string. After a first
   successful send, retries hit rate limits and still looked like “send failed”
   even though the email was already in the inbox.
2. **Silent callback failures** — `/auth/callback` redirected to
   `/login?error=auth_callback` but the login UI **ignored** the query param.
3. **PKCE + mobile email-browser handoff** — default magic links use
   `?code=` + a code verifier cookie. Opening the link in Outlook / iPhone Mail
   (different cookie jar from Safari/Chrome) makes `exchangeCodeForSession`
   fail. Users bounce to login and often hit (1) on retry.
4. **Broken post-auth bootstrap** — `/app-bootstrap` always called Clerk
   `useAuth()`. Under the supabase strategy there is no `ClerkProvider`, so
   successful OTP verify could not role-route into `/feed` (etc.).
5. **Callback cookie footgun** — session cookies from exchange/verify must be
   set on the **redirect `NextResponse`**. The old handler used
   `cookies()` from `next/headers` then returned a separate redirect.

## Code map

| Path | Role |
|---|---|
| `src/components/auth/supabase-email-login.tsx` | Send/verify OTP, `emailRedirectTo`, stage errors, URL error surfacing |
| `src/lib/auth/supabase-email-auth.ts` | Pure helpers + `[maanta-auth]` logging |
| `src/app/auth/callback/route.ts` | PKCE + `token_hash` exchange; cookies on redirect |
| `src/app/app-bootstrap/page.tsx` | Clerk vs Supabase signed-in branch |

## Operator checklist (dashboard — must do manually)

1. Supabase → Authentication → URL configuration  
   - Site URL: `https://www.maanta.app`  
   - Redirect URLs: `https://www.maanta.app/auth/callback`, `https://maanta.app/auth/callback`
2. Email template (Magic Link / Confirm signup): include **`{{ .Token }}`**
   (6-digit) and preferably a **token_hash** link:
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/app-bootstrap`
3. Vercel Production: `NEXT_PUBLIC_APP_URL=https://www.maanta.app`  
   (and both `MAANTA_AUTH_STRATEGY` / `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` = `supabase`
   only while intentionally on this strategy).
4. After deploy: request a code on Safari/Chrome, enter the **digits** on the
   same device. Optionally click a token_hash link from Mail to confirm handoff.

## How to read `[maanta-auth]` logs

| stage | Meaning |
|---|---|
| `send` | `signInWithOtp` start / accept / fail |
| `verify_otp` | 6-digit `verifyOtp` on `/login` |
| `callback_parse` | Missing/bad callback params or surfaced login `?error=` |
| `session_exchange` | PKCE `exchangeCodeForSession` or `token_hash` verify |
| `bootstrap` | `/app-bootstrap` → `/api/me` → role route |

## Tests

- `src/lib/__tests__/supabase-email-auth.test.ts`
- `src/app/auth/__tests__/callback.route.test.ts`
