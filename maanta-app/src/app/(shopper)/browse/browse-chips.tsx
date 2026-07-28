"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FilterChip } from "@/components/ui/claude";
import { parseBrowseChip, type BrowseChipFilter } from "@/lib/browse";

const BROWSE_CHIPS: { id: Exclude<BrowseChipFilter, "all">; label: string }[] = [
  { id: "ending_soon", label: "Expiring soon" },
  { id: "flash", label: "Flash" },
  { id: "favourites", label: "Favourites" },
  { id: "now", label: "Live now" },
  { id: "today", label: "Today" },
];

/** URL-driven browse chips — mutually exclusive with the Filter dropdown. */
export function BrowseChips() {
  const router = useRouter();
  const params = useSearchParams();
  const chip = parseBrowseChip(params.get("chip"));

  function selectChip(id: Exclude<BrowseChipFilter, "all">) {
    const next = new URLSearchParams(params.toString());
    const nextChip = chip === id ? "all" : id;
    if (nextChip === "all") {
      next.delete("chip");
    } else {
      next.set("chip", nextChip);
      // Rail chips overlap the Filter dropdown — only one layer at a time.
      next.delete("filter");
    }
    const q = next.toString();
    router.replace(q ? `/browse?${q}` : "/browse");
  }

  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {BROWSE_CHIPS.map((f) => (
        <FilterChip
          key={f.id}
          active={chip === f.id}
          onClick={() => selectChip(f.id)}
        >
          {f.label}
        </FilterChip>
      ))}
    </div>
  );
}
