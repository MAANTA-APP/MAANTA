/**
 * Which PostHog person a SERVER-side event belongs to.
 *
 * The problem this solves: a server event has to name its own actor, and for a
 * signed-out shopper there is no user id to name. `deal_viewed` used the literal
 * string "anonymous", so every signed-out view in the product collapsed onto one
 * PostHog person — `uniq(person_id)` read 1 no matter how many people browsed,
 * and a deal_viewed → deal_claimed funnel could never join (the view belonged to
 * "anonymous", the claim to a real user id).
 *
 * The fix is to reuse the id the browser is already using. posthog-js persists
 * its state — including `distinct_id` — in a cookie, so the server can read the
 * same value the client will send, and both land on one person. When the shopper
 * later signs in, `posthog.identify()` in the client provider aliases that
 * anonymous person onto the real user, so the pre-signup views stay attached.
 *
 * Depends on three things about the client config in components/posthog-provider.tsx.
 * All three were verified against the installed posthog-js (1.406.2); if any of
 * them changes, this file silently returns null and the fallback bucket grows:
 *
 *   1. `persistence` is left at its default, `localStorage+cookie`. Set it to
 *      `localStorage` or `memory` and there is no cookie to read.
 *   2. `persistence_name` is not set, so the cookie is `ph_<token>_posthog`.
 *   3. `defaults` stays below "2026-05-30", which is when `split_storage` turns
 *      on and moves `distinct_id` out of this cookie.
 */

import { cookies } from "next/headers";

/**
 * The cookie posthog-js writes, or null when no project token is configured
 * (dev / CI, where analytics is a no-op anyway).
 */
export function posthogCookieName(): string | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  return token ? `ph_${token}_posthog` : null;
}

/**
 * Pull `distinct_id` out of the posthog-js cookie payload.
 *
 * Deliberately forgiving: this is analytics, and a cookie we cannot parse must
 * degrade to "unattributed" rather than throw into a page render. Exported
 * separately from the cookie read so it can be tested without a request scope.
 */
export function parsePosthogDistinctId(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // posthog-js writes URI-encoded JSON. Some environments hand the value back
  // already decoded, so try both rather than assuming which one arrived.
  const candidates: string[] = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // Malformed percent-encoding — carry on with the raw value.
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const id = (parsed as { distinct_id?: unknown }).distinct_id;
        if (typeof id === "string" && id.trim()) return id.trim();
      }
    } catch {
      // Not JSON in this form — try the next candidate.
    }
  }

  return null;
}

/**
 * The browser's PostHog distinct id for the current request, or null when there
 * is none to be had — first ever page view (posthog-js has not run yet), cookies
 * blocked, a bot, or no token configured.
 *
 * Null is a normal outcome, not an error. Callers should record *that* rather
 * than inventing an id: see `distinct_id_source` in lib/analytics.ts.
 */
export function serverPosthogDistinctId(): string | null {
  const name = posthogCookieName();
  if (!name) return null;

  try {
    return parsePosthogDistinctId(cookies().get(name)?.value);
  } catch {
    // No request scope (or cookies() unavailable). Analytics never breaks a render.
    return null;
  }
}
