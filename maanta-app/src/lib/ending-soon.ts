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

type ExpiringDeal = {
  id: string;
  expires_at: string | null;
  /** NULL means unlimited, exactly as `claim_deal` reads it. */
  max_claims: number | null;
  /** D236: claims ISSUED — the counter the allocation is tested against. */
  claims_issued: number;
};

/**
 * The claim allocation, as the claim path actually enforces it.
 *
 * D236: the cap is tested against `claims_issued` — claims HANDED OUT — not
 * `claims_count`, which counts verified redemptions. Before 2026-09-03 this
 * read `claims_count`, which only moves at the counter, so a deal whose codes
 * were all issued still advertised itself as claimable right up until someone
 * redeemed. `claim_deal` and the `redemptions_reserve_claim_slot` trigger both
 * raise `deal_claim_limit_reached` on
 * `max_claims IS NOT NULL AND claims_issued >= max_claims`, so NULL is
 * unlimited and the comparison is `>=`, not `>`. Read from the deployed
 * function rather than inferred: an off-by-one here would either advertise a
 * claim the database refuses, or hide a deal a shopper could still claim.
 */
export function isFullyClaimed(deal: {
  max_claims: number | null;
  claims_issued: number;
}): boolean {
  return deal.max_claims !== null && deal.claims_issued >= deal.max_claims;
}

/**
 * Claims still available on a deal, or `null` when the allocation is unlimited.
 *
 * The single place this arithmetic lives. `Math.max(…, 0)` because a deal whose
 * allocation was lowered to exactly its issued count reads zero rather than a
 * negative — the database CHECK forbids lowering below it, so this clamps a
 * boundary rather than hiding a contradiction.
 */
export function claimsRemaining(deal: {
  max_claims: number | null;
  claims_issued: number;
}): number | null {
  if (deal.max_claims === null) return null;
  return Math.max(deal.max_claims - deal.claims_issued, 0);
}

/**
 * Deals whose claim window is genuinely still OPEN and ends within the
 * near-expiry threshold, soonest first.
 *
 * Two ways a claim window can already be shut, and this section must exclude
 * both, because its subtitle promises "claim windows closing within the hour"
 * — a stronger claim than "this deal exists and expires soon":
 *
 * - **Expired.** A lapsed deal is not "ending soon", it is over.
 * - **Fully claimed.** At the cap, `claim_deal` raises
 *   `deal_claim_limit_reached`, so the window is shut however the clock reads.
 *   `getLiveDeals` deliberately still returns these — the deal detail page
 *   renders "Fully claimed" and that is a legitimate browse state — so the
 *   exclusion belongs HERE, in the surface making the stronger claim, and not
 *   in the global live-deal contract.
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
    .filter((x) => !isFullyClaimed(x.deal))
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
