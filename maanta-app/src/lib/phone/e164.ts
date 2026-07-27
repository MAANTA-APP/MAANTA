import { matchDialCode } from "@/lib/phone/country-codes";
import { isValidKenyanPhone } from "@/lib/phone";

/** ITU E.164: leading +, country code 1–3 digits, subscriber 6–14 digits total. */
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** Minimum national (subscriber) digits after the country code — blocks SMS-pump typos. */
export const MIN_NATIONAL_DIGITS = 6;

export function stripToDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Combine a dial code and local number into a single E.164 string.
 * Strips formatting and a single leading trunk zero from the local part.
 */
export function buildE164(dialCode: string, localNumber: string): string {
  const cc = dialCode.startsWith("+") ? dialCode : `+${stripToDigits(dialCode)}`;
  const national = stripToDigits(localNumber).replace(/^0+/, "");
  return `${cc}${national}`;
}

export function isValidE164(phone: string): boolean {
  if (!E164_REGEX.test(phone)) return false;
  const country = matchDialCode(phone);
  if (!country) return false;
  return phone.slice(country.dialCode.length).length >= MIN_NATIONAL_DIGITS;
}

/**
 * Normalize arbitrary user input to E.164 when possible.
 * Kenyan local formats (07…, 7…, 254…) normalize to +254; other +CC
 * numbers pass through when they match E.164.
 */
export function normalizeToE164(raw: unknown, defaultDialCode = "+254"): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/[\s().\-]/g, "");
  if (!s) return null;

  if (s.startsWith("+")) {
    if (s.startsWith("+2540")) s = `+254${s.slice(5)}`;
    if (isValidE164(s)) return s;
    return null;
  }

  if (isValidKenyanPhone(s)) {
    const built = buildE164("+254", s.replace(/^(\+?254|0)/, ""));
    return isValidE164(built) ? built : null;
  }

  const built = buildE164(defaultDialCode, s);
  return isValidE164(built) ? built : null;
}

export function parseE164(
  e164: string
): { dialCode: string; localNumber: string } | null {
  if (!isValidE164(e164)) return null;
  const country = matchDialCode(e164);
  if (!country) return null;
  return {
    dialCode: country.dialCode,
    localNumber: e164.slice(country.dialCode.length),
  };
}

export type PhoneValidation =
  | { ok: true; e164: string }
  | { ok: false; error: string };

/** Server-side guard for API bodies that require a phone number. */
export function validatePhoneField(
  raw: unknown,
  opts: { required?: boolean; label?: string } = {}
): PhoneValidation {
  const { required = true, label = "phone number" } = opts;
  if (raw == null || (typeof raw === "string" && !raw.trim())) {
    if (!required) return { ok: true, e164: "" };
    return { ok: false, error: `A valid ${label} is required.` };
  }
  const e164 = normalizeToE164(raw);
  if (!e164) {
    return {
      ok: false,
      error: `Enter a valid ${label} in international format (e.g. +44…, +47…, +254…).`,
    };
  }
  return { ok: true, e164 };
}
