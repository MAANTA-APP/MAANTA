// Validation + normalization for public waitlist signups. Pure functions so
// the whole policy is unit-testable without a DB. The API route is a thin
// wrapper: validate here, insert via the service client there.

export const WAITLIST_SEGMENTS = ["shopper", "merchant", "mall_operator"] as const;
export type WaitlistSegment = (typeof WAITLIST_SEGMENTS)[number];

// Shown next to the consent checkbox on every form AND stored verbatim on
// each row (consent_text) as the DPA evidence trail. If this wording
// changes, old rows keep the wording that was actually shown to them —
// that's the point — so never rewrite historical consent_text.
export const CONSENT_TEXT =
  "I agree to receive MAANTA launch updates by email and SMS. " +
  "I can unsubscribe at any time.";

export const DEFAULT_NODE_INTEREST = "BBS Mall";

// Generous cap for every free-text field: long enough for any real value,
// short enough to stop copy-pasted junk from bloating the table.
const MAX_FIELD_LENGTH = 200;

export type WaitlistSignupInsert = {
  segment_type: WaitlistSegment;
  email: string;
  phone: string;
  full_name: string | null;
  city: string;
  node_interest: string;
  source_campaign: string | null;
  source_medium: string | null;
  source_channel: string | null;
  consent_text: string;
  business_name: string | null;
  business_category: string | null;
  floor_unit: string | null;
  mall_name: string | null;
  mall_role: string | null;
};

export type WaitlistValidation =
  | { ok: true; row: WaitlistSignupInsert }
  | { ok: false; error: string };

function cleanOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed.length ? trimmed : null;
}

function cleanRequired(value: unknown): string | null {
  return cleanOptional(value);
}

// Deliberately simple shape check — the real dedupe/quality gate is the
// unique constraint plus the double-entry cost of a fake email (you get no
// launch access email). Rejects whitespace and missing @/domain-dot.
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > MAX_FIELD_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

// Accepts the ways people actually type Kenyan mobile numbers
// (0712 345 678, 254712345678, +254712345678) and normalizes them all to
// +2547… / +2541…. Non-Kenyan numbers are allowed in generic E.164 form —
// diaspora shoppers and international operators are real signups.
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s\-().]/g, "");

  let m = digits.match(/^0([17]\d{8})$/);
  if (m) return `+254${m[1]}`;

  m = digits.match(/^\+?254([17]\d{8})$/);
  if (m) return `+254${m[1]}`;

  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;

  return null;
}

export function validateWaitlistSignup(payload: unknown): WaitlistValidation {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "Invalid request body." };
  }
  const body = payload as Record<string, unknown>;

  // Honeypot: a visually hidden "website" field. Humans leave it empty;
  // form-filling bots don't. Report success so the bot learns nothing.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return { ok: false, error: "honeypot" };
  }

  const segment = body.segmentType;
  if (
    typeof segment !== "string" ||
    !(WAITLIST_SEGMENTS as readonly string[]).includes(segment)
  ) {
    return { ok: false, error: "Unknown signup type." };
  }

  const email = normalizeEmail(body.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };

  const phone = normalizePhone(body.phone);
  if (!phone) {
    return {
      ok: false,
      error: "Enter a valid phone number, e.g. 0712 345 678.",
    };
  }

  const city = cleanRequired(body.city);
  if (!city) return { ok: false, error: "Enter your city." };

  if (body.consent !== true) {
    return { ok: false, error: "Please accept the updates consent to join." };
  }

  const row: WaitlistSignupInsert = {
    segment_type: segment as WaitlistSegment,
    email,
    phone,
    full_name: cleanOptional(body.fullName),
    city,
    node_interest: cleanOptional(body.nodeInterest) ?? DEFAULT_NODE_INTEREST,
    source_campaign: cleanOptional(body.utmCampaign),
    source_medium: cleanOptional(body.utmMedium),
    source_channel: cleanOptional(body.utmSource),
    consent_text: CONSENT_TEXT,
    business_name: null,
    business_category: null,
    floor_unit: null,
    mall_name: null,
    mall_role: null,
  };

  if (segment === "merchant") {
    const businessName = cleanRequired(body.businessName);
    if (!businessName) {
      return { ok: false, error: "Enter your business name." };
    }
    const businessCategory = cleanRequired(body.businessCategory);
    if (!businessCategory) {
      return { ok: false, error: "Enter your business category." };
    }
    row.business_name = businessName;
    row.business_category = businessCategory;
    row.floor_unit = cleanOptional(body.floorUnit);
  }

  if (segment === "mall_operator") {
    const mallName = cleanRequired(body.mallName);
    if (!mallName) return { ok: false, error: "Enter the mall name." };
    const mallRole = cleanRequired(body.mallRole);
    if (!mallRole) {
      return { ok: false, error: "Enter your role at the mall." };
    }
    row.mall_name = mallName;
    row.mall_role = mallRole;
  }

  return { ok: true, row };
}
