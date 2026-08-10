/**
 * Server-side phone masking for merchant-facing screens.
 *
 * The merchant counter is shown a MASKED shopper phone so staff can sanity-check
 * they're serving the right person, without exposing the full number (privacy —
 * the full phone never leaves the server). Masking always happens server-side;
 * only the masked string is sent to the client.
 *
 * Format decision (reasonable default; Kenya pilot, BBS Mall):
 *   Kenyan E.164 (+254 + 9 national digits) → "+254 7xx xxx 678"
 *     (country code + first national digit + last 3 digits; middle masked).
 *   Anything else that still has enough digits → reveal the first 2 and last 3,
 *     mask the middle: e.g. "+44xxxxx 890".
 *   Too short / empty / null → null (the UI then omits the line entirely).
 *
 * This never reveals more than the country code, one leading digit, and the last
 * three digits — enough to recognise "your" number, not enough to identify a
 * stranger's.
 */
export function maskPhone(
  full: string | null | undefined,
  /**
   * Character used for the masked digits. Presentation only — it never changes
   * WHICH digits are revealed, which is the part that matters and is decided
   * once, here.
   *
   * This parameter exists so `lib/ui.ts` can keep its bullet styling without
   * carrying a second implementation. It used to have one, and that copy
   * returned the number COMPLETELY UNMASKED for inputs under 7 characters —
   * the predictable cost of a duplicated rule, and the reason this one is now
   * the only masker in the codebase.
   */
  maskChar: string = "x"
): string | null {
  if (!full) return null;
  const trimmed = String(full).trim();
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  // Fewer than 6 digits can't be masked without either revealing most of it or
  // being meaningless — omit rather than show something misleading.
  if (digits.length < 6) return null;

  const m = maskChar;

  // Kenyan E.164: 254 + 9 national digits (first digit typically 7 or 1).
  const ke = digits.match(/^254(\d)\d{5}(\d{3})$/);
  if (ke) {
    return `+254 ${ke[1]}${m}${m} ${m}${m}${m} ${ke[2]}`;
  }

  // Generic fallback (non-Kenya). Only reveal when the number is long enough
  // that the mask actually conceals it: reveal the first 2 and last 2 digits and
  // mask the rest. A short number (e.g. 6 digits) would leak most of itself, so
  // return null instead. E.164 numbers run 8–15 digits, so requiring ≥ 9 keeps
  // at least 5 digits hidden.
  if (digits.length < 9) return null;
  const front = digits.slice(0, 2);
  const last2 = digits.slice(-2);
  const maskedCount = digits.length - 4;
  return `${hadPlus ? "+" : ""}${front}${m.repeat(maskedCount)} ${last2}`;
}
