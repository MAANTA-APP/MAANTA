/**
 * The one client-side mirror of `getLiveDeals`' expiry predicate (D213
 * criterion 3 — section membership).
 *
 * The server withdraws an expired deal from discovery entirely: `getLiveDeals`
 * carries `is_active`, `is_paused = false` AND `expires_at > now`, and
 * `/search`, `/shops/[id]` and `/notifications` each carry the same predicates
 * because they build their own query. Only ONE of those three is time-derived,
 * and it is the one that stops being true while a page sits open — so a rail,
 * a results list or a heading that says "Live deals" keeps advertising a deal
 * the product has already withdrawn.
 *
 * This is deliberately NOT `isLiveNow`, which allows a 15-minute grace past
 * expiry so an already-claimed code can still be redeemed. That grace is for a
 * shopper's own "Live now" filter and for a ticket; discovery uses the strict
 * server rule, or the client would be more permissive than the query it mirrors.
 *
 * It is also NOT the claim cap. A fully claimed deal stays discoverable by
 * founder doctrine, and reflecting exhaustion while a page is open is
 * criterion 4 and needs fresh data.
 */

/**
 * `expires_at > now`, the client half of the server predicate.
 *
 * A missing or unparseable timestamp is KEPT, not withdrawn: `deals.expires_at`
 * is NOT NULL in production (D29), so this cannot arise from a real row, and
 * silently deleting a card because a value could not be read would be a worse
 * failure than showing it.
 */
export function isUnexpiredAt(expiresAt: string | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t > now.getTime();
}

/**
 * Every still-live row, in the order given. Order is the server's and is never
 * re-derived here — the locked rail orders hold on any subset of a rail, which
 * is exactly why removal is safe and reordering would not be.
 */
export function liveDealsAt<T extends { expires_at?: string | null }>(
  deals: T[],
  now: Date
): T[] {
  return deals.filter((d) => isUnexpiredAt(d.expires_at, now));
}
