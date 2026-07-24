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
export function maskPhone(full: string | null | undefined): string | null {
  if (!full) return null;
  const trimmed = String(full).trim();
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  // Fewer than 6 digits can't be masked without either revealing most of it or
  // being meaningless — omit rather than show something misleading.
  if (digits.length < 6) return null;

  // Kenyan E.164: 254 + 9 national digits (first digit typically 7 or 1).
  const ke = digits.match(/^254(\d)\d{5}(\d{3})$/);
  if (ke) {
    return `+254 ${ke[1]}xx xxx ${ke[2]}`;
  }

  // Generic fallback: first 2 + last 3 visible, middle masked.
  const front = digits.slice(0, 2);
  const last3 = digits.slice(-3);
  const maskedCount = Math.max(2, digits.length - 5);
  return `${hadPlus ? "+" : ""}${front}${"x".repeat(maskedCount)} ${last3}`;
}
