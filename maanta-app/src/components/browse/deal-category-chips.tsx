"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterChip } from "@/components/ui/claude";
import { parseDealCategory, type DealCategory } from "@/lib/deal-categories";

/**
 * Shopper category filter — URL-driven, single-select, shared by /feed and
 * /browse so the two surfaces cannot drift into different taxonomies.
 *
 * `options` comes from the server and holds only categories that actually have
 * a live deal behind them, computed from the UNFILTERED set. Two consequences
 * worth keeping:
 *
 *   * A chip never leads to an empty screen. "No deals live right now" should
 *     mean the mall is quiet, not that the shopper picked the one bucket nobody
 *     is selling into today.
 *   * The row survives its own selection. Derived from the filtered list, the
 *     other chips would disappear the moment one was picked.
 *
 * "All" clears `?category=` rather than writing `category=all`, so a bare
 * `/feed` and an explicitly-chosen All are the same URL — the same rule the sort
 * and filter dropdowns already follow.
 *
 * `usePathname` rather than a hardcoded route: this renders on both surfaces,
 * and a literal would have silently sent every /browse selection to /feed.
 */
export function DealCategoryChips({
  options,
}: {
  options: readonly { key: DealCategory; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = parseDealCategory(params.get("category"));

  // Normally: no categories worth offering, so render nothing. The exception is
  // an active `?category=` with no options behind it — a shared link, a bookmark,
  // or a refresh after the last deal in that bucket expired. Withholding the row
  // there removes the only control that can clear the filter, so the shopper sees
  // an empty screen with nothing on it to undo. One "All" chip is the escape.
  if (options.length === 0 && active === "all") return null;

  function select(next: DealCategory | "all") {
    const query = new URLSearchParams(params.toString());
    if (next === "all") {
      query.delete("category");
    } else {
      query.set("category", next);
    }
    const q = query.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <div
      className="no-scrollbar flex gap-1.5 overflow-x-auto"
      role="group"
      aria-label="Filter deals by category"
    >
      <FilterChip active={active === "all"} onClick={() => select("all")}>
        All
      </FilterChip>
      {options.map((c) => (
        <FilterChip
          key={c.key}
          active={active === c.key}
          onClick={() => select(active === c.key ? "all" : c.key)}
        >
          {c.label}
        </FilterChip>
      ))}
    </div>
  );
}
