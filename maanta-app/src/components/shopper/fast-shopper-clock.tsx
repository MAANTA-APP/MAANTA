"use client";

import type { ReactNode } from "react";
import {
  ShopperClockProvider,
  useShopperClockSeed,
} from "@/lib/use-shopper-clock";

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
 * rather than seeding afresh, so the server-seeded instant — and with it the
 * SSR/first-client structural guarantee — is inherited unchanged; only the tick
 * rate differs. Consumers keep calling `useShopperClock()` and get the nearest
 * provider, which means a component moved between subtrees cannot silently keep
 * the wrong cadence.
 */
export function FastShopperClock({
  intervalMs = 1000,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const seed = useShopperClockSeed();
  return (
    <ShopperClockProvider serverNow={seed.toISOString()} intervalMs={intervalMs}>
      {children}
    </ShopperClockProvider>
  );
}
