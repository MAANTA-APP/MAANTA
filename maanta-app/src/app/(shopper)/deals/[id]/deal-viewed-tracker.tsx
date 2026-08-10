"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";

/**
 * `deal_viewed`, captured in the browser.
 *
 * ## Why this is not a server event any more
 *
 * It was, and it could not name its own actor. A server event has to supply a
 * distinct id, and for a signed-out shopper there is none to supply — so
 * `lib/analytics-identity.ts` read posthog-js's cookie to borrow the browser's
 * id. That module documented its own precondition ("`persistence` is left at
 * the default… set it to `memory` and there is no cookie to read") and then
 * shipped inside the failure case: the founder ruled the client cookieless on
 * 2026-07-31, so the cookie never existed and every signed-out view fell to
 * `distinct_id_source: 'none'` — one PostHog person for every anonymous
 * shopper, and a `deal_viewed` → `deal_claimed` funnel that could never join.
 * Drift **D88**, ruled 2026-08-10 (`docs/ops/d88-analytics-attribution-decision.md`).
 *
 * The fix is to capture where the identity already lives. Under `memory`
 * persistence posthog-js still mints a `distinct_id` and attaches it to
 * everything it sends, so a client-side `deal_viewed` and a later
 * `deal_claimed` land on **one person** — with nothing written to the device,
 * so the Cookie Notice's public claim ("no analytics identifiers on your device
 * before you sign in") stays true and no consent banner is needed.
 *
 * Verified from the posthog-js 1.406.2 source rather than assumed: `memoryStore`
 * is backed by a module-level `memoryStorage` object, so the id is written once
 * and reused for the life of the JS context. `DealCard` navigates with
 * `next/link`, so feed → deal detail keeps that context.
 *
 * ## What changed about the number
 *
 * This fires on hydration, not on server render, so a bounce before hydration
 * is no longer counted and absolute `deal_viewed` counts drop at the cutover.
 * **The metric's meaning changed; it did not regress.** `capture_side: "client"`
 * is on every event so the two eras can be told apart in PostHog — filter on it
 * rather than comparing across the boundary.
 *
 * Signed-in shoppers need no special case: `posthog.identify()` in
 * `components/posthog-provider.tsx` has already bound the session to the real
 * user, so the same capture carries the right person. That is why this takes no
 * user id prop — a second source of identity here is how the server and client
 * events came to disagree in the first place.
 */
export function DealViewedTracker({
  dealId,
  merchantId,
  dealType,
  priceKes,
  node,
}: {
  dealId: string;
  merchantId: string;
  dealType: string;
  priceKes: number | null;
  node: string;
}) {
  // One event per mounted deal, not one per render. Without this, any parent
  // re-render would re-fire and inflate the top of the funnel — the exact
  // metric this exists to make trustworthy.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === dealId) return;
    sent.current = dealId;

    try {
      posthog.capture("deal_viewed", {
        deal_id: dealId,
        merchant_id: merchantId,
        deal_type: dealType,
        price_kes: priceKes,
        node,
        capture_side: "client",
      });
    } catch {
      // Analytics never breaks a page. posthog-js is a no-op without a token
      // (dev, CI), and a throw here would take the deal detail page with it.
    }
  }, [dealId, merchantId, dealType, priceKes, node]);

  return null;
}
