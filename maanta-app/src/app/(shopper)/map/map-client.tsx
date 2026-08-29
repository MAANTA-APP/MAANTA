"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { FilterDropdown, IconButton } from "@/components/ui/claude";
import { EmptyState } from "@/components/ui/states";
import {
  dealsToPins,
  filterBrowseDeals,
  type BrowseRailFilter,
  type BrowseTimeFilter,
  type MapBounds,
} from "@/lib/browse";
import type { DealRow } from "@/lib/data";
import { IconPin, IconSearch } from "@/components/ui/icons";
import { inputClass } from "@/components/ui/inputs";
import { useShopperClock } from "@/lib/use-shopper-clock";

const BrowseMap = dynamic(
  () => import("@/components/browse/browse-map").then((m) => m.BrowseMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-stone-soft text-sm text-muted">
        Loading map…
      </div>
    ),
  }
);

const RAIL_FILTERS = [
  { value: "all", label: "All" },
  { value: "flash", label: "Flash" },
  { value: "boosted", label: "Boosted" },
  { value: "standard", label: "Standard" },
] as const;

const TIME_FILTERS = [
  { value: "any", label: "Any time" },
  { value: "now", label: "Live now" },
  { value: "today", label: "Today" },
] as const;

/** Full-screen map for the shopper's current mall/node. */
export function MapClient({
  node,
  deals,
  origin,
  initialLat,
  initialLng,
  initialDealId,
}: {
  node: string;
  deals: DealRow[];
  origin: { lat: number; lng: number };
  initialLat?: number | null;
  initialLng?: number | null;
  initialDealId?: string | null;
}) {
  const [rail, setRail] = useState<BrowseRailFilter>("all");
  const [time, setTime] = useState<BrowseTimeFilter>("any");
  const [query, setQuery] = useState("");
  const [recenterKey, setRecenterKey] = useState(0);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const onBounds = useCallback((b: MapBounds) => setBounds(b), []);

  // D213 criterion 3 — the shared clock, so a pin and its list row disappear
  // together when the deal expires while the map is open.
  const now = useShopperClock();

  const filtered = useMemo(() => {
    const base = filterBrowseDeals(deals, { rail, time, bounds, now });
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.merchants?.merchant_name ?? "").toLowerCase().includes(q)
    );
  }, [deals, rail, time, bounds, query, now]);

  const pins = useMemo(() => dealsToPins(filtered), [filtered]);

  const focus: [number, number] | null =
    initialLat != null && initialLng != null
      ? [initialLat, initialLng]
      : null;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-stone">
      <ShopperTopBar node={node} />

      <div className="relative min-h-0 flex-1 px-0">
        <div className="absolute inset-0">
          <BrowseMap
            key={recenterKey}
            pins={pins}
            center={[origin.lat, origin.lng]}
            focus={focus ?? (recenterKey > 0 ? [origin.lat, origin.lng] : null)}
            selectedDealId={initialDealId}
            onBounds={onBounds}
          />
        </div>

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
                aria-label="Search deals on map"
              />
            </div>
            <IconButton
              label="Recenter on current mall"
              onClick={() => setRecenterKey((k) => k + 1)}
              className="bg-white/95 backdrop-blur-sm"
            >
              <IconPin className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="pointer-events-auto flex gap-2">
            {/*
              "Deal type", not "Category". This control has always filtered
              Flash / Boosted / Standard — the deal's rail — and calling that a
              category was fine only while the product had no categories. It has
              them now (ten of them, fashion through services), and two axes cannot
              share one word on the same app.
            */}
            <FilterDropdown
              label="Deal type"
              value={rail}
              options={RAIL_FILTERS}
              onChange={(v) => setRail(v as BrowseRailFilter)}
            />
            <FilterDropdown
              label="When"
              value={time}
              options={TIME_FILTERS}
              onChange={(v) => setTime(v as BrowseTimeFilter)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-24 z-[500]">
            <div className="pointer-events-auto rounded-card bg-white/95 p-4 shadow-card backdrop-blur-sm">
              <EmptyState
                title="No deals in this area"
                sub="Try clearing filters or panning the map."
              />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-3">
            <p className="pointer-events-auto rounded-full bg-white/95 px-3 py-1.5 text-center text-xs font-semibold text-muted shadow-card backdrop-blur-sm">
              {filtered.length} deal{filtered.length === 1 ? "" : "s"} on map ·{" "}
              <Link href="/browse" className="text-ink underline-offset-2 hover:underline">
                List view
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
