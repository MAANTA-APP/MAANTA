import type { DealRow } from "@/lib/data";
import { distanceMeters } from "@/lib/what3words";

/**
 * Feed section identity and the "Deals Near Me" rule.
 *
 * R-FEED-ORDER is frozen: **Flash deals → Priority placements → Deals Near Me.**
 * The three rails are different product concepts and must not blur into one
 * another — Flash and Priority placements are promotional surfaces, Deals Near
 * Me is proximity-led local discovery.
 *
 * Founder decision D-01 (2026-07-29) named the third section and defined its
 * contents: **nearby standard deals only.** That means every non-boosted
 * standard deal at the shopper's node — a Standard merchant's single standard
 * deal *and* an Elite merchant's standard deals that are not boosted. Merchant
 * tier is deliberately NOT a filter: what disqualifies a deal is being a flash
 * deal or being boosted, because those already have their own rail.
 *
 * ── What "near me" actually means today (read this before changing copy) ──
 *
 * Proximity is **node-scoped, not device-located**. The rail is filtered to the
 * shopper's selected mall/node (in `getLiveDeals`), and then ordered by each
 * shop's distance from that node's centre. The app does not read device
 * geolocation on the feed — the only `getCurrentPosition` call is the geofence
 * check at claim time (`deals/[id]/claim-flow.tsx`).
 *
 * So "near me" = "in the mall I'm browsing, nearest shops first". For MAANTA's
 * in-mall model that is the meaningful sense of nearby, and it is honest: a
 * shopper at home browsing BBS Mall sees BBS Mall deals ordered by where the
 * shops sit inside it. `nearMeSubtitle()` exists so the copy never claims more
 * than that, including when the node has no coordinates at all.
 *
 * Merchant `lat`/`lng` are NULLABLE and sparsely populated, so distance is
 * unknown for some shops. Those sort after the located ones rather than being
 * dropped or silently ranked as "far" — see `orderNearMeDeals`.
 */

/** Frozen section labels. Order is R-FEED-ORDER and is not reorderable. */
export const FEED_SECTIONS = {
  flash: { title: "Flash deals", subtitle: "Grab them while they last" },
  boosted: { title: "Priority placements", subtitle: "Boosted by the shop" },
  nearMe: { title: "Deals Near Me" },
} as const;

/**
 * Does this deal belong in Deals Near Me?
 *
 * Standard, non-boosted, and nothing else. Flash and boosted deals have their
 * own rails; letting either leak in here would make the three sections
 * indistinguishable and pad the rail with inventory the shopper already saw.
 */
export function isNearMeDeal(d: DealRow): boolean {
  return d.deal_type === "standard" && !d.boost_active;
}

/** Drop anything that belongs to another rail. Defence in depth for the query. */
export function selectNearMeDeals(deals: DealRow[]): DealRow[] {
  return deals.filter(isNearMeDeal);
}

function distanceOf(
  d: DealRow,
  origin: { lat: number; lng: number } | null
): number | null {
  if (!origin) return null;
  const { lat, lng } = d.merchants ?? {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return distanceMeters(origin, { lat, lng });
}

/**
 * Proximity-led order for the Deals Near Me rail.
 *
 * Shops with known coordinates come first, nearest to the node centre first.
 * Shops with no coordinates follow, newest first — they are genuinely nearby
 * (same node) but unrankable, so they go after the located ones instead of
 * being lumped at `Infinity` in whatever order the query happened to return.
 *
 * With no origin at all there is nothing to be near, so this degrades to newest
 * first and `nearMeSubtitle()` stops claiming proximity.
 */
export function orderNearMeDeals(
  deals: DealRow[],
  origin: { lat: number; lng: number } | null
): DealRow[] {
  const newestFirst = (a: DealRow, b: DealRow) =>
    new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();

  if (!origin) return [...deals].sort(newestFirst);

  const located: { deal: DealRow; metres: number }[] = [];
  const unlocated: DealRow[] = [];
  for (const deal of deals) {
    const metres = distanceOf(deal, origin);
    if (metres === null) unlocated.push(deal);
    else located.push({ deal, metres });
  }

  located.sort((a, b) => a.metres - b.metres || newestFirst(a.deal, b.deal));
  unlocated.sort(newestFirst);

  return [...located.map((x) => x.deal), ...unlocated];
}

/**
 * Honest subtitle for the rail.
 *
 * The label is fixed by the founder decision, so the subtitle carries the
 * caveat: with a node we can say which mall; without coordinates we must not
 * imply distance ranking that isn't happening.
 */
export function nearMeSubtitle(
  origin: { lat: number; lng: number } | null,
  mallName?: string | null
): string {
  if (!origin) {
    // No coordinates to measure from — say what the rail really is.
    return "Standard deals at your mall, newest first";
  }
  return mallName
    ? `Standard deals at ${mallName}, nearest first`
    : "Standard deals at your mall, nearest first";
}
