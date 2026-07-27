# Skill — Global phone auth (E.164 UI + Clerk SMS)

**Status:** UI and flows implemented; **SMS OTP is launch-only** (Clerk).  
**Related:** `docs/ops/auth-strategies.md`, `docs/skills/clerk-auth.md`.

## Launch behaviour (MAANTA_AUTH_STRATEGY=clerk)

- Global E.164 phone input (`PhoneField`, country-code dropdown) on `/verify-phone`
  and wherever phone capture is needed.
- Clerk owns SMS OTP for sign-in (dashboard-configured) and for the
  phone-required-at-claim gate (`/verify-phone`).
- Claim route returns `phone_required` (403) when the Clerk account has no
  verified phone — shopper completes OTP on `/verify-phone`, then returns to the deal.

## Dev/test behaviour (MAANTA_AUTH_STRATEGY=supabase)

- **Phone UI stays in the codebase** — do not remove `PhoneField`, `OtpInput`, or
  `/verify-phone` Clerk flow.
- Phone SMS OTP is **not active** during rehearsal (avoids Clerk SMS charges).
- Sign-in is **email-first** via Supabase Auth on `/login`.
- `/verify-phone` shows copy: “use email to sign in; phone OTP will be enabled for launch.”
- Claim gate is relaxed in dev (`phoneOtpEnabled()` false) so email-only sessions
  can claim deals for end-to-end rehearsal.

## Switching to launch

1. Set auth strategy to `clerk` (see `docs/ops/auth-strategies.md`).
2. Configure Clerk SMS for Kenya / global numbers in the Clerk dashboard.
3. Restore full “email or phone” messaging on `/login` (Clerk hosted UI handles this).
4. Verify claim → `/verify-phone` → return to deal on a real device.

## Frozen invariant

`PHONE_REQUIRED_AT_CLAIM` remains true in production Clerk mode. The launch mix
flag (`NEXT_PUBLIC_LAUNCH_AUTH_MODE`) only affects which sign-in factors Clerk
offers — it does not disable the claim phone gate.
