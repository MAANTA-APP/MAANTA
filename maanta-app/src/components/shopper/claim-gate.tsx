"use client";

import type { ReactNode } from "react";
import { isDealClaimable } from "@/lib/deal-expiry";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * Claimability on `/deals/[id]`, kept honest as the clock moves (D213
 * criterion 3, which names claimability explicitly).
 *
 * The page decides claimability once during its server render and mounts the
 * claim flow from that value, while the countdown beside it ticks. A shopper
 * who left an initially claimable deal open past `expires_at` therefore saw
 * "Expired" on the chip and a live "Claim deal" button underneath — and
 * `claim_deal` would reject the tap with `deal_expired`.
 *
 * Only the TIME half is re-evaluated here. Every other precondition — an
 * existing ticket, `is_active`, `is_paused`, the claim cap — is data the client
 * cannot re-derive, and reflecting changes in those while the page is open is
 * criterion 4. So the server still decides whether this deal is claimable at
 * all; this only withdraws the offer once the deadline passes.
 */
export function ClaimGate({
  expiresAt,
  children,
  expired,
}: {
  expiresAt: string | null;
  children: ReactNode;
  expired: ReactNode;
}) {
  const now = useShopperClock();
  return <>{isDealClaimable(expiresAt, now) ? children : expired}</>;
}
