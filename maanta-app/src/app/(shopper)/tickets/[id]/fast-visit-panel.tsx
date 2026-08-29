"use client";

import { IconCheck } from "@/components/ui/icons";
import {
  fastVisitDeadline,
  formatArrivalDuration,
  formatRewardCountdown,
} from "@/lib/fast-visit-window";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * The Fast Visit reward window on the claimed ticket — deliberately SECONDARY
 * to everything the counter depends on:
 *
 * - Visually quieter and smaller than the claim code and the claim-validity
 *   countdown. This timer is an incentive, not a credential.
 * - It counts a REWARD window, and the copy never lets it read as expiry:
 *   when it reaches zero the claim continues unchanged, so the zero state
 *   says "Reward window ended" and nothing that sounds like the code died.
 * - A late arrival renders NOTHING — a shopper who missed the window gets the
 *   normal claim experience, not a failure message.
 * - Presentation only: qualification was decided by the database AT ARRIVAL
 *   (`record_shopper_arrival`, persisted as `fast_visit_qualified_at`) and
 *   points by `award_fast_visit_points` after staff verify; a device clock
 *   can change this display, never the award. `qualifiedAt` is that
 *   persisted verdict — this panel never re-derives it from timestamps,
 *   which cannot know whether the feature was on when the shopper arrived.
 */
export function FastVisitPanel({
  claimedAt,
  arrivedAt,
  qualifiedAt,
}: {
  claimedAt: string | null;
  arrivedAt: string | null;
  /** redemptions.fast_visit_qualified_at — the immutable arrival-time verdict. */
  qualifiedAt: string | null;
}) {
  const deadline = fastVisitDeadline(claimedAt);
  // D213 — the ticket subtree's single 1s instant (FastShopperClock). The
  // cadence is deliberate and unchanged; what changed is that the whole screen
  // now shares it, so this window and the credential beside it cannot disagree.
  const now = useShopperClock().getTime();

  // Historical claim with no recorded claim time: no window ever existed.
  if (!deadline || !claimedAt) return null;

  // Arrived. Qualified (per the persisted arrival-time verdict): confirm it.
  // Not qualified — late, or the feature was off when they walked in: normal
  // claim experience, nothing to say, nothing that could read as failure.
  if (arrivedAt) {
    if (!qualifiedAt) return null;
    return (
      <div className="w-full rounded-card bg-white px-4 py-3.5 shadow-card">
        <div className="flex items-center justify-center gap-1.5">
          <IconCheck className="h-4 w-4 text-ink" />
          <span className="text-sm font-bold text-ink">You made it</span>
        </div>
        <p className="tnum mt-1 text-center text-xs text-secondary">
          Arrived in {formatArrivalDuration(claimedAt, arrivedAt)} — Fast Visit
          reward eligible
        </p>
        <p className="mt-1 text-center text-xs text-muted">
          Points pending — complete your purchase and have staff verify your
          claim.
        </p>
      </div>
    );
  }

  const left = deadline.getTime() - now;

  // Window over, never arrived: one calm line, then the claim carries on.
  // Never "expired", never "too late" — the claim itself is untouched.
  if (left <= 0) {
    return (
      <p className="w-full text-center text-xs text-muted">
        Reward window ended — your claim is still valid.
      </p>
    );
  }

  return (
    <div className="w-full rounded-card bg-white px-4 py-3.5 text-center shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Fast Visit reward
      </div>
      {/* Subordinate to the claim countdown, deliberately.
          Both timers were `font-code font-semibold text-ink`, one size step
          apart (text-xl vs text-lg) — near-identical at a glance, on a screen
          where confusing them means mistaking an optional reward window for
          the deadline on your code. The claim countdown stays primary; this
          one steps down in weight and colour so the hierarchy carries the
          distinction the words already make. */}
      <div className="font-code mt-1 text-base font-medium text-secondary" aria-live="off">
        {formatRewardCountdown(left)}
      </div>
      <p className="mt-1 text-xs text-muted">
        Scan the MAANTA QR at the shop within the time to earn points. Your
        claim stays valid either way.
      </p>
    </div>
  );
}
