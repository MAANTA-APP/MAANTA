# PWA install flow

Maanta ships as a Progressive Web App. Testers install from the browser — no app store required.

## Routes

| Path | Purpose |
|------|---------|
| `/download` | Install CTA, native install button (when supported), manual iOS/Android steps |
| `/app-bootstrap` | Post-login / PWA `start_url` — role-aware redirect to the right dashboard |
| `/help/phone-login` | Sign-in help for email OTP (dev) and phone OTP (Clerk launch) |

## Manifest

`public/manifest.webmanifest` sets `start_url` to `/app-bootstrap` so an installed icon opens the role router instead of always landing on `/feed`.

## Role routing (`/app-bootstrap`)

| Role | Destination |
|------|-------------|
| `customer` | `/feed` |
| `merchant_admin`, `merchant_staff` | `/merchant/dashboard` |
| `admin` | `/admin` |
| `agent` | `/agent` |
| `founder@maanta.app` (admin role) | `/founder` |

Unauthenticated visitors are sent to `/login?next=/app-bootstrap`.

## Clerk configuration

Set in `.env` (defaults in `.env.example`):

```
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app-bootstrap
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app-bootstrap
```

## Service worker

`InstallPrompt` (in-app sheet) and `PwaInstallButton` (`/download`) register `/sw.js` when the browser supports it.

## Tester checklist

1. Open `/download` on a phone (HTTPS).
2. Tap **Install Maanta** or follow manual steps.
3. Sign in at `/login` with a test account (see `docs/ops/test-accounts-seed-2026-07.md`).
4. Confirm you land on the correct dashboard (shopper → feed, merchant → dashboard, etc.).
5. Close the browser tab and reopen from the home-screen icon — should hit `/app-bootstrap` again.

## Dev notes

- Local `http://localhost:3000` may not show `beforeinstallprompt`; manual install steps still apply.
- Interactive browser testing requires valid Clerk keys when `MAANTA_AUTH_STRATEGY=clerk` — see `AGENTS.md`.
