/**
 * Pre-launch waitlist: segments, validation, and phone normalization.
 * Canonical field names come from docs/maanta-waitlist-data-schema.md —
 * keep them identical across the form, this API, and the email platform.
 */
import {
  PILOT_LOCATION_OPTIONS,
  PILOT_LOCATION_OTHER_MAX,
  isPilotLocationValue,
  storedPilotLocation,
  type PilotLocationValue,
} from "@/lib/marketing/pilot-status";

export const WAITLIST_SEGMENTS = ["shopper", "merchant", "mall_operator"] as const;
export type WaitlistSegment = (typeof WAITLIST_SEGMENTS)[number];

export function isWaitlistSegment(value: unknown): value is WaitlistSegment {
  return (
    typeof value === "string" &&
    (WAITLIST_SEGMENTS as readonly string[]).includes(value)
  );
}

/**
 * Read a segment out of a URL parameter, tolerating the spellings that already
 * exist in the wild: `?segment=merchant` (the landing form and older links),
 * `?role=shopper` (board 2), and `?role=mall-operator` (the mall-operators page
 * has linked that hyphenated form since 2026-07-31). Anything else is "not
 * chosen yet", which sends the visitor to role selection rather than guessing.
 */
export function parseWaitlistSegmentParam(value: unknown): WaitlistSegment | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return isWaitlistSegment(normalized) ? normalized : null;
}

/**
 * Segment options in canonical order. Shared by the landing early-access
 * form and the full waitlist form so the two entry points cannot drift —
 * a shopper-labelled option that posts `merchant` would corrupt the
 * segmentation the email plan reads from.
 */
export const WAITLIST_SEGMENT_OPTIONS: {
  value: WaitlistSegment;
  label: string;
}[] = [
  { value: "shopper", label: "Shopper" },
  { value: "merchant", label: "Shop owner or staff" },
  { value: "mall_operator", label: "Mall operator" },
];

/**
 * "Other" is not offered. `waitlist_signups.segment` is constrained to the
 * three values above (migration `20260904130000`); adding a fourth needs a
 * migration, which is a separate founder authorisation (readiness report,
 * 2026-09-05). Until then a visitor who fits none of the three picks the
 * closest, and the form says so.
 */
export const WAITLIST_AUDIENCE_NOTE = "Not one of these? Pick the closest; the message is the same.";

/**
 * The channels a signup may be reached on, as the consent wording names them.
 * Consent is recorded verbatim with its timestamp on every row; whether that
 * record satisfies every applicable legal requirement is a compliance matter
 * rechecked before genuine marketing begins (register D270).
 */
export const WAITLIST_CONSENTED_CHANNELS = ["email", "whatsapp", "sms"] as const;

/**
 * The channels MAANTA may actually use today.
 *
 * **Invariant (founder ruling 2026-09-05, D269): CONSENTED CHANNEL ≠ ACTIVATED
 * CHANNEL.** The consent wording naming a channel future-proofs the record; it
 * does not switch the channel on. Email is the approved launch channel. WhatsApp
 * and SMS are not activated, and neither may be used merely because the wording
 * names them — each needs its own provider, operational and compliance
 * readiness before it is added here, and this codebase has no sender for
 * either. `waitlist.test.ts` holds this list to a subset of the consented one
 * and to email alone until that changes by ruling.
 */
export const WAITLIST_ACTIVATED_CHANNELS = ["email"] as const;

/**
 * Exact consent wording shown at signup. Stored with every contact, verbatim,
 * with its timestamp. Align with legal/privacy-policy.md before go-live.
 *
 * **Widened 2026-09-05 (founder ruling, register D269).** Email is the launch
 * channel — it is the only sender this codebase has — but design board 2's
 * "phone first" instinct is right for Nairobi, and a consent that named only
 * email would mean asking every early signup again the day WhatsApp or SMS is
 * activated. So the wording names all three channels now, while the waitlist
 * is empty and the cost of widening is one line. See the invariant above:
 * naming a channel here activates nothing.
 *
 * **Rows already stored keep the text they were shown.** The consent record
 * must go on representing what the person actually agreed to at the time; it
 * is never rewritten to the current wording.
 */
export const WAITLIST_CONSENT_TEXT =
  "I agree to receive MAANTA pilot updates and marketing messages by email, WhatsApp or SMS — including shop offers and deal updates across Nairobi. I can unsubscribe at any time.";

/**
 * The preferred-location question. One central list, shared with the merchant
 * form and validated server-side against the same values
 * (`lib/marketing/pilot-status.ts`). The answer is a preference, stored in
 * `node_interest`; it is never evidence of a relationship with a mall.
 */
export const WAITLIST_LOCATION_OPTIONS = PILOT_LOCATION_OPTIONS;
export type WaitlistLocationChoice = PilotLocationValue;

/**
 * "What do you usually shop for?" — optional chips, closed list. Stored on the
 * mirror only (`waitlist_signups.interests`); Resend has no property for it and
 * does not need one, because this exists to be counted, not sent to.
 */
export const SHOPPER_INTERESTS = [
  { value: "clothes", label: "Clothes" },
  { value: "shoes", label: "Shoes" },
  { value: "kids", label: "Kids" },
  { value: "phones", label: "Phones" },
  { value: "household", label: "Household" },
  { value: "food", label: "Food" },
] as const;
export type ShopperInterest = (typeof SHOPPER_INTERESTS)[number]["value"];

export function isShopperInterest(value: unknown): value is ShopperInterest {
  return (
    typeof value === "string" &&
    SHOPPER_INTERESTS.some((i) => i.value === value)
  );
}

export type WaitlistSubmission = {
  segment: WaitlistSegment;
  /**
   * Optional since board 2 (2026-09-05): the shopper form asks for a first name
   * "so we can greet you properly" and nothing more. A person is identified by
   * the address and reached by the number; a name that is not there is a
   * greeting that says "there" instead.
   */
  fullName: string | null;
  email: string;
  /**
   * E.164; Kenyan numbers normalized to +254. Optional since the Nairobi pilot
   * repositioning (2026-09-05): the pilot-interest form collects the minimum —
   * email, audience, preferred location, consent — and email is the activated
   * channel. A number, when offered, must still be valid.
   */
  phone: string | null;
  /** Preferred pilot location: a stored value from the central list, or the free-text "another" answer. */
  nodeInterest: string;
  /** Closed list, possibly empty. */
  interests: ShopperInterest[];
  businessName: string | null;
  note: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /**
   * An internal test signup, made through the real form.
   *
   * MAANTA tests the live waitlist rather than a copy of it (founder TEST
   * treatment, 2026-09-04), so the marker has to travel with the contact. The
   * admin console defaults to counting Real only and states which population
   * every figure used; without this flag those rows would be indistinguishable
   * from genuine signups — the same defect as `redemptions.is_demo`, which
   * `claim_deal` never set, so every claim silently counted as real (D188).
   *
   * Defaults to `false`. **Nothing in the request body sets this.** The caller
   * of `validateWaitlistSubmission` passes a server-side verdict, derived in
   * `lib/growth/waitlist-test-token.ts` from a shared secret in the URL. A
   * public endpoint that took the client's word for it would let anyone file
   * rows the admin console excludes from its counts.
   */
  isTest: boolean;
  /** What is being tested, e.g. `smoke-test`. Free text, capped. */
  testLabel: string | null;
};

/**
 * Normalize a phone number to E.164. Kenyan formats (07XX…, 7XX…,
 * 2547XX…, +254 07XX…) all normalize to +254; other +CC numbers pass
 * through if plausibly E.164 (diaspora signups).
 */
export function normalizeWaitlistPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/[\s().\-]/g, "");
  if (s.startsWith("+")) {
    if (s.startsWith("+2540")) s = `+254${s.slice(5)}`; // dropped trunk zero
    if (s.startsWith("+254")) return /^\+254[17]\d{8}$/.test(s) ? s : null;
    return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
  }
  if (/^0[17]\d{8}$/.test(s)) return `+254${s.slice(1)}`;
  if (/^[17]\d{8}$/.test(s)) return `+254${s}`;
  if (/^254[17]\d{8}$/.test(s)) return `+${s}`;
  return null;
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

/**
 * `isTest` is a parameter, not a body field: the only way to mark a submission
 * as internal is for the caller to have already checked the shared secret.
 */
export function validateWaitlistSubmission(
  body: unknown,
  options: { isTest?: boolean } = {}
): WaitlistValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request." };
  }
  const b = body as Record<string, unknown>;

  if (!isWaitlistSegment(b.segment)) {
    return { ok: false, error: "Pick whether you're joining as a shopper, merchant, or mall operator." };
  }

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  if (fullName.length > 120) return { ok: false, error: "Name is too long." };

  // The preferred location. Validated against the same list the form renders;
  // any other value is rejected rather than defaulted, so a caller cannot file
  // a preference the founder never approved. `mall`/`mallOther` are the
  // older field names and are still read.
  const locationValue = b.location ?? b.mall;
  if (!isPilotLocationValue(locationValue)) {
    return { ok: false, error: "Choose a preferred shopping location from the list." };
  }
  const nodeInterest = storedPilotLocation(locationValue, optionalText(b.locationOther ?? b.mallOther, PILOT_LOCATION_OTHER_MAX));
  if (!nodeInterest) return { ok: false, error: "Tell us which Nairobi shopping location you mean." };

  const interests = Array.isArray(b.interests)
    ? Array.from(new Set(b.interests.filter(isShopperInterest)))
    : [];

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const phoneOffered = typeof b.phone === "string" && b.phone.trim() !== "";
  const phone = phoneOffered ? normalizeWaitlistPhone(b.phone) : null;
  if (phoneOffered && !phone) {
    return { ok: false, error: "Enter a valid phone number (e.g. 0712 345 678), or leave it blank." };
  }

  if (b.consent !== true) {
    return { ok: false, error: "Please agree to receive pilot updates to join the list." };
  }

  return {
    ok: true,
    data: {
      segment: b.segment,
      fullName: fullName || null,
      email,
      phone,
      nodeInterest,
      interests,
      businessName: optionalText(b.businessName, 160),
      note: optionalText(b.note, 1000),
      utmSource: optionalText(b.utmSource, 100),
      utmMedium: optionalText(b.utmMedium, 100),
      utmCampaign: optionalText(b.utmCampaign, 100),
      isTest: options.isTest === true,
      testLabel: options.isTest === true ? optionalText(b.testLabel, 60) : null,
    },
  };
}
