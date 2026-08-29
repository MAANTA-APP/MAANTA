"use client";

import type { ReactNode } from "react";
import { isUnexpiredAt } from "@/lib/live-deals";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * Swaps a whole subtree at a deadline, on the shared clock (D213 criterion 3).
 *
 * `ClaimGate` is the discovery-side version of this and withdraws only an
 * OFFER. This one exists for the cases where crossing the deadline changes what
 * screen a shopper is looking at — the ticket, above all: its status chip, its
 * live watcher and its "still valid until" line were all decided during the
 * server render while the code beneath them ticked to "this code has expired".
 * A credential screen contradicting itself at a counter is the worst instance
 * of this defect class in the product.
 *
 * Strict `expires_at > now`, matching the server-side rule it replaces. The
 * caller supplies both branches, so nothing about which screen is correct is
 * decided here — only when to switch.
 */
export function ExpiryGate({
  expiresAt,
  children,
  expired,
}: {
  expiresAt: string | null;
  children: ReactNode;
  expired: ReactNode;
}) {
  const now = useShopperClock();
  return <>{isUnexpiredAt(expiresAt, now) ? children : expired}</>;
}
