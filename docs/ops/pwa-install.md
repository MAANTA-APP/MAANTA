# PWA install — `/download` and role routing

Last updated: 2026-07-27

## Install landing

- **URL:** `/download`
- **Message:** “Install Maanta on your phone to work faster.”
- **CTA:** “Add Maanta to my phone” (when `beforeinstallprompt` is available)
- **Sign-in:** Phone (E.164 + SMS OTP) or email — see `/help/phone-login`
- Device-specific instructions for Android, iPhone, and desktop

## PWA assets

| File | Purpose |
|---|---|
| `public/manifest.webmanifest` | `standalone`, `start_url: /app-bootstrap` |
| `public/sw.js` | Static precache + push notifications |
| `public/icon.png` / `icon-192.png` | Manifest icons |
| `src/components/pwa-registrar.tsx` | Registers SW at app boot |

## Post-login routing

`/app-bootstrap` reads `public.users.role` and redirects:

| Role | Route |
|---|---|
| `customer` | `/feed` |
| `merchant_admin` / `merchant_staff` | `/merchant/dashboard` |
| `admin` | `/admin` |
| `agent` | `/agent` |
| `cofounder` | `/founder` |

Clerk fallback redirect defaults to `/app-bootstrap` (see `.env.example`).

## Hooks

- `usePwaInstall()` — `src/lib/pwa/usePwaInstall.ts`
- `PwaInstallButton` — reusable install CTA
