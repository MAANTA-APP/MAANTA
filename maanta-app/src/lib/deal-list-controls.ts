import { dealRail } from "@/lib/browse";
import type { DealRow } from "@/lib/data";
import { distanceMeters } from "@/lib/what3words";

/**
 * `featured` is the feed's default and means "the locked feed structure" — the
 * three per-rail orders frozen in Notion "Frozen Scope & Rules → Feed structure
 * (locked)", not one order applied to everything:
 *
 *   1 Top picks near you       (flash)    → soonest expiry first
 *   2 Neighbourhood favourites (boosted)  → most recently boosted first
 *   3 Deals near me            (standard) → all-time verified redemptions descending
 *
 * The rail names are the shopper-facing titles frozen by founder ruling R2
 * (design brief v1.4; decisions log 2026-08-09). Notion's locked-structure
 * labels — Flash / Priority Placements / All Active Deals — survive only as the
 * `flash` / `boosted` / `standard` rail identifiers, never as UI copy. Rail 3's
 * name does not imply distance ordering: ruled 2026-08-09 (decisions log; drift
 * D77, closed), the label is copy — the rail is scoped to the shopper's
 * selected mall, so "near" holds at rail scope — while placement within the
 * rail stays the earned-placement verified-redemptions ranking. Not a bug, and
 * no longer an open question.
 *
 * It is deliberately not implementable by `sortDealRows`, which takes one
 * comparator for one flat list. The locked orders are applied per rail by
 * `lockedFlashOrder` / `lockedBoostedOrder` / `lockedStandardOrder`, called in
 * `getLiveDeals` so the ordering is decided once, server-side, in the same place
 * the rails are assembled.
 *
 * The other three values are explicit shopper overrides. Until 2026-07-30 the
 * feed defaulted to `nearest`, which re-sorted all three rails by distance and
 * silently discarded the locked orders — including the "most recently boosted
 * first" placement Elite merchants pay KES 500/24h for. See decision D1 in
 * docs/skills/truth-audit-2026-07-30.md.
 */
export type DealListSort = "featured" | "nearest" | "newest" | "ending";
export type DealListFilter = "all" | "flash" | "boosted" | "standard";

/** The feed honours the locked feed structure unless the shopper picks otherwise. */
export const DEFAULT_FEED_SORT: DealListSort = "featured";

/**
 * Browse is a flat searchable list with no rails, so "featured" has no meaning
 * there and distance stays its default. The locked structure is a property of
 * the feed, not of every deal list.
 */
export const DEFAULT_BROWSE_SORT: DealListSort = "nearest";

/** Sort options for a flat list (Browse). No "featured" — there are no rails. */
export const DEAL_SORT_OPTIONS = [
  { value: "nearest", label: "Nearest" },
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
] as const;

/** Sort options for the railed feed. "Featured" is the locked structure. */
export const FEED_SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  ...DEAL_SORT_OPTIONS,
] as const;

export const DEAL_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "flash", label: "Flash" },
  { value: "boosted", label: "Boosted" },
  { value: "standard", label: "Standard" },
] as const;

/**
 * Resolve a raw `?sort=` value to a supported sort, falling back when it is not
 * one of them.
 *
 * A cast is not enough. `(searchParams.sort as DealListSort) ?? fallback` only
 * catches null/undefined, so `?sort=bogus` — or an empty `?sort=`, a stale link,
 * a crawler, a typo — arrives as a truthy string, skips the fallback, and then
 * falls through `sortDealRows` to the distance branch. On the feed that silently
 * re-sorts all three rails by mall centroid, which is exactly the D1 regression
 * this module exists to prevent. Anything unrecognised must mean the default.
 *
 * `allowed` is the surface's own option list, so the feed accepts `featured` and
 * Browse does not.
 */
export function parseDealListSort(
  raw: string | string[] | undefined,
  fallback: DealListSort,
  allowed: readonly { value: string }[]
): DealListSort {
  if (typeof raw !== "string") return fallback;
  return allowed.some((o) => o.value === raw) ? (raw as DealListSort) : fallback;
}

/**
 * Resolve a raw `?filter=` value to a supported rail filter.
 *
 * Same class of bug with a different symptom: an unrecognised filter is not
 * `"all"`, so every rail gets emptied and the feed renders "No deals live right
 * now" on a mall that has deals. A bad URL must not look like an empty market.
 */
export function parseDealListFilter(
  raw: string | string[] | undefined
): DealListFilter {
  if (typeof raw !== "string") return "all";
  return DEAL_FILTER_OPTIONS.some((o) => o.value === raw)
    ? (raw as DealListFilter)
    : "all";
}

function distanceValue(
  d: DealRow,
  origin: { lat: number; lng: number } | null
): number {
  if (!origin) return Infinity;
  const lat = d.merchants?.lat;
  const lng = d.merchants?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return Infinity;
  return distanceMeters(origin, { lat, lng });
}

const millis = (iso: string | null | undefined, fallback: number): number => {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? fallback : t;
};

/**
 * Newest-first by start time; the tie-break for every locked order below.
 *
 * Goes through `millis` rather than parsing directly: a malformed `starts_at`
 * would otherwise make this return NaN. Inside the locked orders NaN is falsy
 * and falls through to `byId`, but `sortDealRows` uses this comparator on its
 * own, where NaN makes it inconsistent and the resulting order becomes
 * implementation-defined.
 */
function byNewest(a: DealRow, b: DealRow): number {
  return millis(b.starts_at, -Infinity) - millis(a.starts_at, -Infinity);
}

/**
 * Stable final tie-break so two deals that match on every ranking key keep a
 * fixed relative order across renders. Without it the 30s feed cache and a live
 * request can disagree, and a deal appears to jump position on refresh.
 */
function byId(a: DealRow, b: DealRow): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Locked rail 1 — Flash: soonest expiry first.
 *
 * A deal with no `expires_at` sorts last rather than first: a missing expiry is
 * unknown urgency, and treating unknown as "most urgent" would let a malformed
 * row take the top of the rail.
 */
export function lockedFlashOrder(deals: DealRow[]): DealRow[] {
  return [...deals].sort(
    (a, b) =>
      millis(a.expires_at, Infinity) - millis(b.expires_at, Infinity) ||
      byNewest(a, b) ||
      byId(a, b)
  );
}

/**
 * Locked rail 2 — Neighbourhood favourites (boosted): most recently boosted first.
 *
 * `boostStartedAt` maps deal id → the active boost's `starts_at`. A boost moved
 * between deals by `move_boost` keeps its original `starts_at` (the RPC updates
 * `deal_id` only), so a moved boost holds its purchased position instead of
 * jumping to the front — the 24h window it paid for is continuous.
 *
 * A boosted deal with no known start time sorts last, so a missing join cannot
 * award free top placement.
 */
export function lockedBoostedOrder(
  deals: DealRow[],
  boostStartedAt: Map<string, string> | Record<string, string>
): DealRow[] {
  const at = (id: string): number => {
    const raw =
      boostStartedAt instanceof Map ? boostStartedAt.get(id) : boostStartedAt[id];
    return millis(raw, -Infinity);
  };
  return [...deals].sort(
    (a, b) => at(b.id) - at(a.id) || byNewest(a, b) || byId(a, b)
  );
}

/**
 * Locked rail 3 — Deals near me (standard): all-time verified redemptions
 * descending, despite what the name suggests — see the module docblock.
 *
 * The count is per *merchant*, not per deal: the frozen rule ranks merchants by
 * all-time verified redemptions, which is the earned-placement incentive the
 * product promises them.
 */
export function lockedStandardOrder(
  deals: DealRow[],
  verifiedByMerchant: Map<string, number> | Record<string, number>
): DealRow[] {
  const count = (merchantId: string): number => {
    const raw =
      verifiedByMerchant instanceof Map
        ? verifiedByMerchant.get(merchantId)
        : verifiedByMerchant[merchantId];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  return [...deals].sort(
    (a, b) =>
      count(b.merchant_id) - count(a.merchant_id) || byNewest(a, b) || byId(a, b)
  );
}

/**
 * Apply a shopper-chosen sort to a flat list.
 *
 * `featured` returns the list untouched: the locked order is per rail and has
 * already been applied upstream, so re-sorting here is exactly the bug this
 * signature now prevents. Browse never offers `featured`, but a hand-typed
 * `?sort=featured` reaches this function, and pass-through is the safe answer.
 */
export function sortDealRows(
  deals: DealRow[],
  sort: DealListSort,
  origin: { lat: number; lng: number } | null
): DealRow[] {
  if (sort === "featured") return [...deals];
  const copy = [...deals];
  if (sort === "newest") {
    return copy.sort(byNewest);
  }
  if (sort === "ending") {
    return copy.sort((a, b) => {
      const ae = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
      const be = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
      return ae - be;
    });
  }
  return copy.sort(
    (a, b) => distanceValue(a, origin) - distanceValue(b, origin)
  );
}

export function filterDealRowsByRail(
  deals: DealRow[],
  filter: DealListFilter
): DealRow[] {
  if (filter === "all") return deals;
  return deals.filter((d) => dealRail(d) === filter);
}
