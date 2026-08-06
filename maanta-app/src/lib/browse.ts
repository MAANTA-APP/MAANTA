import type { DealRow } from "@/lib/data";

export type BrowseRailFilter = "all" | "flash" | "boosted" | "standard";
export type BrowseTimeFilter = "any" | "now" | "today";

/** Browse list chips — replaces legacy "Any time" on /browse. */
export type BrowseChipFilter =
  | "all"
  | "ending_soon"
  | "flash"
  | "favourites"
  | "now"
  | "today";

/** Deals expiring within this window qualify for the Expiring soon chip. */
const ENDING_SOON_HOURS = 6;

const BROWSE_CHIP_FILTERS: BrowseChipFilter[] = [
  "all",
  "ending_soon",
  "flash",
  "favourites",
  "now",
  "today",
];

/** Parse `?chip=` from browse URL; unknown values fall back to `all`. */
export function parseBrowseChip(
  raw: string | null | undefined
): BrowseChipFilter {
  if (!raw) return "all";
  return BROWSE_CHIP_FILTERS.includes(raw as BrowseChipFilter)
    ? (raw as BrowseChipFilter)
    : "all";
}

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

function isCollectToday(d: DealRow, now = new Date()): boolean {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const start = new Date(d.starts_at).getTime();
  const end = d.expires_at ? new Date(d.expires_at).getTime() : start;
  // Overlaps today's local calendar day.
  return start <= endOfDay.getTime() && end >= startOfDay.getTime();
}

/** Live deal expiring within ENDING_SOON_HOURS (flash-aligned window). */
export function isEndingSoon(
  d: DealRow,
  now = new Date(),
  withinHours = ENDING_SOON_HOURS
): boolean {
  if (!d.expires_at) return false;
  if (!isLiveNow(d, now)) return false;
  const expires = new Date(d.expires_at).getTime();
  return expires <= now.getTime() + withinHours * 3_600_000;
}

function applyBrowseChipFilter(
  d: DealRow,
  chip: BrowseChipFilter,
  now: Date,
  favouriteMerchantIds: ReadonlySet<string> | null
): boolean {
  switch (chip) {
    case "all":
      return true;
    case "ending_soon":
      return isEndingSoon(d, now);
    case "flash":
      return dealRail(d) === "flash";
    case "favourites":
      return favouriteMerchantIds?.has(d.merchant_id) ?? false;
    case "now":
      return isLiveNow(d, now);
    case "today":
      return isCollectToday(d, now);
    default: {
      const _exhaustive: never = chip;
      return _exhaustive;
    }
  }
}

export function filterBrowseDeals(
  deals: DealRow[],
  opts: {
    rail?: BrowseRailFilter;
    time?: BrowseTimeFilter;
    chip?: BrowseChipFilter;
    favouriteMerchantIds?: ReadonlySet<string> | string[] | null;
    bounds?: MapBounds | null;
    now?: Date;
  } = {}
): DealRow[] {
  const rail = opts.rail ?? "all";
  const now = opts.now ?? new Date();
  const bounds = opts.bounds ?? null;
  const favSet =
    opts.favouriteMerchantIds instanceof Set
      ? opts.favouriteMerchantIds
      : opts.favouriteMerchantIds
        ? new Set(opts.favouriteMerchantIds)
        : null;

  return deals.filter((d) => {
    if (rail !== "all" && dealRail(d) !== rail) return false;

    if (opts.chip !== undefined) {
      if (!applyBrowseChipFilter(d, opts.chip, now, favSet)) return false;
    } else {
      const time = opts.time ?? "any";
      if (time === "now" && !isLiveNow(d, now)) return false;
      if (time === "today" && !isCollectToday(d, now)) return false;
    }

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
