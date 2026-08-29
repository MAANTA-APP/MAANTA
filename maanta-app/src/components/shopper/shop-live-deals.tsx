"use client";

import Link from "next/link";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip } from "@/components/ui/chips";
import { IconChevronRight } from "@/components/ui/icons";
import { isUnexpiredAt } from "@/lib/live-deals";
import { useShopperClock } from "@/lib/use-shopper-clock";

export type ShopDealRow = {
  id: string;
  title: string;
  image_url: string | null;
  expires_at: string | null;
};

/**
 * The `shops/[id]` "Live deals" list, decided on the shared clock (D213
 * criterion 3).
 *
 * This is the sharpest instance of the class in the app: the query filters
 * `expires_at > now` and the heading says, literally, "Live deals". A deal
 * expiring while the page sat open left an "Expired" chip directly under that
 * word — the heading and the row asserting opposite things about the same deal.
 *
 * The row and its chip now read one instant, and a row that stops being live
 * leaves the list rather than contradicting its own heading. The "No live deals
 * right now" line is decided here too, so an emptied list says so instead of
 * rendering a heading over nothing.
 */
export function ShopLiveDeals({ deals }: { deals: ShopDealRow[] }) {
  const now = useShopperClock();
  const live = deals.filter((d) => isUnexpiredAt(d.expires_at, now));

  if (live.length === 0) {
    return <p className="text-sm text-muted">No live deals right now.</p>;
  }

  return (
    <>
      {live.map((d) => (
        <Link
          key={d.id}
          href={`/deals/${d.id}`}
          className="flex items-center gap-3 rounded-card bg-white shadow-card p-3 hover:bg-cream/50"
        >
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream">
            <CoverImage src={d.image_url} alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{d.title}</p>
            <CountdownChip expiresAt={d.expires_at} className="mt-1" now={now} />
          </div>
          <IconChevronRight className="h-4 w-4 text-faint" />
        </Link>
      ))}
    </>
  );
}
