"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/states";
import { feedEmptyState } from "@/lib/feed-empty-state";
import type { DealCategoryFilter } from "@/lib/deal-categories";
import type { DealListFilter } from "@/lib/deal-list-controls";
import { isUnexpiredAt } from "@/lib/live-deals";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * Chooses between the feed's rails and its empty state on the shared clock
 * (D213 criterion 3).
 *
 * Each rail withdraws its own expired members, so without this the last deal
 * expiring on an open feed would leave every section gone and NOTHING in their
 * place — a blank screen that states nothing, which is worse than the stale
 * card it replaced.
 *
 * The counts `feedEmptyState` needs are recomputed here from expiry timestamps
 * rather than passed as frozen numbers, so the copy still names the filter that
 * actually emptied the screen. Passing `liveTotal` as a number would make an
 * all-expired feed claim a category or deal-type filter emptied it.
 *
 * The rails arrive as children: their ruled titles stay written in the page,
 * where the founder ruling (R2) and `rail-names.test.ts` can see them.
 */
export function FeedBody({
  children,
  liveExpiries,
  afterCategoryExpiries,
  shownExpiries,
  category,
  filter,
}: {
  children: ReactNode;
  /** Expiry of every live deal at this node, before any shopper filter. */
  liveExpiries: (string | null)[];
  /** Expiry of every deal after the category filter, before the deal-type filter. */
  afterCategoryExpiries: (string | null)[];
  /** Expiry of every deal the rails would render. */
  shownExpiries: (string | null)[];
  category: DealCategoryFilter;
  filter: DealListFilter;
}) {
  const now = useShopperClock();
  const count = (xs: (string | null)[]) =>
    xs.filter((x) => isUnexpiredAt(x, now)).length;

  if (count(shownExpiries) > 0) return <>{children}</>;
  return (
    <EmptyState
      {...feedEmptyState({
        liveTotal: count(liveExpiries),
        afterCategoryTotal: count(afterCategoryExpiries),
        category,
        filter,
      })}
    />
  );
}
