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
  // NOTE the hydration behaviour, because it is easy to state wrongly: this
  // initializer runs INDEPENDENTLY on the server and in the browser, so the two
  // instants are close but not equal. If a render and its hydration straddle a
  // minute, expiry or grace boundary, the two passes produce different text.
  //
  // That is inherent to rendering a countdown at all — `CountdownChip` already
  // behaved this way — and it self-corrects on the first tick. What this change
  // does widen is the surface: a card's expiry label used to be a stable
  // server-rendered string. Elements whose text is time-derived therefore carry
  // `suppressHydrationWarning`, which is React's designated escape for exactly
  // this case, rather than the mismatch being left to warn.
  //
  // Making the two passes genuinely identical needs a server-supplied instant
  // threaded to every consumer as a prop. That is a real design and is NOT done
  // here.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
