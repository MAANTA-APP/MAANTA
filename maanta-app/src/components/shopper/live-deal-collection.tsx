"use client";

import type { ComponentProps, ReactNode } from "react";
import { DealCard, Section, RailScroller } from "@/components/ui/claude";
import { isUnexpiredAt } from "@/lib/live-deals";
import { useShopperClock } from "@/lib/use-shopper-clock";

export type LiveDealItem = {
  id: string;
  expiresAt: string | null;
  card: ComponentProps<typeof DealCard>;
};

/** Still-live items, in the order given. Order is the server's, never re-derived. */
export function liveItemsAt(items: LiveDealItem[], now: Date): LiveDealItem[] {
  return items.filter((i) => isUnexpiredAt(i.expiresAt, now));
}

/** The shared clock's view of a collection, for a caller that renders its own chrome. */
export function useLiveItems(items: LiveDealItem[]): LiveDealItem[] {
  return liveItemsAt(items, useShopperClock());
}

/**
 * One discovery collection, with its heading, decided on the shared clock
 * (D213 criterion 3 — section membership).
 *
 * Every rail on `/feed`, the `/search` results and the `/shops/[id]` list were
 * fixed at server render, so a deal expiring while the page sat open kept its
 * place — and after this PR made the card's own label live, it sat there
 * reading "Expired" under a heading promising the opposite. That is the same
 * row-versus-section contradiction already corrected on `/my-deals`, one
 * containment level out again.
 *
 * **The heading goes with the collection.** A section that renders its title
 * server-side and its contents on the clock produces the worst state of all:
 * "Live deals" over nothing. So this owns both, and renders nothing at all
 * when no member survives.
 *
 * Chrome arrives as props rather than being hardcoded here, so the ruled rail
 * titles stay written at their call sites where the founder ruling (R2) and
 * `rail-names.test.ts` can both still see them.
 *
 * It removes; it never adds, reorders or promotes. The locked rail orders are
 * orders WITHIN a rail, so they hold on any subset — which is why dropping a
 * member is safe and re-sorting would not be. Nothing is fetched: expiry is
 * already on every row. The claim cap is deliberately untouched (criterion 4).
 */
export function LiveDealCollection({
  items,
  layout = "rail",
  lead = false,
  keyPrefix = "",
  title,
  subtitle,
  action,
  padded,
  cardVariant,
}: {
  items: LiveDealItem[];
  /** "rail" scrolls horizontally; "rows" stacks compact rows. */
  layout?: "rail" | "rows";
  /** Render the first surviving item as the image-forward lead above the rail. */
  lead?: boolean;
  keyPrefix?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  padded?: boolean;
  /** Variant for the non-lead cards. Defaults to the card's own. */
  cardVariant?: ComponentProps<typeof DealCard>["variant"];
}) {
  const live = useLiveItems(items);
  if (live.length === 0) return null;

  const [first, ...rest] = live;
  const body =
    layout === "rows" ? (
      <div className="space-y-rail">
        {live.map((i) => (
          <DealCard key={`${keyPrefix}${i.id}`} {...i.card} variant={cardVariant ?? i.card.variant} />
        ))}
      </div>
    ) : lead ? (
      <>
        {/* Direction A: the first deal is the one image-forward lead; the rest
            of the rail continues beneath it. The lead IS position 1, so when
            the previous lead expires the next deal inherits the slot rather
            than the rail losing its head.

            KEYED BY DEAL, like every other card here. The lead is the one slot
            whose occupant changes identity in place, and React reconciles an
            unkeyed child by position: the promoted deal would reuse the expired
            one's component instance, and `FavouriteButton` reads `initial` into
            local state exactly once. A shopper tapping the heart on the new
            lead would then submit the PREVIOUS merchant's saved state — a wrong
            write to their own data, from a card that merely moved. */}
        <div className="px-4">
          <DealCard key={`${keyPrefix}lead-${first.id}`} variant="lead" {...first.card} />
        </div>
        {rest.length > 0 ? (
          <RailScroller className="mt-3">
            {rest.map((i) => (
              <DealCard key={`${keyPrefix}${i.id}`} {...i.card} />
            ))}
          </RailScroller>
        ) : null}
      </>
    ) : (
      <RailScroller>
        {live.map((i) => (
          <DealCard key={`${keyPrefix}${i.id}`} {...i.card} />
        ))}
      </RailScroller>
    );

  if (!title) return body;
  return (
    <Section title={title} subtitle={subtitle} action={action} padded={padded}>
      {body}
    </Section>
  );
}
