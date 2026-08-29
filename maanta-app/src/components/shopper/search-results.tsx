"use client";

import { EmptyState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import {
  LiveDealCollection,
  useLiveItems,
  type LiveDealItem,
} from "@/components/shopper/live-deal-collection";

/**
 * `/search` results, decided on the shared clock (D213 criterion 3).
 *
 * `/search` builds its own query rather than reading `getLiveDeals`, so it
 * carries `expires_at > now` itself — and that predicate stops being true while
 * the results sit open. The empty state lives here for the same reason it does
 * on `/my-deals`: "No results" is a claim about the CURRENT time, so deciding
 * it upstream would leave a page with no results and no explanation once the
 * last one expired.
 */
export function SearchResults({
  items,
  query,
}: {
  items: LiveDealItem[];
  query: string;
}) {
  const live = useLiveItems(items);

  if (live.length === 0) {
    return (
      <div className="mt-6 text-center">
        <EmptyState
          title={query ? `No results for "${query}"` : "No results"}
          sub="Try a different word, or browse all live deals."
        />
        <ButtonLink href="/feed" variant="ghost" size="sm" className="-mt-8">
          Browse deals
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      <LiveDealCollection items={items} layout="rows" cardVariant="row" />
    </div>
  );
}
