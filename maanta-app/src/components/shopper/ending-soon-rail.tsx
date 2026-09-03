"use client";

import type { ComponentProps } from "react";
import { DealCard, Section, RailScroller } from "@/components/ui/claude";
import { endingSoonDeals, ENDING_SOON_SUBTITLE } from "@/lib/ending-soon";
import { useShopperClock } from "@/lib/use-shopper-clock";

type Membership = {
  id: string;
  expires_at: string | null;
  max_claims: number | null;
  claims_reserved: number;
};

export type EndingSoonItem = {
  membership: Membership;
  card: ComponentProps<typeof DealCard>;
};

/**
 * "Ending soon" membership, decided on the client clock (D213 criteria 2 & 3).
 *
 * `endingSoonDeals` used to run once during the server render, so a deal that
 * expired while the feed sat open stayed under a heading promising a claim
 * window closing within the hour — and a deal that entered the window never
 * appeared. Membership is now recomputed on every tick from the same selection
 * function the server used, so the section reflects the current time in both
 * directions.
 *
 * **This fetches nothing and the claim cap is deliberately NOT re-derived.**
 * `claims_reserved` only changes server-side, so the values here are the ones the
 * page was rendered with; `endingSoonDeals` still applies the cap exclusion to
 * them exactly as it did on the server. Reflecting exhaustion that happens
 * while the page is open is criterion 4 and needs fresh data — separate work.
 *
 * Candidates are every rail-eligible deal rather than only the ones that
 * qualified at render, because a deal crossing INTO the window is as much a
 * membership change as one leaving it. The cards are passed as plain props,
 * which the other rails already serialise for the same deals.
 */
export function EndingSoonRail({ items }: { items: EndingSoonItem[] }) {
  const now = useShopperClock();

  const byId = new Map(items.map((i) => [i.membership.id, i]));
  const selected = endingSoonDeals(
    items.map((i) => i.membership),
    now
  );

  if (selected.length === 0) return null;

  return (
    <Section title="Ending soon" subtitle={ENDING_SOON_SUBTITLE} padded={false}>
      {/* Additive: these cards also remain in their own rails. The section
          simply does not render when nothing is genuinely ending, which is
          most of the time — an "Ending soon" rail that always has content is
          manufacturing urgency. */}
      <RailScroller>
        {selected.map((m) => {
          const item = byId.get(m.id);
          if (!item) return null;
          return <DealCard key={`ending-${m.id}`} {...item.card} />;
        })}
      </RailScroller>
    </Section>
  );
}
