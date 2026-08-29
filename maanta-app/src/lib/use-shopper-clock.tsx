"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The one tick every shopper-facing time-derived element runs on (D213).
 *
 * 30s, matching what `CountdownChip` already used — chosen so the visible
 * countdown and everything beside it move together rather than on independent
 * timers. Criterion 3 requires that no two rendered elements contradict one
 * another; the cheapest way to guarantee that is for them to read the SAME
 * `Date`, not two `new Date()` calls that can straddle a boundary.
 *
 * It deliberately fetches nothing. Criteria 1-3 are clock-derived: every input
 * is already in the browser. Inventory exhaustion (criterion 4) needs fresh
 * server data and is separate work.
 */
export const SHOPPER_CLOCK_INTERVAL_MS = 30_000;

const ShopperClockContext = createContext<Date | null>(null);
const ShopperClockSeedContext = createContext<Date | null>(null);

/**
 * Drives the shared instant forward. Split out of the provider's effect so the
 * advancing behaviour is directly testable: a seeded clock that never moves is
 * uniformly stale — every element agrees with every other and all of them are
 * wrong — which no render comparison can detect, because both render passes
 * produce the same wrong output.
 *
 * Returns its own teardown. The first tick is immediate rather than one
 * interval away: this runs from an effect, so hydration has already committed,
 * and the seed is by then as old as the response took to reach the browser.
 */
export function startShopperClock(
  intervalMs: number,
  onTick: (now: Date) => void
): () => void {
  onTick(new Date());
  const timer = setInterval(() => onTick(new Date()), intervalMs);
  return () => clearInterval(timer);
}

/**
 * Seeds the clock from ONE server-generated instant, mounted at the shopper
 * layout boundary.
 *
 * Why the seed rather than `new Date()` in each consumer: an initializer that
 * runs independently on the server and in the browser produces two different
 * instants, so a render and its hydration can straddle an expiry, grace or
 * minute boundary. When the only difference was a countdown's TEXT that was
 * tolerable and `suppressHydrationWarning` covered it. It is not tolerable now:
 * this PR made three subtrees clock-CONDITIONAL — `ClaimGate` swaps the claim
 * flow for the ended CTA, `TicketRow` drops its countdown, `EndingSoonRail`
 * adds or removes an entire section — and React cannot patch a structural
 * mismatch. It discards the server tree and re-renders the branch, which on a
 * money surface means the claim flow can be torn down and rebuilt under a
 * shopper's finger. `suppressHydrationWarning` does not cover structure; it
 * only hides the warning about it.
 *
 * With one serialised instant, the server render and the FIRST client render
 * are identical by construction, whatever the browser's own clock says.
 *
 * It then advances only after hydration, from this one timer — effects run
 * after the hydration commit, so the tree React reconciles against the server
 * HTML is still the seeded one.
 */
export function ShopperClockProvider({
  serverNow,
  intervalMs = SHOPPER_CLOCK_INTERVAL_MS,
  children,
}: {
  serverNow: string;
  intervalMs?: number;
  children: ReactNode;
}) {
  // Keyed on the string so the identity is stable across re-renders; a fresh
  // `Date` object each render would restart the effect below.
  const seed = useMemo(() => new Date(serverNow), [serverNow]);
  const [now, setNow] = useState(seed);

  useEffect(() => startShopperClock(intervalMs, setNow), [intervalMs, seed]);

  return (
    <ShopperClockSeedContext.Provider value={seed}>
      <ShopperClockContext.Provider value={now}>{children}</ShopperClockContext.Provider>
    </ShopperClockSeedContext.Provider>
  );
}

/**
 * The shared instant. Throws without a provider rather than silently falling
 * back to an unseeded clock, because a shopper surface mounted outside the
 * provider is exactly the regression this design exists to prevent, and a
 * silent fallback would reintroduce it invisibly.
 */
export function useShopperClock(): Date {
  const now = useContext(ShopperClockContext);
  if (!now) {
    throw new Error(
      "useShopperClock requires <ShopperClockProvider>. Time-derived shopper UI " +
        "must read the server-seeded instant so the first client render matches " +
        "the server render (D213)."
    );
  }
  return now;
}

/**
 * The seed itself — the server instant, which never advances.
 *
 * For the few time-derived elements that legitimately need a FASTER tick than
 * the shared 30s clock: the ticket's claim countdown and Fast Visit window both
 * run at 1s, deliberately, because a counter countdown that visibly moves is
 * what makes a screenshot of a code obviously stale. Those keep their own
 * interval but must still start from the SAME instant the server rendered from,
 * or they reintroduce exactly the structural mismatch the provider exists to
 * remove. Seed initial state from this; tick from your own timer afterwards.
 */
export function useShopperClockSeed(): Date {
  const seed = useContext(ShopperClockSeedContext);
  if (!seed) {
    throw new Error(
      "useShopperClockSeed requires <ShopperClockProvider>. A time-derived " +
        "shopper element must start from the server-rendered instant (D213)."
    );
  }
  return seed;
}

/** The shared instant if one is mounted, otherwise `null`. */
export function useOptionalShopperClock(): Date | null {
  return useContext(ShopperClockContext);
}

/**
 * The pre-D213 behaviour, kept ONLY for time-derived elements rendered outside
 * a provider — today the merchant deal page's countdown. There is no server
 * instant to seed from there, so the first client render can differ from the
 * server's and the caller must suppress the warning on the text it renders.
 *
 * Do not reach for this on a shopper surface: mount the provider instead.
 */
export function useUnseededClock(intervalMs: number = SHOPPER_CLOCK_INTERVAL_MS): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
