/**
 * The additive "Ending soon" feed section (H1).
 *
 * ## What makes this honest
 *
 * Urgency here is **only** what the deal's own `expires_at` says. There is no
 * popularity signal, no claim count, no "trending", no "X people viewing" — the
 * product has no such data, and inventing a proxy for it would be fabricating
 * social proof on a surface a shopper trusts to be literal.
 *
 * ## Why it reuses the existing threshold instead of picking one
 *
 * MAANTA already has a definition of "nearly over": `isNearExpiry()` in
 * `lib/ui.ts` turns the countdown chip rust below **60 minutes**, and the frozen
 * UI rules treat that rust as the warning state. A second, wider threshold here
 * — two hours, three — would mean the feed calls a deal "ending soon" while its
 * own chip still renders calm, and a shopper would be looking at two different
 * claims about the same deal on the same screen. One definition of urgency, in
 * one place, is the whole point.
 *
 * The cost is that this section is often empty. That is correct: an "Ending
 * soon" rail that always has something in it is not reporting urgency, it is
 * manufacturing it.
 *
 * ## Additive, not a re-rank
 *
 * This selects from deals the feed has already fetched and returns a view of
 * them. Every deal stays in its own rail, in its own locked order — nothing is
 * removed, reordered, or promoted. The section simply does not render when the
 * selection is empty.
 */

/**
 * The single near-expiry threshold, shared with the countdown chip.
 *
 * Exported so `isNearExpiry()` and this module cannot drift apart; a test
 * asserts they agree.
 */
export const NEAR_EXPIRY_MS = 60 * 60 * 1000;

/** The most cards the section will show. Beyond this it stops being a glance. */
export const ENDING_SOON_LIMIT = 8;

type ExpiringDeal = { id: string; expires_at: string | null };

/**
 * Deals whose claim window genuinely ends within the near-expiry threshold,
 * soonest first.
 *
 * Excludes anything already expired — a lapsed deal is not "ending soon", it is
 * over, and showing it would send a shopper to a claim they cannot make.
 *
 * @param now injectable so the boundary is testable without freezing the clock.
 */
export function endingSoonDeals<T extends ExpiringDeal>(
  deals: readonly T[],
  now: Date = new Date()
): T[] {
  const nowMs = now.getTime();
  const withMs = deals
    .map((d) => ({ deal: d, ms: msLeft(d.expires_at, nowMs) }))
    .filter((x) => x.ms !== null && x.ms > 0 && x.ms <= NEAR_EXPIRY_MS) as {
    deal: T;
    ms: number;
  }[];

  return withMs
    .sort((a, b) => a.ms - b.ms || a.deal.id.localeCompare(b.deal.id))
    .slice(0, ENDING_SOON_LIMIT)
    .map((x) => x.deal);
}

/**
 * Milliseconds until an expiry, or null when it cannot be established.
 *
 * A null or unparseable `expires_at` returns null and the deal is simply not
 * selected — it is never treated as "ending now". `deals.expires_at` is NOT
 * NULL in the database (D29), so this is defence rather than a reachable state,
 * but guessing urgency from a missing timestamp is exactly the kind of
 * fabrication this module exists to avoid.
 */
function msLeft(expiresAt: string | null, nowMs: number): number | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) ? t - nowMs : null;
}

/**
 * Subtitle for the section, stating the rule rather than shouting.
 *
 * No exclamation, no "hurry", no count of other shoppers. The deal cards carry
 * their own countdown chips, which is where the actual time lives.
 */
export const ENDING_SOON_SUBTITLE = "Claim windows closing within the hour";
