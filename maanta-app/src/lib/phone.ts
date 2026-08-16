/** Kenyan mobile: 07XXXXXXXX, +2547XXXXXXXX, or 2547XXXXXXXX. */
export function isValidKenyanPhone(phone: string): boolean {
  const normalized = phone.replace(/[\s-]/g, "");
  return /^(\+?254|0)?7\d{8}$/.test(normalized);
}

/**
 * A phone number from anywhere, in E.164 shape.
 *
 * Used for the **shop contact number on the admin-assisted onboarding route
 * only**. Every other caller stays on {@link isValidKenyanPhone}, and the split
 * is deliberate rather than a relaxation that leaked:
 *
 *  - `/api/topup` sends the number to M-Pesa. A non-Kenyan MSISDN cannot receive
 *    an STK push, so a wider check there would turn a clear 400 into a failed
 *    payment. It keeps the Kenyan rule.
 *  - `/api/merchants/onboard` is the *merchant-authored* path — a shop owner
 *    standing in BBS Mall, Nairobi. A foreign number there is far more likely a
 *    typo than a fact. It keeps the Kenyan rule.
 *  - `/api/admin/merchants/onboard` is an admin acting deliberately, and during
 *    the friends-and-family pilot the people behind a test shop are not all in
 *    Kenya. Refusing their number blocks the rehearsal without protecting
 *    anything: `merchants.phone` is a contact field. No CHECK constraint governs
 *    it, staff linking keys on `merchant_staff.phone` against `users.phone`
 *    rather than on this column, and the top-up flow takes the paying number
 *    from its own request body.
 *
 * Still a real check, not a waved-through string: E.164 allows at most 15
 * digits, and a country code is at least one, so a plausible international
 * number carries 8–15 digits after separators are stripped. That rejects the
 * junk this is actually likely to catch — a name, a stray word, a truncated
 * paste — while accepting +47 969 51 162 and +20 103 800 6802 alike.
 */
export function isValidInternationalPhone(phone: string): boolean {
  const normalized = phone.replace(/[\s-()]/g, "");
  return /^\+?\d{8,15}$/.test(normalized);
}
