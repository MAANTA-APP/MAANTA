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
 * is already in the browser. Inventory exhaustion (criterion 4) is handled by
 * the route-aware `InventoryRefresh` mounted beside this provider; that concern
 * needs fresh server data rather than another clock.
 */
export const SHOPPER_CLOCK_INTERVAL_MS = 30_000;

const ShopperClockContext = createContext<Date | null>(null);
const ShopperClockSeedContext = createContext<Date | null>(null);
/** The one clock on the page. Subtrees sample it faster; none creates another. */
const ShopperClockReaderContext = createContext<ShopperClockReader | null>(null);

/**
 * Drives the shared instant forward, in SERVER time.
 *
 * Deadlines are evaluated by the database in server time, and the clock now
 * decides claimability, Active/Past membership and discovery membership — so a
 * device whose clock is wrong would not merely mislabel a countdown. It would
 * withdraw a claim the database would still accept, or keep advertising a deal
 * the database has already expired. The seed is therefore the authority and the
 * device clock is never read as an absolute time.
 *
 * **Elapsed** time is a separate question from absolute time, and neither
 * available source is trustworthy alone:
 *
 * - `performance.now()` is monotonic, so it is immune to the user changing
 *   their clock and to NTP steps — but on several platforms it PAUSES while the
 *   device is suspended. A locked phone is the normal case at a mall, so
 *   trusting it alone leaves the clock hours behind after a shopper reopens the
 *   tab: expired deals still offered, and a claimed-code countdown still
 *   showing time left after `verify_redemption` would reject it.
 * - `Date.now()` deltas keep running through suspend, but jump on a clock step.
 *
 * So elapsed time is the **greater** of the two, kept as a high-water mark
 * across ticks, which encodes the property that actually matters: *the clock
 * may never run slower than real time, and may never run backwards.* A suspend
 * or a forward step is taken from the wall clock; a backward step is absorbed
 * by the monotonic reading; and a forward step that is later CORRECTED cannot
 * rewind, because the mark it already reached is kept. This deliberately reverses an earlier
 * version of this function that used the monotonic reading alone — that choice
 * treated a rare, small NTP step as more important than a guaranteed, hours-long
 * suspend, which is backwards for a phone in a shopping mall.
 *
 * A resume also ticks immediately rather than waiting up to a full interval,
 * because the whole point is the state a shopper sees the moment they reopen
 * the tab.
 *
 * **Known residual, accepted deliberately:** the seed is already as old as the
 * response's render, transport and hydration by the time this starts, and that
 * lag is preserved rather than corrected. It cannot be measured from a single
 * timestamp — separating skew from latency needs a round trip, which is a
 * network call and belongs with server-data refresh, not this clock. It is bounded by page
 * load time and leaves the clock slightly BEHIND server truth, which fails
 * towards offering a claim the database then refuses rather than silently
 * hiding one it would have accepted.
 *
 * Split out of the provider's effect so the advancing behaviour is directly
 * testable: a seeded clock that never moves is uniformly stale — every element
 * agrees with every other and all of them are wrong — which no render
 * comparison can detect, because both passes produce the same wrong output.
 *
 * It TICKS a clock; it does not own one. The origin lives in the reader it is
 * given, so several cadences can drive the same clock.
 *
 * Returns its own teardown.
 */
export type ShopperClockReader = () => Date;

/**
 * The clock ITSELF: one origin, one high-water mark, readable at any moment.
 *
 * Separating this from the ticking is the whole point. A subtree that needs a
 * faster cadence must sample the SAME clock more often, never start a second
 * one — two origins drift apart the instant they are created at different
 * times, and a child created between the parent's ticks silently inherits
 * whatever staleness the parent's last tick had. There is one origin per page
 * and every cadence reads it.
 */
export function makeShopperClockReader(seed: Date): ShopperClockReader {
  const base = seed.getTime();
  const monotonicStart = performance.now();
  const wallStart = Date.now();
  // The high-water mark, not just the greater of the two CURRENT deltas.
  // Taking the max per tick is not monotone across ticks: a wall clock that
  // jumps an hour forward and is then corrected would emit base+1h and then
  // fall back to the monotonic delta, rewinding almost the whole hour and
  // resurrecting every deal and ticket that expired in it. Elapsed time may
  // only ever increase. It lives HERE, not per timer, so a faster subtree and
  // the screen around it can never hold different marks.
  let elapsedHighWater = 0;

  return () => {
    const elapsed = Math.max(
      performance.now() - monotonicStart,
      Date.now() - wallStart,
      0
    );
    if (elapsed > elapsedHighWater) elapsedHighWater = elapsed;
    return new Date(base + elapsedHighWater);
  };
}

export function startShopperClock(
  intervalMs: number,
  onTick: (now: Date) => void,
  read: ShopperClockReader
): () => void {
  const tick = () => onTick(read());

  // Immediate, so the clock is demonstrably live from the first effect rather
  // than one interval later. It runs after the hydration commit, so the tree
  // React reconciled against the server HTML is still the seeded one.
  tick();
  const timer = setInterval(tick, intervalMs);

  // A backgrounded tab's interval is throttled and a suspended device's is
  // stopped, so the first thing a returning shopper would otherwise see is the
  // state from before they locked their phone.
  const hasDom = typeof document !== "undefined" && typeof window !== "undefined";
  if (hasDom) {
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
  }

  return () => {
    clearInterval(timer);
    if (hasDom) {
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    }
  };
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
 * HTML is still the seeded one — and it advances in SERVER time, never reading
 * the device's clock as an absolute. See `startShopperClock` for how elapsed
 * time is measured and why neither available source is trusted alone.
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
  // One origin for the whole page, created once. `FastShopperClock` samples
  // THIS, rather than starting a clock of its own.
  const [read] = useState(() => makeShopperClockReader(seed));
  const [now, setNow] = useState(seed);

  useEffect(() => startShopperClock(intervalMs, setNow, read), [intervalMs, read]);

  return (
    <ShopperClockReaderContext.Provider value={read}>
      <ShopperClockSeedContext.Provider value={seed}>
        <ShopperClockContext.Provider value={now}>{children}</ShopperClockContext.Provider>
      </ShopperClockSeedContext.Provider>
    </ShopperClockReaderContext.Provider>
  );
}

/**
 * A faster cadence for one subtree, on the SAME clock.
 *
 * The ticket screen needs 1s, not 30s: its countdown is deliberately fast, so a
 * screenshot of a code is visibly stale. Running the credential at 1s and the
 * screen around it at 30s left up to ~29 seconds where the code read "this code
 * has expired" beside a CLAIMED chip and a live watcher. Two correct clocks at
 * different cadences are still two clocks.
 *
 * So this does NOT create a clock. It reads the page's one origin — same base,
 * same elapsed high-water mark — and merely samples it every second. That is
 * the difference between a cadence and a clock, and getting it wrong produced
 * two separate defects: seeding from the layout's immutable seed rewound a
 * late mount by however long the shopper had been in the app, and then sampling
 * the parent's last TICK lost up to a full parent interval permanently, because
 * a sampled value used as an origin can only ever be as fresh as that sample.
 *
 * The initial value is the parent's instant so the first render is unchanged —
 * during SSR and hydration the parent has not ticked, so that IS the seed and
 * the structural guarantee holds; on a later mount the parent has ticked, and
 * reading the clock directly avoids one frame of stale credential.
 */
export function FastShopperClock({
  intervalMs = 1000,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const read = useShopperClockReader();
  const seed = useShopperClockSeed();
  const parentNow = useShopperClock();
  const [now, setNow] = useState(() =>
    parentNow.getTime() === seed.getTime() ? seed : read()
  );

  useEffect(() => startShopperClock(intervalMs, setNow, read), [intervalMs, read]);

  return (
    <ShopperClockSeedContext.Provider value={seed}>
      <ShopperClockContext.Provider value={now}>{children}</ShopperClockContext.Provider>
    </ShopperClockSeedContext.Provider>
  );
}

/** The page's one clock, readable at any instant. */
export function useShopperClockReader(): ShopperClockReader {
  const read = useContext(ShopperClockReaderContext);
  if (!read) {
    throw new Error(
      "useShopperClockReader requires <ShopperClockProvider> (D213)."
    );
  }
  return read;
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
