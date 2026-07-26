"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DiscoverDealCard } from "@/components/discover-deal-card";
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
import { cn } from "@/lib/ui";
import { IconSearch } from "@/components/ui/icons";

const BrowseMap = dynamic(
  () => import("./browse-map").then((m) => m.BrowseMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-cream text-sm text-muted">
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

export type BrowseDealPayload = DealRow & {
  // Client receives JSON-serialized deals from the server page.
};

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

  const onBounds = useCallback((b: MapBounds) => setBounds(b), []);

  const filteredForPins = useMemo(
    () => filterBrowseDeals(deals, { rail, time }),
    [deals, rail, time]
  );
  const pins = useMemo(() => dealsToPins(filteredForPins), [filteredForPins]);

  const listDeals = useMemo(
    () => filterBrowseDeals(deals, { rail, time, bounds }),
    [deals, rail, time, bounds]
  );

  const center: [number, number] = [
    initialLat ?? origin.lat,
    initialLng ?? origin.lng,
  ];
  const focus: [number, number] | null =
    initialLat != null && initialLng != null
      ? [initialLat, initialLng]
      : null;

  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <ShopperTopBar node={node} />

      <div className="relative h-[42vh] min-h-[220px] border-b border-line">
        <BrowseMap
          pins={pins}
          center={center}
          focus={focus}
          selectedDealId={initialDealId}
          onBounds={onBounds}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-3">
          <div className="pointer-events-auto flex items-center justify-between gap-2">
            <div className="no-scrollbar flex max-w-[85%] gap-1.5 overflow-x-auto rounded-full border border-line bg-white/95 p-1 shadow-sm backdrop-blur">
              {RAIL_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRail(f.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold",
                    rail === f.id ? "bg-ink text-white" : "text-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Link
              href="/search"
              aria-label="Search deals"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/95 text-ink shadow-sm"
            >
              <IconSearch className="h-4 w-4" />
            </Link>
          </div>
          <div className="pointer-events-auto no-scrollbar flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-full border border-line bg-white/95 p-1 shadow-sm backdrop-blur">
            {TIME_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTime(f.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold",
                  time === f.id ? "bg-ink text-white" : "text-muted"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="flex-1 px-4 pb-6 pt-4">
        <h2 className="text-base font-bold text-ink">
          {listDeals.length} deal{listDeals.length === 1 ? "" : "s"} in view
        </h2>
        <p className="mt-0.5 text-[11px] text-faint">
          Scroll the map to refresh this list
        </p>

        {listDeals.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No deals in this area"
              sub="Pan the map or clear filters to see more."
            />
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {listDeals.map((d) => {
              const pricing = dealPricing(d);
              const lat = d.merchants?.lat;
              const lng = d.merchants?.lng;
              const distanceLabel =
                typeof lat === "number" && typeof lng === "number"
                  ? formatDistanceMeters(
                      distanceMeters(origin, { lat, lng })
                    )
                  : null;
              const tag =
                d.deal_type === "flash"
                  ? ("flash" as const)
                  : d.boost_active
                    ? ("boosted" as const)
                    : null;
              return (
                <DiscoverDealCard
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
      </section>
    </main>
  );
}
