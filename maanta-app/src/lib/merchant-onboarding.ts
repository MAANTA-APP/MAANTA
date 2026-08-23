/**
 * When the merchant onboarding wizard may proceed without an owner phone
 * (D158, founder ruling 2026-08-23, option B).
 *
 * One module because the rule has two enforcement points that must not drift:
 * the wizard's step-1 Continue button and `/api/merchants/onboard`. The route
 * is the real gate — it re-derives `hasVerifiedEmail` from the session and
 * never trusts the client — but a form that disagrees with the server just
 * produces a 400 the merchant cannot act on, so both read this.
 *
 * "Verified email" is `public.users.email` being set. That column is written
 * from `verifiedPrimaryEmail()` alone (a Clerk-VERIFIED primary address, or the
 * address behind a Supabase email-OTP session) and is frozen against its holder
 * by D142, so a value being present IS proof the account controls that mailbox.
 * This is the same signal D154 linked staff seats on. Do not substitute the
 * email the merchant TYPES into the wizard: that is shop contact detail nobody
 * has proven, and using it would let anyone skip the field by typing anything.
 */

/**
 * Whether the owner phone must be filled in before onboarding can be submitted.
 * Phone stays required for an account with no verified email, which is the
 * pre-D158 behaviour and still the case under the Supabase strategy when no
 * address reached `users.email`.
 */
export function isOwnerPhoneRequired(hasVerifiedEmail: boolean): boolean {
  return !hasVerifiedEmail;
}

/**
 * Whether step 1 ("Business details") is complete enough to continue.
 * Shop name is always required; the phone only when there is no verified email.
 */
export function isBusinessStepComplete({
  shopName,
  ownerPhone,
  hasVerifiedEmail,
}: {
  shopName: string;
  ownerPhone: string;
  hasVerifiedEmail: boolean;
}): boolean {
  if (!shopName.trim()) return false;
  if (isOwnerPhoneRequired(hasVerifiedEmail)) return ownerPhone.trim().length > 0;
  return true;
}
