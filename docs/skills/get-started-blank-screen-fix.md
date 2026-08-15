# Skill — Get started blank screen (2026-07-25)

## Symptom
Homepage "Get started" appeared to show a blank screen in production.

## Root cause
Two different CTAs shared the label **Get started**:

| Location | Target | Behavior |
|---|---|---|
| Hero CTA (`(public)/page.tsx`) | `/feed` | Server-rendered shopper feed — works without Clerk JS |
| Nav CTA (`public-nav.tsx`) | `/sign-up` | Clerk `<SignUp />` — **blank until Clerk JS loads**; empty body if script blocked/fails |

Repro: block `**clerk**` network requests → `/sign-up` renders `bodyLen: 0`; `/feed` still shows content.

## Fix (PR branch `cursor/fix-get-started-blank-c0f8`)
1. `ClerkAuthShell` — wraps sign-in/sign-up with `ClerkLoading`, `ClerkFailed`, `ClerkLoaded` so users always see skeleton or retry UI.
2. Nav label changed from "Get started" → **Sign up** (hero keeps "Get started" → browse flow).
3. `posthog-provider.tsx` — skip `posthog.init` when `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` unset (defensive).
4. **Clerk routing hardening (2026-07-25):**
   - Catch-all folders renamed to Clerk-recommended `[[...sign-up]]` / `[[...sign-in]]`.
   - `<SignUp routing="path" path="/sign-up" signInUrl="/login" />` and matching `<SignIn />` props.
   - `ClerkProvider` passes explicit `publishableKey` plus sign-in/up URL fallbacks (`/login`, `/sign-up`) so missing `NEXT_PUBLIC_CLERK_*_URL` at build time does not blank redirect config.
   - Failure-state links stay relative (`/sign-up`, `/login`, `/feed`) — tested in `clerk-auth-shell.test.ts`.

## ClerkFailed on preview URLs
Production `pk_live_` keys only allow origins configured in the Clerk dashboard (`maanta.app`, `www.maanta.app`). `*.vercel.app` preview deploys will hit `ClerkFailed` unless the preview origin is allowlisted — **development `pk_test_` keys alone do not prevent this** (measured 2026-08-15 on the #201 Preview: dev keys present and server middleware healthy, widget still origin-blocked; the instance's origin allowlist was enabled with an empty list). See drift row D101 and the accepted Option C Preview posture in `docs/maanta-decisions-log.md`.

## Verify
- Hero: `Get started` → `/feed` shows mall picker + deals/empty state.
- Nav: `Sign up` → `/sign-up` shows Clerk form or loading/failure fallback (never blank).
- Playwright: block clerk → sign-up page must have non-zero body text after deploy.
