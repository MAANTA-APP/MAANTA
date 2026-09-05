import { isLeadFloor, LEAD_FLOOR_LABELS, LEAD_FLOORS, type LeadFloor } from "@/lib/growth/leads";
import { normalizeWaitlistPhone } from "@/lib/waitlist";

import { PILOT_LOCATION_OPTIONS, PILOT_LOCATION_OTHER_MAX, isPilotLocationValue, storedPilotLocation } from "@/lib/marketing/pilot-status";

/**
 * `/merchants/join` — merchant interest, as board 2 (M6) draws it.
 *
 * ## What this is, and is not
 *
 * Founder ruling 2026-09-05: the page is INTEREST CAPTURE, not a doorway into
 * self-serve onboarding. Before Node 0 opens, an agent walks the floor unit by
 * unit; the form exists so they know which door to knock on. So it asks for the
 * unit, and it does not ask for an email — the merchant is reached on WhatsApp
 * the same day, and nothing here goes to the email platform. This is the one
 * form on the site where "phone first, email never" holds without a caveat.
 *
 * Rows land in `growth_merchant_leads`, the table the admin Growth board reads,
 * with `source = 'public_form'`. Identity stays (floor, unit): the partial
 * unique index on live leads means a second submission for the same unit is
 * "already on our list", not a duplicate card.
 */

export const MERCHANT_CATEGORIES = [
  "Clothing & fashion",
  "Shoes & bags",
  "Kids & school",
  "Phones & electronics",
  "Household",
  "Food & groceries",
  "Beauty & cosmetics",
  "Something else",
] as const;
export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

export function isMerchantCategory(value: unknown): value is MerchantCategory {
  return typeof value === "string" && (MERCHANT_CATEGORIES as readonly string[]).includes(value);
}

/** "How many people work your counter?" — sizes the staff-seat conversation. */
export const COUNTER_STAFF_OPTIONS = [
  { value: "just_me", label: "Just me" },
  { value: "two_to_four", label: "2\u20134" },
  { value: "five_plus", label: "5+" },
] as const;
export type CounterStaff = (typeof COUNTER_STAFF_OPTIONS)[number]["value"];

export function isCounterStaff(value: unknown): value is CounterStaff {
  return typeof value === "string" && COUNTER_STAFF_OPTIONS.some((o) => o.value === value);
}

/** The same central preferred-location list as the waitlist; validated server-side against it. */
export const MERCHANT_MALL_OPTIONS = PILOT_LOCATION_OPTIONS;

/** Stored verbatim with its timestamp on every form row (Kenya DPA 2019). */
export const MERCHANT_CONTACT_CONSENT_TEXT =
  "You can contact me on WhatsApp or by phone about MAANTA.";

export const MERCHANT_FLOOR_OPTIONS = LEAD_FLOORS.map((value) => ({
  value,
  label: LEAD_FLOOR_LABELS[value],
}));

export type MerchantInterest = {
  shopName: string;
  contactName: string;
  /** E.164. */
  phone: string;
  /** Node 0 by default; what they typed otherwise. */
  mall: string;
  floor: LeadFloor;
  unit: string;
  category: MerchantCategory | null;
  counterStaff: CounterStaff | null;
  eliteTrialOptIn: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Server-derived, never from the body — see lib/growth/waitlist-test-token.ts. */
  isTest: boolean;
  testLabel: string | null;
};

export type MerchantInterestValidation =
  | { ok: true; data: MerchantInterest }
  | { ok: false; error: string };

const optionalText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

/**
 * Same contract as `validateWaitlistSubmission`: the TEST verdict is an option
 * the caller has already earned, never a field the body can set.
 */
export function validateMerchantInterest(
  body: unknown,
  options: { isTest?: boolean } = {}
): MerchantInterestValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request." };
  }
  const b = body as Record<string, unknown>;

  const shopName = optionalText(b.shopName, 160);
  if (!shopName) return { ok: false, error: "Tell us the name above your door." };

  const contactName = optionalText(b.contactName, 120);
  if (!contactName) return { ok: false, error: "Who should we ask for?" };

  const phone = normalizeWaitlistPhone(b.phone);
  if (!phone) {
    return { ok: false, error: "Enter a valid phone number (e.g. 0712 345 678)." };
  }

  if (!isPilotLocationValue(b.mall)) {
    return { ok: false, error: "Choose your shop's location from the list." };
  }
  const mall = storedPilotLocation(b.mall, optionalText(b.mallOther, PILOT_LOCATION_OTHER_MAX));
  if (!mall) return { ok: false, error: "Tell us which Nairobi shopping location your shop is in." };

  if (!isLeadFloor(b.floor)) return { ok: false, error: "Pick the floor your shop is on." };
  const unit = optionalText(b.unit, 16);
  if (!unit) return { ok: false, error: "Enter your unit number." };

  const category = isMerchantCategory(b.category) ? b.category : null;
  const counterStaff = isCounterStaff(b.counterStaff) ? b.counterStaff : null;

  if (b.contactConsent !== true) {
    return { ok: false, error: "Tick the box so we are allowed to contact you." };
  }

  return {
    ok: true,
    data: {
      shopName,
      contactName,
      phone,
      mall,
      floor: b.floor,
      unit,
      category,
      counterStaff,
      eliteTrialOptIn: b.eliteTrial === true,
      utmSource: optionalText(b.utmSource, 100),
      utmMedium: optionalText(b.utmMedium, 100),
      utmCampaign: optionalText(b.utmCampaign, 100),
      isTest: options.isTest === true,
      testLabel: options.isTest === true ? optionalText(b.testLabel, 60) : null,
    },
  };
}
