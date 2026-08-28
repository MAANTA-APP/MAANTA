"use client";

import { CountdownChip } from "@/components/ui/chips";
import { fastVisitChipState, fastVisitChipLabel } from "@/lib/fast-visit-chip";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * The time-derived chips on a `/my-deals` row (D213 criteria 1 and 3).
 *
 * Both were previously computed on the server: `fastVisitChipState` ran once
 * with `now` defaulting to render time, so a row kept asserting "Fast Visit
 * open" after `claimed_at + 15 minutes` had passed on a page left open, and
 * the countdown beside it ticked independently.
 *
 * They now share one clock, so the reward window and the code countdown are
 * both accurate and cannot disagree. Nothing is fetched: every input here is
 * persisted state already sent with the page, and the only thing that changes
 * is the time. Reward *eligibility* still comes from the server verdict
 * (`qualifiedAt`) and is never re-derived on the client — the clock decides
 * only whether an open window has closed.
 */
export function TicketRowChips({
  featureEnabled,
  status,
  claimedAt,
  arrivedAt,
  qualifiedAt,
  windowMinutes,
  countdownExpiresAt,
  showCountdown,
}: {
  featureEnabled: boolean;
  status: string;
  claimedAt: string | null;
  arrivedAt: string | null;
  qualifiedAt: string | null;
  windowMinutes: number;
  countdownExpiresAt: string | null;
  showCountdown: boolean;
}) {
  const now = useShopperClock();

  const fastVisitLabel = fastVisitChipLabel(
    fastVisitChipState({
      featureEnabled,
      status,
      claimedAt,
      arrivedAt,
      qualifiedAt,
      windowMinutes,
      now,
    })
  );

  return (
    <>
      {fastVisitLabel ? (
        <span className="mt-1.5 inline-flex items-center rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-secondary">
          {fastVisitLabel}
        </span>
      ) : null}
      {showCountdown ? (
        <CountdownChip expiresAt={countdownExpiresAt} className="mt-1.5" now={now} />
      ) : null}
    </>
  );
}
