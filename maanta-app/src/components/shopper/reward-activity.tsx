"use client";

import { Meta } from "@/components/ui/claude";
import { formatArrivalDuration } from "@/lib/fast-visit-window";
import { relativeAgo } from "@/lib/ui";
import { useShopperClock } from "@/lib/use-shopper-clock";

export type RewardActivityRow = {
  id: string;
  points: number;
  awardedAt: string;
  merchantName: string | null;
  claimedAt: string | null;
  arrivedAt: string | null;
};

/**
 * The `/you/rewards` activity list (D213 criterion 3 — "every time-derived
 * label").
 *
 * `relativeAgo(awarded_at)` was evaluated once during the server render, so a
 * reward earned moments before it said "just now" for as long as the page
 * stayed open. Nothing here is a money or claimability decision, which is
 * exactly why it was easy to miss — but the criterion says *every* time-derived
 * label, and a screen still saying "just now" hours later is the plainest
 * possible instance of a label that stopped being true.
 *
 * `formatArrivalDuration` is deliberately NOT clock-derived: it is the distance
 * between two persisted timestamps, a fact about the past that never changes.
 */
export function RewardActivity({ rows }: { rows: RewardActivityRow[] }) {
  const now = useShopperClock();
  return (
    <div className="space-y-3">
      {rows.map((e) => (
        <div
          key={e.id}
          className="flex items-start justify-between rounded-card bg-white px-4 py-3.5 shadow-card"
        >
          <div>
            <p className="text-sm font-semibold text-ink">Fast Visit reward</p>
            <p className="mt-0.5 text-xs text-secondary">
              {e.merchantName ?? "Shop"}
              {e.claimedAt && e.arrivedAt
                ? ` · Arrived in ${formatArrivalDuration(e.claimedAt, e.arrivedAt)}`
                : ""}
            </p>
            <Meta as="p" className="mt-0.5">
              {relativeAgo(e.awardedAt, now)}
            </Meta>
          </div>
          <span className="tnum shrink-0 text-sm font-bold text-ink">+{e.points}</span>
        </div>
      ))}
    </div>
  );
}
