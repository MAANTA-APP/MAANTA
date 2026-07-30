"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FilterDropdown } from "@/components/ui/claude";
import {
  DEAL_FILTER_OPTIONS,
  DEFAULT_FEED_SORT,
  FEED_SORT_OPTIONS,
  type DealListFilter,
  type DealListSort,
} from "@/lib/deal-list-controls";

/**
 * Feed sort + filter dropdowns (URL-driven).
 *
 * "Featured" is the default and means the locked feed structure, so selecting it
 * clears `?sort=` rather than writing it — a bare `/feed` and an explicit
 * "Featured" must be the same URL, or the default becomes unreachable once the
 * shopper has picked something else.
 */
export function FeedControls() {
  const router = useRouter();
  const params = useSearchParams();
  const sort = (params.get("sort") as DealListSort) ?? DEFAULT_FEED_SORT;
  const filter = (params.get("filter") as DealListFilter) ?? "all";

  function update(key: "sort" | "filter", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === (key === "sort" ? DEFAULT_FEED_SORT : "all")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const q = next.toString();
    router.replace(q ? `/feed?${q}` : "/feed");
  }

  return (
    <div className="flex gap-2 px-4 pb-3">
      <FilterDropdown
        label="Sort by"
        value={sort}
        options={FEED_SORT_OPTIONS}
        onChange={(v) => update("sort", v)}
      />
      <FilterDropdown
        label="Filter"
        value={filter}
        options={DEAL_FILTER_OPTIONS}
        onChange={(v) => update("filter", v)}
      />
    </div>
  );
}
