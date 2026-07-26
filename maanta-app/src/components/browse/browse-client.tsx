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
import { collectionWindowLabel } from "@/lib/browse";
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
  { id: "all", label: "Category" },
  { id: "flash", label: "Flash" },
  { id: "boosted", label: "Boosted" },
  { id: "standard", label: "Standard" },
];

const TIME_FILTERS: { id: BrowseTimeFilter; label: string }[] = [
  { id: "any", label: "Collection time" },
  { id: "now", label: "Collect now" },
  { id: "today", label: "Today" },
];

export type BrowseDealPayload = DealRow;

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

  const filteredForPins = useMemo(() => {
    const base = filterBrowseDeals(deals, { rail, time });
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.merchants?.merchant_name ?? "").toLowerCase().includes(q)
    );
  }, [deals, rail, time, query]);

  const pins = useMemo(() => dealsToPins(filteredForPins), [filteredForPins]);

  const listDeals = useMemo(() => {
    const base = filterBrowseDeals(deals, { rail, time, bounds });
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.merchants?.merchant_name ?? "").toLowerCase().includes(q)
    );
  }, [deals, rail, time, bounds, query]);

  const focus: [number, number] | null =
    initialLat != null && initialLng != null
      ? [initialLat, initialLng]
      : null;

  const searchAndFilters = (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search deals or shops"
            className={`${inputClass} !h-11 !rounded-full !pl-9 !text-sm`}
            aria-label="Search deals"
          />
        </div>
        <Link
          href="/search"
          aria-label="Open full search"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink shadow-card"
        >
          <IconSearch className="h-4 w-4" />
        </Link>
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
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
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
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
  );

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-stone">
      <ShopperTopBar node={node} />

      <Section
        title="Deals around you"
        subtitle={
          listDeals.length === 1
            ? "1 deal in view"
            : `${listDeals.length} deals in view · pan the map below to refresh`
        }
        className="pb-2"
      >
        <div className="mb-4">{searchAndFilters}</div>
        {listDeals.length === 0 ? (
          <EmptyState
            title="No deals in this area"
            sub="Pan the map or clear filters to see more."
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
                  collectionLabel={collectionWindowLabel(
                    d.starts_at,
                    d.expires_at
                  )}
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

      <div className="px-4 pb-6 pt-2">
        <div className="relative overflow-hidden rounded-card border border-line bg-white shadow-card">
          <div className="relative h-[34vh] min-h-[200px]">
            <BrowseMap
              key={recenterKey}
              pins={pins}
              center={[origin.lat, origin.lng]}
              focus={focus ?? (recenterKey > 0 ? [origin.lat, origin.lng] : null)}
              selectedDealId={initialDealId}
              onBounds={onBounds}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex justify-end p-3">
              <IconButton
                className="pointer-events-auto"
                label="Recenter on current mall"
                onClick={() => setRecenterKey((k) => k + 1)}
              >
                <IconPin className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
