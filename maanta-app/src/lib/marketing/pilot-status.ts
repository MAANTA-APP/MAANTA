import { FACTS } from "./facts";

/**
 * The Nairobi pilot, stated once.
 *
 * Founder direction of 2026-09-05: the public site markets a truthful Nairobi
 * pilot whose location and date are **not** confirmed. BBS Mall in Eastleigh is
 * one potential location and may be named only with that qualification; no
 * partnership, permission, desk, staff presence, launch date or operating
 * presence there may be implied.
 *
 * Every surface that states the pilot's status reads these strings, so the
 * truth is told the same way everywhere and a change is one edit.
 * `nairobi-pilot-truth.test.ts` guards the wording and the places it must
 * appear.
 */

/** The eyebrow above any hero or status block that names where MAANTA is. */
export const PILOT_EYEBROW = "Nairobi pilot · location to be confirmed";

/** The one sentence under it. */
export const PILOT_STATUS_SENTENCE =
  "MAANTA is preparing its first Nairobi pilot. No location or launch date has been confirmed.";

/** A short form for image surfaces (OG sublines, channel art) where the full sentence would not fit. */
export const PILOT_SHORT_LINE = "Preparing a Nairobi pilot. Location to be confirmed.";

/** The footer's location block, two lines. */
export const FOOTER_PILOT_LINE_1 = "Preparing a Nairobi pilot";
export const FOOTER_PILOT_LINE_2 = "Location and opening date to be confirmed";

/** The bounded "potential first location" block. */
export const POTENTIAL_LOCATION_EYEBROW = "Potential first location";
export const POTENTIAL_LOCATION_HEADING = "Starting with one Nairobi shopping location.";
export const POTENTIAL_LOCATION_BODY = `MAANTA is assessing where to run its first controlled pilot. ${FACTS.candidateMallProse} is one potential location, but no agreement or launch date has been confirmed.`;

/** `/mall-operators` — the only mention of BBS Mall on that page. */
export const OPERATOR_POTENTIAL_NODE_EYEBROW = "Potential Node 0 location";
export const OPERATOR_POTENTIAL_NODE_COPY = `${FACTS.candidateMallProse} is being considered as a potential location for MAANTA's first Nairobi pilot. No partnership, permission or launch date has been confirmed.`;

/** `/shoppers` — "Where should MAANTA open first?" */
export const SHOPPER_WHERE_HEADING = "Where should MAANTA open first?";
export const SHOPPER_WHERE_BODY = `We are selecting one Nairobi location for the first controlled pilot. ${FACTS.candidateMallProse} is a potential location — not a confirmed partner or launch site.`;

/** The reusable demo disclosure, wherever a demo deal or the demo feed is offered. */
export const DEMO_DISCLOSURE = "Demo deals are examples only. Nothing in the demo feed can be redeemed.";
export const DEMO_DISCLOSURE_SHOPPER = "Demo deals are examples and cannot be claimed or redeemed.";
export const DEMO_CODE_LABEL = "Example code · not redeemable";

/** The demo feed's own banner, shown on the feed before any deal can be touched. */
export const DEMO_FEED_BANNER =
  "Demonstration feed — these are example shops and offers. Nothing here can be redeemed.";

/** Where "Explore demo deals" goes. The real feed, serving demo rows while `demo_mode_enabled` holds. */
export const DEMO_FEED_HREF = "/feed";

/**
 * Preferred-location choices for the pilot-interest form.
 *
 * Founder-approved list, no more than ten. Only BBS Mall has been approved as
 * a named choice, and only with its qualification; "another Nairobi shopping
 * location" takes a short free-text answer. The answer is a **preference**,
 * never evidence of a relationship with a mall, and the server validates the
 * value against this same list (`isPilotLocationValue`).
 */
export const PILOT_LOCATION_OPTIONS = [
  { value: "bbs", label: `${FACTS.candidateMall} — potential pilot location`, stored: FACTS.candidateMall },
  { value: "other", label: "Another Nairobi shopping location", stored: null },
] as const;

export const PILOT_LOCATION_MAX_OPTIONS = 10;

export type PilotLocationValue = (typeof PILOT_LOCATION_OPTIONS)[number]["value"];

export function isPilotLocationValue(v: unknown): v is PilotLocationValue {
  return typeof v === "string" && PILOT_LOCATION_OPTIONS.some((o) => o.value === v);
}

/** The free-text answer when "Another Nairobi shopping location" is chosen. */
export const PILOT_LOCATION_OTHER_MAX = 80;

/**
 * Resolve a validated choice to the stored preference. `null` means the
 * caller must supply the free-text answer; the caller is responsible for the
 * length bound and for rejecting an empty answer.
 */
export function storedPilotLocation(value: PilotLocationValue, other: string | null): string | null {
  const opt = PILOT_LOCATION_OPTIONS.find((o) => o.value === value);
  if (!opt) return null;
  if (opt.stored) return opt.stored;
  const t = (other ?? "").trim();
  return t.length >= 1 && t.length <= PILOT_LOCATION_OTHER_MAX ? t : null;
}

/**
 * "Book a pilot conversation."
 *
 * The booking page is a founder-configured Calendly URL that creates a Google
 * Meet link after booking. It is read from the environment and never typed
 * into a component. When it is not configured, no page may publish a broken
 * booking CTA: `pilotBookingAction()` returns the contact-form fallback with a
 * label that promises only a conversation, not a booking, and the setup
 * requirement is reported to the founder.
 */
export const PILOT_BOOKING_URL: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_PILOT_BOOKING_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
})();

export const BOOKING_LABEL = "Book a pilot conversation";
export const BOOKING_FALLBACK_LABEL = "Start a pilot conversation";
export const BOOKING_FALLBACK_HREF = "/contact?topic=mall-operator";

export function pilotBookingAction(): { label: string; href: string; external: boolean } {
  return PILOT_BOOKING_URL
    ? { label: BOOKING_LABEL, href: PILOT_BOOKING_URL, external: true }
    : { label: BOOKING_FALLBACK_LABEL, href: BOOKING_FALLBACK_HREF, external: false };
}
