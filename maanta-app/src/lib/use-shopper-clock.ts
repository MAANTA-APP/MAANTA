"use client";

import { useEffect, useState } from "react";

/**
 * The one tick every shopper-facing time-derived element runs on (D213).
 *
 * 30s, matching what `CountdownChip` already used — chosen so the visible
 * countdown and everything beside it move together rather than on independent
 * timers. Criterion 3 requires that no two rendered elements contradict one
 * another; the cheapest way to guarantee that is for them to read the SAME
 * `Date`, not two `new Date()` calls that can straddle a boundary. So this
 * returns the instant, and callers thread it into the pure helpers
 * (`dealExpiryLabel`, `endingSoonDeals`, `fastVisitChipState`) that already
 * take an injectable `now`.
 *
 * It deliberately fetches nothing. Criteria 1-3 are clock-derived: every input
 * is already in the browser. Inventory exhaustion (criterion 4) needs fresh
 * server data and is separate work.
 */
export const SHOPPER_CLOCK_INTERVAL_MS = 30_000;

export function useShopperClock(intervalMs: number = SHOPPER_CLOCK_INTERVAL_MS): Date {
  // Seeded at first render so the initial client paint matches what the server
  // just rendered; the interval then advances it.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
