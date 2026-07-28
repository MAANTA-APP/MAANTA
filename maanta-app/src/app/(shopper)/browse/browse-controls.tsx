"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FilterDropdown } from "@/components/ui/claude";
import {
  DEAL_FILTER_OPTIONS,
  DEAL_SORT_OPTIONS,
  type DealListFilter,
  type DealListSort,
} from "@/lib/deal-list-controls";

/** Browse sort + filter dropdowns (URL-driven, same keys as /feed). */
export function BrowseControls() {
  const router = useRouter();
  const params = useSearchParams();
  const sort = (params.get("sort") as DealListSort) ?? "nearest";
  const filter = (params.get("filter") as DealListFilter) ?? "all";

  function update(key: "sort" | "filter", value: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "filter" && value !== "all") {
      next.delete("chip");
    }
    if (value === (key === "sort" ? "nearest" : "all")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const q = next.toString();
    router.replace(q ? `/browse?${q}` : "/browse");
  }

  return (
    <div className="flex gap-2">
      <FilterDropdown
        label="Sort by"
        value={sort}
        options={DEAL_SORT_OPTIONS}
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
