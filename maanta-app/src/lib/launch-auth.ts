/**
 * Launch auth mix — an OPEN founder decision, kept behind a flag with BOTH
 * options enabled (S2 ruling 2026-07-23; the phone-only vs email+phone launch
 * mix is deliberately not yet picked).
 *
 * Two things are frozen and do NOT depend on this flag:
 *   1. Browsing never requires a phone or any payment step.
 *   2. Claiming a deal ALWAYS requires a verified phone (SMS OTP) — enforced
 *      server-side in src/app/api/redemptions/route.ts via
 *      currentUserHasVerifiedPhone(). That invariant holds in EVERY mode, so the
 *      claim gate must never be made conditional on this flag.
 *
 * What the flag selects is only the SIGN-UP / SIGN-IN mix the launch offers:
 *   - "email_and_phone" (default, current S2 ruling): both methods offered at
 *     sign-up; phone stays optional at sign-up and is required at claim.
 *   - "phone_only": a stricter launch where phone is the sole/required sign-up
 *     method. Left available so the founder can flip to it without a code change.
 *
 * Both modes are ENABLED here — neither is removed. The default reflects the
 * shipped S2 ruling; NEXT_PUBLIC_LAUNCH_AUTH_MODE can override it.
 *
 * SPEC-GAP: the actual enablement of Clerk sign-up factors (email address,
 * phone SMS-OTP) lives in the Clerk dashboard (User & Authentication), not in
 * app code — Clerk owns which factors a hosted <SignIn/> / <SignUp/> renders.
 * This module records the decision surface and the default in code and is the
 * single place to branch app-side policy on the mix; keeping the two in sync is
 * a deploy-config step (see docs/skills/clerk-auth.md).
 */

export type LaunchAuthMode = "email_and_phone" | "phone_only";

/** Every launch mode the flag supports — both enabled, none removed. */
export const LAUNCH_AUTH_MODES: readonly LaunchAuthMode[] = [
  "email_and_phone",
  "phone_only",
] as const;

/** Default launch mix — the shipped S2 ruling (2026-07-23). Not a final pick. */
export const DEFAULT_LAUNCH_AUTH_MODE: LaunchAuthMode = "email_and_phone";

/**
 * The active launch auth mix. Reads NEXT_PUBLIC_LAUNCH_AUTH_MODE and falls back
 * to the default; an unrecognised value falls back too (fail safe to the
 * shipped ruling rather than an undefined mode).
 */
export function launchAuthMode(): LaunchAuthMode {
  const raw = process.env.NEXT_PUBLIC_LAUNCH_AUTH_MODE?.trim();
  return LAUNCH_AUTH_MODES.includes(raw as LaunchAuthMode)
    ? (raw as LaunchAuthMode)
    : DEFAULT_LAUNCH_AUTH_MODE;
}

/** Email sign-in offered? True in email_and_phone; false in phone_only. */
export function emailSignInEnabled(): boolean {
  return launchAuthMode() === "email_and_phone";
}

/** Phone sign-in / OTP offered? True in every mode (phone is always available). */
export function phoneSignInEnabled(): boolean {
  return true;
}

/**
 * Phone required to CLAIM a deal. Frozen TRUE in every mode — the claim gate is
 * an invariant, never toggled by the launch mix. Exposed as a named constant so
 * the gate reads as policy, not a magic literal.
 */
export const PHONE_REQUIRED_AT_CLAIM = true as const;
