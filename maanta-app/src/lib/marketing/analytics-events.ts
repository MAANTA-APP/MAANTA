/**
 * Marketing event names — plain constants, no "use client".
 *
 * Deliberately separate from `analytics.ts`. That module is a client module (it
 * imports `posthog-js`), and a server component that imports a value from a
 * client module to pass as a prop breaks the React Client Manifest — the Home
 * page passes `MARKETING_EVENTS.audienceDoor` to `TrackedLink`, and the
 * production build failed on exactly that until the names moved here.
 *
 * Centralised so a PostHog dashboard query cannot drift from the code.
 */
export const MARKETING_EVENTS = {
  /** The three-door router on Home — the single most useful number this site produces. */
  audienceDoor: "marketing_audience_door_clicked",
  /** Any primary or secondary call to action. */
  cta: "marketing_cta_clicked",
  /** A form was submitted successfully. Never carries field contents. */
  formSubmit: "marketing_form_submitted",
  /** An FAQ item was opened. Tells us which objection is doing the work. */
  faqOpened: "marketing_faq_opened",
  /** A named section reached the viewport. */
  sectionViewed: "marketing_section_viewed",
} as const;

export type MarketingEvent = (typeof MARKETING_EVENTS)[keyof typeof MARKETING_EVENTS];
