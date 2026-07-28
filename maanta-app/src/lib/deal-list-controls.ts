import { dealRail } from "@/lib/browse";
import type { DealRow } from "@/lib/data";
import { distanceMeters } from "@/lib/what3words";

export type DealListSort = "nearest" | "newest" | "ending";
export type DealListFilter = "all" | "flash" | "boosted" | "standard";

export const DEAL_SORT_OPTIONS = [
  { value: "nearest", label: "Nearest" },
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
] as const;

export const DEAL_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "flash", label: "Flash" },
  { value: "boosted", label: "Boosted" },
  { value: "standard", label: "Standard" },
] as const;

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

export function sortDealRows(
  deals: DealRow[],
  sort: DealListSort,
  origin: { lat: number; lng: number } | null
): DealRow[] {
  const copy = [...deals];
  if (sort === "newest") {
    return copy.sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
    );
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
