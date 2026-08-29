"use client";

import { useState, type ReactNode } from "react";
import { ShopperClockProvider, useShopperClock } from "@/lib/use-shopper-clock";

/**
 * A faster shared clock for one subtree, on the SAME server seed (D213).
 *
 * The ticket screen needs 1s, not 30s: its countdown is deliberately fast, so a
 * screenshot of a code is visibly stale. Running the credential at 1s and the
 * screen around it at 30s produced up to ~29 seconds where the code read "this
 * code has expired" beside a CLAIMED chip and a live watcher — the exact
 * counter-facing contradiction the gate was added to remove. Two correct clocks
 * at different cadences are still two clocks.
 *
 * So the whole subtree runs on ONE instant at the faster cadence. It re-provides
 * rather than seeding afresh, so the SSR/first-client structural guarantee is
 * inherited; only the tick rate differs. Consumers keep calling
 * `useShopperClock()` and get the nearest provider, which means a component
 * moved between subtrees cannot silently keep the wrong cadence.
 *
 * **It seeds from the parent's CURRENT instant, not the parent's seed.** The
 * seed is the moment the `(shopper)` layout first mounted and never advances,
 * and that layout persists across soft navigation — so a shopper who has been
 * in the app twenty minutes and then opens a ticket would have seeded this
 * clock twenty minutes in the past, and a freshly claimed 15-minute credential
 * would have read as live long after the database had expired it. The parent's
 * current instant is the seed only at first render, which is exactly the
 * hydration case; after that it is the truth this subtree must start from.
 *
 * Captured ONCE, deliberately: re-seeding on every parent tick would restart
 * the child's timer and reset its elapsed high-water mark thirty times a
 * minute.
 */
export function FastShopperClock({
  intervalMs = 1000,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const parentNow = useShopperClock();
  const [seed] = useState(() => parentNow);
  return (
    <ShopperClockProvider serverNow={seed.toISOString()} intervalMs={intervalMs}>
      {children}
    </ShopperClockProvider>
  );
}
