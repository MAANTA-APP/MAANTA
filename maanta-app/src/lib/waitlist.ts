/**
 * Pre-launch waitlist: segments, validation, and phone normalization.
 * Canonical field names come from docs/maanta-waitlist-data-schema.md —
 * keep them identical across the form, this API, and the email platform.
 */

import { normalizeToE164 } from "@/lib/phone/e164";

export const WAITLIST_SEGMENTS = ["shopper", "merchant", "mall_operator"] as const;
export type WaitlistSegment = (typeof WAITLIST_SEGMENTS)[number];

export function isWaitlistSegment(value: unknown): value is WaitlistSegment {
  return (
    typeof value === "string" &&
    (WAITLIST_SEGMENTS as readonly string[]).includes(value)
  );
}

/**
 * Exact consent wording shown at signup. Stored with every contact
 * (Kenya DPA 2019 — consent timestamp + wording required before any
 * email sequence). Align with legal/privacy-policy.md before go-live.
 */
export const WAITLIST_CONSENT_TEXT =
  "I agree to receive MAANTA launch updates and relaunch marketing emails — including merchant offers at BBS Mall and deal updates across Nairobi. I can unsubscribe at any time.";

/** Node 0. All pre-launch signups default to this node interest. */
export const WAITLIST_NODE_INTEREST = "BBS Mall";

export type WaitlistSubmission = {
  segment: WaitlistSegment;
  fullName: string;
  email: string;
  /** E.164; Kenyan numbers normalized to +254. */
  phone: string;
  businessName: string | null;
  note: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/**
 * Normalize a phone number to E.164. Kenyan local formats normalize to +254;
 * other international numbers pass through when valid E.164.
 */
export function normalizeWaitlistPhone(raw: unknown): string | null {
  return normalizeToE164(raw);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

export type WaitlistValidation =
  | { ok: true; data: WaitlistSubmission }
  | { ok: false; error: string };

export function validateWaitlistSubmission(body: unknown): WaitlistValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request." };
  }
  const b = body as Record<string, unknown>;

  if (!isWaitlistSegment(b.segment)) {
    return { ok: false, error: "Pick whether you're joining as a shopper, merchant, or mall operator." };
  }

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  if (!fullName) return { ok: false, error: "Your name is required." };
  if (fullName.length > 120) return { ok: false, error: "Name is too long." };

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const phone = normalizeWaitlistPhone(b.phone);
  if (!phone) {
    return {
      ok: false,
      error:
        "Enter a valid phone number in international format (e.g. +44…, +47…, +254 712 345 678).",
    };
  }

  if (b.consent !== true) {
    return { ok: false, error: "Please agree to receive launch updates to join the waitlist." };
  }

  return {
    ok: true,
    data: {
      segment: b.segment,
      fullName,
      email,
      phone,
      businessName: optionalText(b.businessName, 160),
      note: optionalText(b.note, 1000),
      utmSource: optionalText(b.utmSource, 100),
      utmMedium: optionalText(b.utmMedium, 100),
      utmCampaign: optionalText(b.utmCampaign, 100),
    },
  };
}
