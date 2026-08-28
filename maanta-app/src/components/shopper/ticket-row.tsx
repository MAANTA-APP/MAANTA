"use client";

import Link from "next/link";
import { ClaimChip, CountdownChip } from "@/components/ui/chips";
import { fastVisitChipState, fastVisitChipLabel } from "@/lib/fast-visit-chip";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * A `/my-deals` row. The whole row is a client component because its STATE is
 * time-derived (D213 criteria 1 and 3).
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
export function TicketRow({
  featureEnabled,
  claimedAt,
  arrivedAt,
  qualifiedAt,
  windowMinutes,
  ticketStatus,
  ticketExpiresAt,
  countdownExpiresAt,
  href,
  merchantName,
  dealTitle,
  code,
}: {
  featureEnabled: boolean;
  claimedAt: string | null;
  arrivedAt: string | null;
  qualifiedAt: string | null;
  windowMinutes: number;
  ticketStatus: string;
  ticketExpiresAt: string;
  countdownExpiresAt: string | null;
  href: string;
  merchantName: string | null;
  dealTitle: string | null;
  code: string;
}) {
  const now = useShopperClock();

  // D213 criterion 3 — "active" is a TIME-derived state, so it decays with the
  // countdown beside it. Leaving it on a server-computed boolean while the
  // countdown ticked is what made an expired row read "ACTIVE" next to
  // "Expired": accurate in one element, contradicted by the other. Both now
  // read the same instant.
  const isActive = ticketStatus === "pending" && new Date(ticketExpiresAt) > now;
  const claimState = isActive
    ? "active"
    : ticketStatus === "success"
      ? "redeemed"
      : "expired";

  const fastVisitLabel = fastVisitChipLabel(
    fastVisitChipState({
      featureEnabled,
      status: ticketStatus,
      claimedAt,
      arrivedAt,
      qualifiedAt,
      windowMinutes,
      now,
    })
  );

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card bg-white px-4 py-4 shadow-card hover:bg-stone-soft/60"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{merchantName}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{dealTitle}</p>
        <p className="tnum mt-1 text-xs text-secondary">
          <span className="font-code tracking-[0.06em]">{code}</span>
        </p>
        {fastVisitLabel ? (
          <span className="mt-1.5 inline-flex items-center rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-secondary">
            {fastVisitLabel}
          </span>
        ) : null}
        {isActive ? (
          <CountdownChip expiresAt={countdownExpiresAt} className="mt-1.5" now={now} />
        ) : null}
      </div>
      <ClaimChip state={claimState} className="flex-none" />
    </Link>
  );
}
