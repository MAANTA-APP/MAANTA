# PWA install & role bootstrap

Last updated: 2026-08-12

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

**`/download` is the only install surface.** The auto bottom sheet that used to
appear on home — `src/components/install-prompt.tsx`, exporting `InstallPrompt` —
was deleted whole in the 2026-08-06 dead-code sweep because nothing imported it
(`docs/ops/dead-code-cleanup-2026-08-06.md`). `usePwaInstall` kept its one live
consumer, the `/download` panel. Whether install should be re-offered inside the
app is an open decision, not an oversight — see **D91** and
`docs/ops/pwa-status-2026-08-12.md`.

The service worker does **not** cache anything (`push` + `notificationclick`
only), so the app has no offline capability, and it is unverified whether Chrome
ever fires `beforeinstallprompt` without a `fetch` handler — i.e. whether step 2
above ever happens in production. See **D92** and **D93**.

## Role bootstrap

After Clerk sign-in/sign-up, fallback redirect is **`/app-bootstrap`**
(`NEXT_PUBLIC_CLERK_SIGN_*_FALLBACK_REDIRECT_URL`, defaults in
`src/components/auth/auth-providers.tsx`). Not `src/app/layout.tsx` — that layout
deliberately mounts no auth provider, so a marketing visitor never downloads the
auth SDK.

`/app-bootstrap` (client):

1. If signed out → `/login?next=/app-bootstrap`
2. `GET /api/me` → `{ role }` from `ensureAppUser`
3. `destinationForRole(role)` → home for that role

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
