# Global E.164 phone auth — implementation handoff

Last updated: 2026-07-27

## What shipped

- **Full country dropdown:** `src/lib/phone/country-codes.ts` (ITU dial codes, vendored JSON).
- **E.164 helpers:** `src/lib/phone/e164.ts` — `buildE164`, `isValidE164`, `normalizeToE164`, `validatePhoneField`.
- **UI component:** `src/components/phone/international-phone-input.tsx` — searchable dropdown, flags, accessible keyboard nav.
- **Backward compat:** `PhoneField` in `src/components/ui/inputs.tsx` re-exports the new component.
- **Forms updated:** `/verify-phone`, waitlist, merchant onboard, staff, agent leads, merchant signup landing.
- **API validation:** `/api/merchants/onboard`, `/api/staff`, `/api/leads` reject non-E.164 phones.
- **Help:** `/help/phone-login` + copy on `/download` and `/login` (Clerk shell).
- **Ops:** `docs/ops/global-rollout.md`, updates to `test-accounts.md`, `pwa-install.md`, `access-matrix.md`.

## Clerk dashboard (required for live SMS)

Phone sign-in UI is **Clerk-hosted** (`<SignIn />` / `<SignUp />`). Enable in Clerk:

1. **User & Authentication → Phone** — allow SMS OTP sign-in.
2. **SMS** — international delivery for +47, +44, +254, +256 (expand as rollout grows).
3. **Attack protection** — SMS pumping / bot resistance per Clerk plan.
4. Instance: `cheerful-sailfish-3` (see `supabase/config.toml`).

App code does **not** call Twilio directly today (placeholder in `.env.example` only).

## Frozen exceptions

- **M-Pesa top-up** (`/api/topup`) stays Kenya-only via `isValidKenyanPhone()`.
- **Claim gate** still requires verified phone on the Clerk account (`PHONE_REQUIRED_AT_CLAIM`).

## Tests

- `src/lib/phone/__tests__/e164.test.ts` — E.164 build/validate for UK, Norway, Kenya, Uganda.
- `src/lib/__tests__/waitlist.test.ts` — waitlist normalization uses shared E.164 helpers.

## Rollout path (comment in code + docs)

Short term: BBS Mall + diaspora testers (KE, NO, GB, UG).  
Medium term: nationwide Kenya, then neighboring countries — same E.164 infrastructure.
