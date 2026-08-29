"use client";

import { absoluteTimeLabel } from "@/lib/claim-ticket-time";
import { useShopperClock } from "@/lib/use-shopper-clock";

/**
 * An absolute Nairobi time whose DAY WORD is relative (D213 criterion 3).
 *
 * "19:40 today" is two claims, and only one of them is fixed. A ticket screen
 * open across Nairobi midnight kept saying "today" about yesterday, and
 * "tomorrow" about today — on the line telling a shopper when their code dies.
 * The time never moves; the word does, so it reads from the shared clock.
 */
export function LiveTimeLabel({ iso }: { iso: string }) {
  const now = useShopperClock();
  return <>{absoluteTimeLabel(iso, now)}</>;
}
