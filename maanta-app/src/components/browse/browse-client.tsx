"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  DealCard,
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
import { BrowseChips } from "@/app/(shopper)/browse/browse-chips";
import { DealCategoryChips } from "@/components/browse/deal-category-chips";
import {
  dealCategoryLabel,
  filterDealsByCategory,
  type DealCategory,
  type DealCategoryFilter,
} from "@/lib/deal-categories";

export type BrowseDealPayload = DealRow;

function browseEmptyState(opts: {
  chip: BrowseChipFilter;
  isSignedIn: boolean;
  favouritesCount: number;
  category: DealCategoryFilter;
  categoryEmptied: boolean;
}): { title: string; sub: string; actionLabel?: string; actionHref?: string } {
  // Checked before the favourites branch, because the favourites branch makes a
  // claim about the merchant ("your saved merchants have no live deals in this
  // node") that is false when a category filter is what removed them. Naming the
  // filter that actually emptied the list is both truer and more useful than
  // naming the one the shopper happens to be standing in.
  if (opts.categoryEmptied && opts.category !== "all") {
    return {
      title: `No ${(dealCategoryLabel(opts.category) ?? "").toLowerCase()} deals right now`,
      sub: "Tap All to see everything live at this mall.",
    };
  }
  if (opts.chip === "favourites") {
    if (!opts.isSignedIn) {
      return {
        title: "Sign in to see favourites",
        sub: "Save shops from deal cards, then filter deals from those merchants here.",
        actionLabel: "Sign in",
        actionHref: "/login?next=/browse",
      };
    }
    if (opts.favouritesCount === 0) {
      return {
        title: "No saved shops yet",
        sub: "Tap the heart on a deal card to save a shop, then return here.",
        actionLabel: "View saved shops",
        actionHref: "/my-deals?tab=shops",
      };
    }
    return {
      title: "No deals from saved shops",
      sub: "Your saved merchants have no live deals in this node right now.",
    };
  }

  return {
    title: "No deals match your filters",
    sub: "Try adjusting filters or switching node.",
  };
}

export function BrowseClient({
  node,
  deals,
  origin,
  favourites,
  sort,
  filter,
  chip,
  category,
  categoryOptions,
  isSignedIn,
}: {
  node: string;
  deals: BrowseDealPayload[];
  origin: { lat: number; lng: number };
  favourites: string[];
  sort: DealListSort;
  filter: DealListFilter;
  chip: BrowseChipFilter;
  category: DealCategoryFilter;
  categoryOptions: readonly { key: DealCategory; label: string }[];
  isSignedIn: boolean;
}) {
  const favSet = useMemo(() => new Set(favourites), [favourites]);
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
    const base = filterBrowseDeals(
      filterDealsByCategory(filterDealRowsByRail(deals, filter), category),
      {
        rail: "all",
        chip,
        favouriteMerchantIds: favSet,
      }
    );
    return sortDealRows(applySearch(base), sort, origin);
  }, [deals, filter, category, chip, favSet, sort, origin, applySearch]);

  // True when this node has live deals but none in the chosen category, so the
  // empty state can say which filter emptied the list instead of guessing.
  const categoryEmptied =
    deals.length > 0 && filterDealsByCategory(deals, category).length === 0;

  const empty = browseEmptyState({
    chip,
    isSignedIn,
    favouritesCount: favourites.length,
    category,
    categoryEmptied,
  });

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
      <Suspense fallback={null}>
        <DealCategoryChips options={categoryOptions} />
      </Suspense>
      <Suspense fallback={null}>
        <BrowseChips />
      </Suspense>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-stone">
      <ShopperTopBar node={node} />

      <Section title="Deals around you" subtitle={subtitle} className="pb-6">
        <div className="mb-4">{searchAndFilters}</div>
        {listDeals.length === 0 ? (
          <EmptyState
            title={empty.title}
            sub={empty.sub}
            actionLabel={empty.actionLabel}
            actionHref={empty.actionHref}
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
