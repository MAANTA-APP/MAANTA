"use client";

import { useEffect, useState } from "react";
import { formatCode } from "@/lib/ui";
import { formatClaimCountdown } from "@/lib/claim-ticket-time";
import {
  useShopperClockSeed,
  startShopperClock,
} from "@/lib/use-shopper-clock";

/**
 * S5 — the claimed-code hero. The single most important screen in the product:
 * it *is* the credential a dispute is argued from, so it has ZERO amber actions.
 *
 * - The code lives inside a white card whose border breathes amber (R3); the
 *   code is never on an amber fill.
 * - The countdown ticks live every second — a frozen timer means a screenshot,
 *   which is the anti-screenshot device the counter copy relies on. That is why
 *   `formatClaimCountdown` keeps visible seconds in every band: a day-long
 *   window reads "1d 0h 9m 12s", never the raw-minute "1449:12" that shipped
 *   before it (D167 item 3), and never a per-minute string that would make the
 *   counter copy a lie.
 * - Slashed-zero, tabular mono so a cashier never misreads it.
 */

export function ClaimedCode({
  code,
  expiresAt,
}: {
  code: string;
  expiresAt: string;
}) {
  // D213 — seeded from the server instant so the first client render shows
  // the same number the server did. The 1s tick is deliberate and kept (a
  // visibly moving countdown is what makes a screenshotted code obviously
  // stale); it starts after hydration.
  const seed = useShopperClockSeed();
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - seed.getTime());
  useEffect(() => {
    // Server time, advanced monotonically. `msUntil` reads the device clock,
    // and this is the countdown a shopper trusts at the counter: a skewed
    // phone must not tell them their code died while the database still
    // accepts it.
    const until = new Date(expiresAt).getTime();
    return startShopperClock(1000, (d) => setLeft(until - d.getTime()), seed);
  }, [expiresAt, seed]);

  const expired = left <= 0;

  return (
    <div
      className="w-full animate-r3 rounded-2xl border-[2.5px] border-brand bg-white px-5 py-6"
      role="group"
      aria-label="Redemption code"
    >
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        For the shop
      </div>
      <div className="font-code mt-2 text-center text-[30px] font-medium tracking-[0.14em] text-ink">
        {formatCode(code)}
      </div>
      <div className="mt-3 flex flex-col items-center gap-0.5">
        <div className="font-code text-xl font-semibold text-ink" aria-live="off">
          {expired ? "0:00" : formatClaimCountdown(left)}
        </div>
        <div className="text-xs text-muted">
          {expired ? "this code has expired" : "until this code expires"}
        </div>
      </div>
    </div>
  );
}
