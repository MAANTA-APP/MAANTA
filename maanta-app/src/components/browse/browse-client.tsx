"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  DealCard,
  FilterChip,
  Section,
} from "@/components/ui/claude";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { EmptyState } from "@/components/ui/states";
import {
  filterBrowseDeals,
  type BrowseChipFilter,
} from "@/lib/browse";
import type { DealRow } from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { dealExpiryLabel } from "@/lib/browse";
import {
  filterDealRowsByRail,
  sortDealRows,
  type DealListFilter,
  type DealListSort,
} from "@/lib/deal-list-controls";
import { distanceMeters, formatDistanceMeters } from "@/lib/what3words";
import { IconSearch } from "@/components/ui/icons";
import { inputClass } from "@/components/ui/inputs";
import { BrowseControls } from "@/app/(shopper)/browse/browse-controls";

const BROWSE_CHIPS: { id: BrowseChipFilter; label: string }[] = [
  { id: "ending_soon", label: "Ending soon" },
  { id: "flash", label: "Flash" },
  { id: "favourites", label: "Favourites" },
  { id: "now", label: "Live now" },
  { id: "today", label: "Today" },
];

export type BrowseDealPayload = DealRow;

export function BrowseClient({
  node,
  deals,
  origin,
  favourites,
  sort,
  filter,
}: {
  node: string;
  deals: BrowseDealPayload[];
  origin: { lat: number; lng: number };
  favourites: string[];
  sort: DealListSort;
  filter: DealListFilter;
}) {
  const favSet = useMemo(() => new Set(favourites), [favourites]);
  const [chip, setChip] = useState<BrowseChipFilter>("all");
  const [query, setQuery] = useState("");

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

  const listDeals = useMemo(() => {
    const base = filterBrowseDeals(filterDealRowsByRail(deals, filter), {
      rail: "all",
      chip,
      favouriteMerchantIds: favSet,
    });
    return sortDealRows(applySearch(base), sort, origin);
  }, [deals, filter, chip, favSet, sort, origin, applySearch]);

  const subtitle =
    listDeals.length === 0
      ? "0 deals match your filters here · try adjusting filters or switching node."
      : listDeals.length === 1
        ? "1 deal matches your filters"
        : `${listDeals.length} deals match your filters`;

  const searchAndFilters = (
    <div className="space-y-2.5">
      <Suspense fallback={null}>
        <BrowseControls />
      </Suspense>
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
        {BROWSE_CHIPS.map((f) => (
          <FilterChip
            key={f.id}
            active={chip === f.id}
            onClick={() =>
              setChip((current) => (current === f.id ? "all" : f.id))
            }
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

      <Section title="Deals around you" subtitle={subtitle} className="pb-6">
        <div className="mb-4">{searchAndFilters}</div>
        {listDeals.length === 0 ? (
          <EmptyState
            title="No deals match your filters"
            sub="Try adjusting filters or switching node."
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
