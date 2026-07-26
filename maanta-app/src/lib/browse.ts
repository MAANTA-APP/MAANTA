import type { DealRow } from "@/lib/data";

export type BrowseRailFilter = "all" | "flash" | "boosted" | "standard";
export type BrowseTimeFilter = "any" | "now" | "today";

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type BrowseDealPin = {
  dealId: string;
  merchantId: string;
  merchantName: string;
  title: string;
  what3wordsAddress: string | null;
  lat: number;
  lng: number;
  rail: "flash" | "boosted" | "standard";
};

export function dealRail(d: DealRow): "flash" | "boosted" | "standard" {
  if (d.deal_type === "flash") return "flash";
  if (d.boost_active) return "boosted";
  return "standard";
}

/** Deal is currently running (started and not past grace). */
export function isLiveNow(d: DealRow, now = new Date()): boolean {
  const start = new Date(d.starts_at).getTime();
  const t = now.getTime();
  if (start > t) return false;
  if (!d.expires_at) return true;
  const graceEnd =
    new Date(d.expires_at).getTime() + 15 * 60_000;
  return t <= graceEnd;
}

/** @deprecated Use isLiveNow */
export const isCollectNow = isLiveNow;

export function isCollectToday(d: DealRow, now = new Date()): boolean {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const start = new Date(d.starts_at).getTime();
  const end = d.expires_at ? new Date(d.expires_at).getTime() : start;
  // Overlaps today's local calendar day.
  return start <= endOfDay.getTime() && end >= startOfDay.getTime();
}

export function filterBrowseDeals(
  deals: DealRow[],
  opts: {
    rail?: BrowseRailFilter;
    time?: BrowseTimeFilter;
    bounds?: MapBounds | null;
    now?: Date;
  } = {}
): DealRow[] {
  const rail = opts.rail ?? "all";
  const time = opts.time ?? "any";
  const now = opts.now ?? new Date();
  const bounds = opts.bounds ?? null;

  return deals.filter((d) => {
    if (rail !== "all" && dealRail(d) !== rail) return false;
    if (time === "now" && !isLiveNow(d, now)) return false;
    if (time === "today" && !isCollectToday(d, now)) return false;
    if (bounds) {
      const lat = d.merchants?.lat;
      const lng = d.merchants?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return false;
      if (lat < bounds.south || lat > bounds.north) return false;
      if (lng < bounds.west || lng > bounds.east) return false;
    }
    return true;
  });
}

export function dealsToPins(deals: DealRow[]): BrowseDealPin[] {
  const pins: BrowseDealPin[] = [];
  for (const d of deals) {
    const lat = d.merchants?.lat;
    const lng = d.merchants?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    pins.push({
      dealId: d.id,
      merchantId: d.merchant_id,
      merchantName: d.merchants?.merchant_name ?? "",
      title: d.title,
      what3wordsAddress: d.merchants?.what3words_address ?? null,
      lat,
      lng,
      rail: dealRail(d),
    });
  }
  return pins;
}

export { dealExpiryLabel } from "@/lib/deal-expiry";
