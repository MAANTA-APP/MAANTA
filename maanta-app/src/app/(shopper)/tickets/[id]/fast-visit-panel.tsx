"use client";

import { useEffect, useState } from "react";
import { IconCheck } from "@/components/ui/icons";
import {
  fastVisitDeadline,
  formatArrivalDuration,
  formatRewardCountdown,
  isFastVisitEligible,
} from "@/lib/fast-visit-window";

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
 * - Presentation only: eligibility and points are decided by the database
 *   from server-stamped timestamps (`award_fast_visit_points`); a device
 *   clock can change this display, never the award.
 */
export function FastVisitPanel({
  claimedAt,
  arrivedAt,
}: {
  claimedAt: string | null;
  arrivedAt: string | null;
}) {
  const deadline = fastVisitDeadline(claimedAt);
  const [now, setNow] = useState(() => Date.now());
  const windowOpen =
    deadline !== null && arrivedAt === null && deadline.getTime() - now > 0;

  useEffect(() => {
    if (!windowOpen) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [windowOpen]);

  // Historical claim with no recorded claim time: no window ever existed.
  if (!deadline || !claimedAt) return null;

  // Arrived. Within the window: confirm it. Late: normal claim experience —
  // nothing to say, and nothing that could read as failure.
  if (arrivedAt) {
    if (!isFastVisitEligible(claimedAt, arrivedAt)) return null;
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
      <div className="font-code mt-1 text-lg font-semibold text-ink" aria-live="off">
        {formatRewardCountdown(left)}
      </div>
      <p className="mt-1 text-xs text-muted">
        Scan the MAANTA QR at the shop within the time to earn points. Your
        claim stays valid either way.
      </p>
    </div>
  );
}
