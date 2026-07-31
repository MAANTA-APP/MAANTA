"use client";

import posthog from "posthog-js";
import { type MarketingEvent } from "./analytics-events";

/**
 * Marketing analytics — named events for the surfaces the copy decks call out.
 *
 * **On the consent question.** The footer plan is right that cookie consent is a
 * legal-and-code dependency rather than a copy task, and that decision is still
 * open. But PostHog is already initialised on every page and already captures
 * pageviews and autocapture, so a named CTA event introduces no new category of
 * processing: same tool, same lawful basis, same data subject, and it disappears
 * behind whichever consent switch is eventually built. Withholding these events
 * would not have improved the privacy position — it would only have meant not
 * knowing which audience the homepage actually serves.
 *
 * What is deliberately *not* captured here: no free-text form contents, no email
 * addresses, no phone numbers, no message bodies. A submit event records that a
 * submission happened and which surface it came from, never what was typed.
 *
 * Every call is a no-op when PostHog has no token — dev, CI and tests stay quiet
 * and nothing here can throw into a render path.
 */

const enabled = () =>
  typeof window !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim());

export { MARKETING_EVENTS, type MarketingEvent } from "./analytics-events";

export function trackMarketing(
  event: MarketingEvent,
  properties: Record<string, string | number | boolean> = {}
): void {
  if (!enabled()) return;
  try {
    posthog.capture(event, { surface: "marketing", ...properties });
  } catch {
    // Analytics must never break a page. Swallow and move on.
  }
}
