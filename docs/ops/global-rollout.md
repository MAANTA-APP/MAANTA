# Global rollout — phone auth & PWA

Last updated: 2026-07-27

## Why E.164 from day one

Maanta intentionally uses **E.164 phone auth**, a **full country-code dropdown**, and **PWA install** so we can move from a single mall to nationwide Kenya and then international markets **without rewriting auth**.

| Phase | Geography | Phone auth |
|---|---|---|
| **0–3 months** | Node 0 (BBS Mall), Nairobi testers, diaspora in Norway / UK / Uganda | Login open globally; heavy testing on +254, +47, +44, +256 |
| **3–12 months** | Nationwide Kenya (multiple malls / cities), early merchants in neighboring countries | Same E.164 + OTP infrastructure; Clerk SMS routing expanded per country |
| **12+ months** | New countries if traction continues | No app rewrite — configure SMS regions and nodes |

## Technical choices

- **Canonical storage:** phone numbers stored as E.164 strings (`+447912345678`, `+254712345678`, …).
- **UI:** `InternationalPhoneInput` with searchable ITU country list (`src/lib/phone/country-codes.ts`).
- **Validation:** `^\+[1-9]\d{6,14}$` plus minimum national digit length (`src/lib/phone/e164.ts`).
- **Login:** Clerk hosted sign-in supports phone SMS OTP; enable international delivery in the Clerk dashboard.
- **Claim gate:** verified phone required at claim (`/verify-phone`); separate from sign-in method.
- **M-Pesa top-up:** remains **Kenya-only** (`isValidKenyanPhone`) — payments rail ≠ auth rail.

## SMS / fraud controls

Configure in **Clerk** (and any future direct SMS provider):

- International SMS routing for +47, +44, +254, +256 at minimum.
- OTP expiry 5–10 minutes (Clerk default).
- Rate limits: Clerk dashboard + app-side cooldowns (e.g. 30s resend on `/verify-phone`).
- SMS pumping protection via Clerk fraud settings and per-number send caps.

## Tester examples (E.164)

| Country | Example E.164 | Notes |
|---|---|---|
| United Kingdom | `+447912345678` | Remote PWA testers |
| Norway | `+4791234567` | Friends & family abroad |
| Kenya | `+254712345678` | Node 0 primary market |
| Uganda | `+256712345678` | East Africa expansion rehearsal |

## Related docs

- `docs/ops/pwa-install.md` — install + `/app-bootstrap` role routing
- `docs/ops/test-accounts.md` — seeded rehearsal personas
- `docs/skills/global-phone-auth.md` — implementation handoff
