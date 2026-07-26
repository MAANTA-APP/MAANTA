"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FilterDropdown } from "@/components/ui/claude";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
  { value: "redeemed", label: "Redeemed last" },
];

/** My deals sort dropdown (Active/Past stays segmented). */
export function MyDealsControls({
  when,
  className,
}: {
  when: "active" | "past";
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const sort = params.get("sort") ?? "newest";

  function updateSort(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "newest") {
      next.delete("sort");
    } else {
      next.set("sort", value);
    }
    if (when === "past") next.set("when", "past");
    const q = next.toString();
    router.replace(q ? `/my-deals?${q}` : "/my-deals");
  }

  return (
    <FilterDropdown
      label="Sort by"
      value={sort}
      options={SORT_OPTIONS}
      onChange={updateSort}
      className={className}
    />
  );
}
