# PWA install & role bootstrap

Last updated: 2026-07-27

## Routes

| Route | Purpose |
|---|---|
| `/download` | Install landing — primary “Install the app” destination |
| `/app-bootstrap` | Post-login + PWA `start_url` — routes by `public.users.role` |
| `/select-mall` | Optional mall picker (still available; no longer the Clerk default) |

## Install flow

1. User opens `/download` (linked from home, FAQ, demo, install bottom sheet).
2. Chrome/Android: `beforeinstallprompt` → primary CTA **Add Maanta to my phone** via `usePwaInstall` (`src/lib/pwa/usePwaInstall.ts`).
3. iOS Safari: no install event — show Share → Add to Home Screen instructions.
4. Service worker: `public/sw.js` (push + notification click only; registered by the hook).
5. Manifest: `public/manifest.webmanifest` — `start_url: /app-bootstrap`, `display: standalone`.

Home still mounts `InstallPrompt` (auto bottom sheet) which reuses the same hook and links to `/download` for tips.

## Role bootstrap

After sign-in/sign-up (Clerk **or** Supabase email OTP), redirect is
**`/app-bootstrap`** (`NEXT_PUBLIC_CLERK_SIGN_*_FALLBACK_REDIRECT_URL` for Clerk;
Supabase OTP verify and `/auth/callback` also land here).

`/app-bootstrap` (client, **strategy-aware** as of 2026-07-28):

1. Detect session:
   - **Clerk:** `useAuth()` (`isLoaded` / `isSignedIn`)
   - **Supabase / authjs:** `useSupabaseSignedIn()` (`null` = loading)
2. If signed out → `/login?next=/app-bootstrap`
3. `GET /api/me` → `{ role }` from `ensureAppUser`
4. `destinationForRole(role)` → home for that role

| Role | Destination |
|---|---|
| `customer` | `/feed` |
| `merchant_admin` / `merchant_staff` | `/merchant/dashboard` |
| `admin` | `/admin` |
| `agent` | `/agent` |
| `founder` / `cofounder` | `/founder` (reserved; not DB roles today) |
| unknown / missing | `/feed` (+ console warn) |

Helper: `src/lib/pwa/app-bootstrap.ts`. Phone/country logic is intentionally **not** used here.

## Env

```
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app-bootstrap
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app-bootstrap
```

Update Vercel if production still points at `/select-mall`.

## Related

- `docs/skills/clerk-auth.md` — Clerk + Supabase JWT
- `docs/skills/role-permissions.md` — role guards
- `docs/ops/tech-stack-deep-dive-2026-07.md` — stack context (when present on branch)
