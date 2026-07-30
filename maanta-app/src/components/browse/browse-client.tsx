"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  DealCard,
  FilterChip,
  IconButton,
  Section,
} from "@/components/ui/claude";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { EmptyState } from "@/components/ui/states";
import {
  dealsToPins,
  filterBrowseDeals,
  type BrowseRailFilter,
  type BrowseTimeFilter,
  type MapBounds,
} from "@/lib/browse";
import type { DealRow } from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { dealExpiryLabel } from "@/lib/browse";
import { distanceMeters, formatDistanceMeters } from "@/lib/what3words";
import { IconPin, IconSearch } from "@/components/ui/icons";
import { inputClass } from "@/components/ui/inputs";

const BrowseMap = dynamic(
  () => import("./browse-map").then((m) => m.BrowseMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-card bg-stone-soft text-sm text-muted">
        Loading map…
      </div>
    ),
  }
);

const RAIL_FILTERS: { id: BrowseRailFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flash", label: "Flash" },
  { id: "boosted", label: "Boosted" },
  { id: "standard", label: "Standard" },
];

const TIME_FILTERS: { id: BrowseTimeFilter; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "now", label: "Collect now" },
  { id: "today", label: "Today" },
];

export type BrowseDealPayload = DealRow;

/**
 * Browse — Leaflet map + deal list filtered to map bounds.
 * Rail + collect-time filters match the Discover/Browse plan.
 */
export function BrowseClient({
  node,
  deals,
  origin,
  favourites,
  initialLat,
  initialLng,
  initialDealId,
}: {
  node: string;
  deals: BrowseDealPayload[];
  origin: { lat: number; lng: number };
  favourites: string[];
  initialLat?: number | null;
  initialLng?: number | null;
  initialDealId?: string | null;
}) {
  const favSet = useMemo(() => new Set(favourites), [favourites]);
  const [rail, setRail] = useState<BrowseRailFilter>("all");
  const [time, setTime] = useState<BrowseTimeFilter>("any");
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [query, setQuery] = useState("");
  const [recenterKey, setRecenterKey] = useState(0);

  const onBounds = useCallback((b: MapBounds) => setBounds(b), []);

  const applySearch = useCallback(
    (rows: DealRow[]) => {
      const q = query.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.merchants?.merchant_name ?? "").toLowerCase().includes(q)
      );
    },
    [query]
  );

  /** Pins use rail/time/search only — not bounds (pins drive the viewport). */
  const filteredForPins = useMemo(() => {
    return applySearch(filterBrowseDeals(deals, { rail, time }));
  }, [deals, rail, time, applySearch]);

  const pins = useMemo(() => dealsToPins(filteredForPins), [filteredForPins]);

  /** List is further clipped to the current map viewport. */
  const listDeals = useMemo(() => {
    return applySearch(filterBrowseDeals(deals, { rail, time, bounds }));
  }, [deals, rail, time, bounds, applySearch]);

  const focus: [number, number] | null =
    initialLat != null && initialLng != null
      ? [initialLat, initialLng]
      : null;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-stone">
      <ShopperTopBar node={node} />

      <div className="relative h-[42vh] min-h-[220px] w-full shrink-0 border-b border-line">
        <BrowseMap
          key={recenterKey}
          pins={pins}
          center={[origin.lat, origin.lng]}
          focus={focus ?? (recenterKey > 0 ? [origin.lat, origin.lng] : null)}
          selectedDealId={initialDealId}
          onBounds={onBounds}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search deals or shops"
                className={`${inputClass} !h-11 !rounded-full !bg-white/95 !pl-9 !text-sm backdrop-blur-sm`}
                aria-label="Search deals"
              />
            </div>
            <Link
              href="/search"
              aria-label="Open full search"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white/95 text-ink shadow-card backdrop-blur-sm"
            >
              <IconSearch className="h-4 w-4" />
            </Link>
            <IconButton
              label="Recenter on current mall"
              onClick={() => setRecenterKey((k) => k + 1)}
              className="bg-white/95 backdrop-blur-sm"
            >
              <IconPin className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="pointer-events-auto no-scrollbar flex gap-1.5 overflow-x-auto">
            {RAIL_FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                active={rail === f.id}
                onClick={() => setRail(f.id)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
          <div className="pointer-events-auto no-scrollbar flex gap-1.5 overflow-x-auto">
            {TIME_FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                active={time === f.id}
                onClick={() => setTime(f.id)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      <Section
        title="Deals around you"
        subtitle={
          listDeals.length === 0
            ? "No deals in this map area — pan the map or clear filters."
            : listDeals.length === 1
              ? "1 deal in view"
              : `${listDeals.length} deals in view`
        }
        className="pb-6"
      >
        {listDeals.length === 0 ? (
          <EmptyState
            title="No deals in this area"
            sub="Try clearing filters or panning the map."
          />
        ) : (
          <div className="space-y-rail">
            {listDeals.map((d) => {
              const pricing = dealPricing(d);
              const lat = d.merchants?.lat;
              const lng = d.merchants?.lng;
              const distanceLabel =
                typeof lat === "number" && typeof lng === "number"
                  ? formatDistanceMeters(distanceMeters(origin, { lat, lng }))
                  : null;
              const tag =
                d.deal_type === "flash"
                  ? ("flash" as const)
                  : d.boost_active
                    ? ("boosted" as const)
                    : ("standard" as const);
              return (
                <DealCard
                  key={d.id}
                  variant="vertical"
                  href={`/deals/${d.id}`}
                  imageUrl={d.image_url}
                  merchantName={d.merchants?.merchant_name ?? ""}
                  mallName={d.merchants?.mall_name ?? d.node}
                  title={d.title}
                  expiryLabel={dealExpiryLabel(d.expires_at)}
                  distanceLabel={distanceLabel}
                  pay={pricing.pay}
                  wasKes={pricing.was}
                  extras={pricing.extras}
                  tag={tag}
                  expiresAt={d.expires_at}
                  merchantId={d.merchant_id}
                  isFavourite={favSet.has(d.merchant_id)}
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
