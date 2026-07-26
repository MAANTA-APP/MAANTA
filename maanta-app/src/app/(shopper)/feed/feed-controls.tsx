"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FilterDropdown } from "@/components/ui/claude";

const SORT_OPTIONS = [
  { value: "nearest", label: "Nearest" },
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
];

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "flash", label: "Flash" },
  { value: "boosted", label: "Boosted" },
  { value: "standard", label: "Standard" },
];

/** Feed sort + filter dropdowns (URL-driven). */
export function FeedControls() {
  const router = useRouter();
  const params = useSearchParams();
  const sort = params.get("sort") ?? "nearest";
  const filter = params.get("filter") ?? "all";

  function update(key: "sort" | "filter", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === (key === "sort" ? "nearest" : "all")) {
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
        options={SORT_OPTIONS}
        onChange={(v) => update("sort", v)}
      />
      <FilterDropdown
        label="Filter"
        value={filter}
        options={FILTER_OPTIONS}
        onChange={(v) => update("filter", v)}
      />
    </div>
  );
}
