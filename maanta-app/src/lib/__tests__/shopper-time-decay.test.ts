import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { stripComments } from "./helpers/comment-stripping";
import { renderShopperTree } from "./helpers/shopper-clock";
import {
  startShopperClock,
  SHOPPER_CLOCK_INTERVAL_MS,
} from "@/lib/use-shopper-clock";
import { endingSoonDeals, ENDING_SOON_SUBTITLE } from "@/lib/ending-soon";
import { fastVisitChipState, fastVisitChipLabel } from "@/lib/fast-visit-chip";
import { dealExpiryLabel, isDealClaimable } from "@/lib/deal-expiry";
import { isNearExpiry } from "@/lib/ui";
import { DealCard } from "@/components/ui/claude";
import { CountdownChip } from "@/components/ui/chips";
import { ClaimGate } from "@/components/shopper/claim-gate";
import {
  LiveDealCollection,
  liveItemsAt,
  cardKey,
} from "@/components/shopper/live-deal-collection";
import { ShopLiveDeals } from "@/components/shopper/shop-live-deals";
import { NotificationList } from "@/components/shopper/notification-list";
import { QrCheckIn } from "@/app/(shopper)/qr/[token]/qr-check-in";
import { DealPriceDetail } from "@/app/(shopper)/deals/[id]/deal-price-detail";
import { SearchResults } from "@/components/shopper/search-results";
import { FeedBody } from "@/components/shopper/feed-body";
import { isUnexpiredAt } from "@/lib/live-deals";
import { filterBrowseDeals } from "@/lib/browse";
import { ClaimedCode } from "@/app/(shopper)/tickets/[id]/claimed-code";
import { FastVisitPanel } from "@/app/(shopper)/tickets/[id]/fast-visit-panel";
import { EndingSoonRail } from "@/components/shopper/ending-soon-rail";
import {
  MyDealsList,
  selectMyDealsTickets,
  type MyDealsTicket,
} from "@/components/shopper/my-deals-list";

const read = (rel: string) =>
  stripComments(readFileSync(path.join(__dirname, "../../", rel), "utf8"));

/**
 * D213 criteria 1-3 — time-derived shopper state on an OPEN page.
 *
 * The class: `/feed` and `/my-deals` are `force-dynamic` server components, so
 * anything computed during their render froze there. A page left open kept
 * asserting "Fast Visit open" past the deadline, kept an expired deal under
 * "Ending soon", and showed a server-frozen expiry label beside a ticking chip.
 *
 * These tests exercise the pure decision functions with an advancing `now` —
 * which is exactly what the shared clock supplies at runtime — plus the wiring
 * that guarantees the same instant reaches every element of one card.
 *
 * Criterion 4 (inventory exhaustion) is NOT covered here: it needs fresh server
 * data, not a clock, and is separate work.
 */

const MIN = 60_000;
const T0 = new Date("2026-08-28T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();

/** A minimal `DealRow` for the browse/map filter, live until `expiresInMs`. */
const browseRow = (id: string, expiresInMs: number) => ({
  id,
  merchant_id: "m1",
  title: `Deal ${id}`,
  description: "",
  image_url: "",
  deal_type: "standard" as const,
  flash_duration_hours: 6,
  is_active: true,
  is_paused: false,
  max_claims: null,
  claims_count: 0,
  success_fee: 30,
  boost_active: false,
  price_kes: 500,
  compare_at_kes: 800,
  charges: null,
  node: "BBS Mall",
  starts_at: iso(-60 * MIN),
  expires_at: iso(expiresInMs),
  merchants: {
    id: "m1",
    merchant_name: "Nyama Spot",
    floor: "1",
    unit_number: "A",
    what3words_address: "a.b.c",
    lat: -1.274,
    lng: 36.85,
    mall_name: "BBS Mall",
    node: "BBS Mall",
  },
});

const deal = (
  id: string,
  expiresInMs: number,
  cap: { max_claims: number | null; claims_count: number } = {
    max_claims: null,
    claims_count: 0,
  }
) => ({ id, expires_at: iso(expiresInMs), ...cap });

describe("criterion 1 — the Fast Visit chip closes when its deadline passes", () => {
  const base = {
    featureEnabled: true,
    status: "pending",
    claimedAt: iso(0),
    arrivedAt: null,
    qualifiedAt: null,
    windowMinutes: 15,
  };

  it("is open inside the window and closed after it, from the clock alone", () => {
    // Same persisted row, same props — only `now` advances. Nothing is
    // refetched, which is the whole point: the inputs never changed.
    expect(fastVisitChipState({ ...base, now: at(5 * MIN) })).toBe("window-open");
    expect(fastVisitChipState({ ...base, now: at(16 * MIN) })).toBe("missed");
  });

  it("never says open past the deadline, at any later instant", () => {
    for (const m of [15, 16, 30, 120, 60 * 24]) {
      expect(fastVisitChipState({ ...base, now: at(m * MIN) })).not.toBe("window-open");
    }
  });

  it("the clock may close a window but may never mint eligibility (D191)", () => {
    // The persisted verdict is the only source of `qualified`. If the clock
    // could create it, a shopper who never arrived would earn a reward by
    // leaving a tab open.
    for (const m of [0, 5, 16, 600]) {
      expect(fastVisitChipState({ ...base, now: at(m * MIN) })).not.toBe("qualified");
    }
    expect(
      fastVisitChipState({ ...base, qualifiedAt: iso(3 * MIN), now: at(600 * MIN) })
    ).toBe("qualified");
  });

  it("the row's ACTIVE state decays with the countdown beside it", () => {
    // The regression this caught: making the countdown live while the status
    // chip stayed on a server-computed boolean produced an expired row reading
    // ACTIVE next to "Expired" — accurate in one element, contradicted by the
    // other, which is precisely what criterion 3 forbids.
    const row = read("components/shopper/ticket-row.tsx");
    expect(row).toContain("new Date(ticketExpiresAt) > now");
    expect(row).toContain("<ClaimChip state={claimState}");
    // The page must not compute row state itself and pass it down frozen.
    const myDeals = read("app/(shopper)/my-deals/page.tsx");
    expect(myDeals).not.toMatch(/const isActiveRow =/);
    expect(myDeals).not.toContain("<ClaimChip");
  });

  it("renders the closed copy, never wording that invalidates the ticket", () => {
    const label = fastVisitChipLabel(fastVisitChipState({ ...base, now: at(16 * MIN) }));
    expect(label).toMatch(/reward window closed/i);
    expect(label).not.toMatch(/expired|invalid|too late/i);
  });
});

describe("criterion 2 — expired deals leave the Ending soon collection", () => {
  it("drops a deal once its expiry passes, with no change of input", () => {
    const deals = [deal("soon", 10 * MIN)];
    expect(endingSoonDeals(deals, at(0)).map((d) => d.id)).toEqual(["soon"]);
    expect(endingSoonDeals(deals, at(11 * MIN))).toEqual([]);
  });

  it("admits a deal that crosses INTO the window while the page is open", () => {
    // Membership must reflect the current time in both directions, or a page
    // open for an hour shows a stale collection that merely shrinks.
    const deals = [deal("later", 90 * MIN)];
    expect(endingSoonDeals(deals, at(0))).toEqual([]);
    expect(endingSoonDeals(deals, at(45 * MIN)).map((d) => d.id)).toEqual(["later"]);
  });

  it("still applies the render-time claim cap (c52133e), which the clock does not touch", () => {
    const capped = [deal("full", 10 * MIN, { max_claims: 5, claims_count: 5 })];
    expect(endingSoonDeals(capped, at(0))).toEqual([]);
  });
});

describe("criterion 3 — time-derived elements are accurate AND mutually consistent", () => {
  it("the card's label and its chip read the same instant, by construction", () => {
    // The card owns one clock and threads it into the chip, so the two cannot
    // straddle a boundary and disagree. Asserted on the wiring because the
    // failure mode is two independent `new Date()` calls, which no rendered
    // output can distinguish from one.
    const card = read("components/ui/claude/deal-card.tsx");
    expect(card).toContain("const now = useShopperClock()");
    expect(card).toContain("dealExpiryLabel(expiresAt, now)");
    for (const chip of card.match(/<CountdownChip[^>]*>/g) ?? []) {
      expect(chip).toContain("now={now}");
    }
  });

  it("takes no server-computed expiry string, so none can go stale", () => {
    // The prop is gone rather than deprecated: a frozen string beside a
    // ticking chip is the defect, and an optional prop invites its return.
    const card = read("components/ui/claude/deal-card.tsx");
    expect(card).not.toMatch(/expiryLabel\??:\s*string/);
    for (const caller of [
      "app/(shopper)/feed/page.tsx",
      "components/browse/browse-client.tsx",
    ]) {
      expect(read(caller)).not.toContain("expiryLabel=");
      expect(read(caller)).not.toContain("expiryLabel:");
    }
  });

  it("the countdown chip renders from the shared instant, not one of its own", () => {
    // The chip is the most-rendered time-derived element on every shopper
    // surface, and a chip frozen on some other instant is stale in a way no
    // consistency check can see: it agrees with itself in both render passes.
    // So its TEXT is asserted against the instant it was given.
    const expiresAt = iso(30 * MIN);
    const el = () => createElement(CountdownChip, { expiresAt });
    expect(renderShopperTree(el(), at(0))).toMatch(/Expires in 30m/);
    expect(renderShopperTree(el(), at(35 * MIN))).toMatch(/Grace period/);
    expect(renderShopperTree(el(), at(50 * MIN))).toContain("Expired");
  });

  it("an explicit instant from a caller wins over the shared one", () => {
    // How a card guarantees its label and its chip cannot straddle a boundary:
    // it owns the instant and hands it in. That must actually take effect.
    const expiresAt = iso(30 * MIN);
    const html = renderShopperTree(
      createElement(CountdownChip, { expiresAt, now: at(50 * MIN) }),
      at(0)
    );
    expect(html).toContain("Expired");
    expect(html).not.toMatch(/Expires in/);
  });

  it("label, urgency and claimability all move together across the boundary", () => {
    // The accuracy half: every time-derived value must reflect `now`, not just
    // agree with its neighbour. A uniformly stale card satisfies consistency
    // and fails this.
    const expiresAt = iso(30 * MIN);
    const before = {
      label: dealExpiryLabel(expiresAt, at(0)),
      near: isNearExpiry(expiresAt, at(0)),
    };
    // Past expiry the deal enters the 15-minute grace (already-claimed codes
    // may still redeem), and only then reads Expired. Both transitions are
    // clock-driven, so both must move on an open page.
    const inGrace = {
      label: dealExpiryLabel(expiresAt, at(31 * MIN)),
      near: isNearExpiry(expiresAt, at(31 * MIN)),
    };
    const ended = dealExpiryLabel(expiresAt, at(50 * MIN));
    expect(before.label).toMatch(/Expires in/);
    expect(before.near).toBe(true);
    expect(inGrace.label).toMatch(/Grace period/);
    expect(inGrace.near).toBe(false);
    expect(ended).toBe("Expired");
  });

  it("a rendered card shows the derived label rather than a frozen one", () => {
    const html = renderShopperTree(
      createElement(DealCard, {
        href: "/deals/d1",
        imageUrl: null,
        merchantName: "Nyama Spot",
        title: "Platter",
        expiresAt: at(90 * MIN).toISOString(),
        variant: "vertical" as const,
        merchantId: "m1",
        showFavourite: false,
      }),
      T0
    );
    expect(html).toMatch(/Expires in 1h \d+m/);
  });
});

describe("criterion 3 — claimability decays with the deal, not just its label", () => {
  it("withdraws the claim offer once the deadline passes", () => {
    // The sharp case: an initially claimable deal left open past expires_at
    // showed "Expired" on the chip and a live "Claim deal" underneath, which
    // claim_deal rejects with deal_expired. Offering a claim the database will
    // refuse is the money-surface form of this whole defect class.
    const expiresAt = iso(20 * MIN);
    expect(isDealClaimable(expiresAt, at(0))).toBe(true);
    expect(isDealClaimable(expiresAt, at(21 * MIN))).toBe(false);
  });

  it("gates on the clock without re-deriving data-shaped preconditions", () => {
    // is_active, is_paused, the claim cap and an existing ticket are all data
    // the client cannot re-derive; reflecting THOSE while a page is open is
    // criterion 4. The gate must only withdraw on time.
    const gate = read("components/shopper/claim-gate.tsx");
    expect(gate).toContain("isDealClaimable(expiresAt, now)");
    for (const dataShaped of ["is_paused", "max_claims", "claims_count", "is_active"]) {
      expect(gate).not.toContain(dataShaped);
    }
  });

  it("the page still decides claimability from data before the gate sees it", () => {
    const page = read("app/(shopper)/deals/[id]/page.tsx");
    expect(page).toMatch(/const claimable =/);
    expect(page).toContain("<ClaimGate");
  });
});

describe("the clock fetches nothing — criteria 1-3 are clock-derived only", () => {
  it("introduces no polling, refetch or network call", () => {
    // Criterion 4 needs fresh data; these three do not, and must not smuggle
    // it in. A fetch here would also change the load profile of every open
    // shopper page.
    for (const rel of [
      "lib/use-shopper-clock.tsx",
      "components/shopper/ticket-row.tsx",
      "components/shopper/ending-soon-rail.tsx",
      "components/shopper/claim-gate.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/\bfetch\(|useSWR|refetch|router\.refresh|revalidate/);
    }
  });

  it("keeps one shared interval rather than a timer per element", () => {
    const clock = read("lib/use-shopper-clock.tsx");
    expect(clock).toContain("SHOPPER_CLOCK_INTERVAL_MS");
    expect(clock).toContain("clearInterval");
    // No component may start its own competing timer.
    for (const rel of [
      "components/shopper/ticket-row.tsx",
      "components/shopper/ending-soon-rail.tsx",
      "components/ui/claude/deal-card.tsx",
    ]) {
      expect(read(rel)).not.toContain("setInterval");
    }
  });
});

describe("criterion 3 — Active/Past membership is decided at the current time", () => {
  // The containment level above the row. Fixing the ROW made an expired ticket
  // flip its own chip to EXPIRED while the tab holding it still called it
  // active, and a Past tab opened before the boundary never admitted it. A
  // collection is a rendered element too, so criterion 3's "section membership"
  // covers it.
  const ticket = (over: Partial<MyDealsTicket> = {}): MyDealsTicket => ({
    id: "t1",
    href: "/tickets/t1",
    code: "123 456",
    status: "pending",
    expiresAt: iso(20 * MIN),
    redeemedAt: null,
    claimedAt: iso(0),
    arrivedAt: null,
    qualifiedAt: null,
    countdownExpiresAt: iso(20 * MIN),
    merchantName: "Nyama Spot",
    dealTitle: "Platter",
    ...over,
  });

  it("moves a ticket out of Active and into Past when it expires", () => {
    // Same row, never refetched. Only `now` advanced.
    const rows = [ticket()];
    expect(selectMyDealsTickets(rows, "active", "newest", at(0)).map((t) => t.id)).toEqual([
      "t1",
    ]);
    expect(selectMyDealsTickets(rows, "past", "newest", at(0))).toEqual([]);
    expect(selectMyDealsTickets(rows, "active", "newest", at(21 * MIN))).toEqual([]);
    expect(
      selectMyDealsTickets(rows, "past", "newest", at(21 * MIN)).map((t) => t.id)
    ).toEqual(["t1"]);
  });

  it("keeps the non-time status rules exactly as they were", () => {
    // Only pending-and-unexpired is active. A redeemed ticket is past at every
    // instant, and the clock never promotes anything back into Active.
    const redeemed = ticket({ status: "success", redeemedAt: iso(2 * MIN) });
    for (const m of [0, 21, 600]) {
      expect(selectMyDealsTickets([redeemed], "active", "newest", at(m * MIN))).toEqual([]);
      expect(
        selectMyDealsTickets([redeemed], "past", "newest", at(m * MIN)).map((t) => t.id)
      ).toEqual(["t1"]);
    }
  });

  it("the row and the collection holding it cannot disagree", () => {
    // The instant is decided once and handed down, so a row can never read
    // EXPIRED under a tab that still counts it as active.
    const rows = [ticket()];
    const props = {
      tickets: rows,
      when: "active" as const,
      sort: "newest" as const,
      featureEnabled: false,
      windowMinutes: 15,
    };
    const live = renderShopperTree(createElement(MyDealsList, props), at(0));
    expect(live).toContain("ACTIVE");
    expect(live).not.toContain("EXPIRED");

    const past = renderShopperTree(createElement(MyDealsList, props), at(21 * MIN));
    // Gone from Active entirely — not present-but-contradicting. The copy
    // says the SEGMENT is empty, not that nothing was ever claimed: the
    // ticket is under Past, one tap away.
    expect(past).not.toContain("ACTIVE");
    expect(past).not.toContain("Nyama Spot");
    expect(past).toContain("No active deals");
    expect(past).not.toContain("No claimed deals yet");
  });

  it("the page reads no clock, so it cannot freeze membership again", () => {
    // Stated as "no clock at all" rather than pinned to the old expression:
    // any way of partitioning these rows during the server render is the
    // defect, not just the one that was there.
    const page = read("app/(shopper)/my-deals/page.tsx");
    expect(page).not.toContain("new Date()");
    expect(page).not.toContain(".filter(");
    expect(page).toContain("<MyDealsList");
    expect(page).toContain("when={when}");
  });
});

describe("criterion 3 — the first client render agrees with the server render", () => {
  // This PR made three subtrees clock-CONDITIONAL: ClaimGate swaps the claim
  // flow for the ended CTA, TicketRow drops its countdown, EndingSoonRail adds
  // or removes an entire section. React cannot patch a structural mismatch — it
  // discards the server tree and rebuilds the branch, which on a money surface
  // means the claim flow torn down under a shopper's finger.
  // `suppressHydrationWarning` covers text, not structure; the seeded instant
  // is what makes the two passes identical.
  const railItem = (id: string, expiresInMs: number) => ({
    membership: {
      id,
      expires_at: iso(expiresInMs),
      max_claims: null,
      claims_count: 0,
    },
    card: {
      href: `/deals/${id}`,
      imageUrl: null,
      merchantName: "Nyama Spot",
      title: "Platter",
      expiresAt: iso(expiresInMs),
      variant: "vertical" as const,
      merchantId: "m1",
      showFavourite: false,
    },
  });

  const tree = (): ReactNode =>
    createElement(
      "div",
      null,
      // This file is .ts, so elements are built with createElement, and
      // ClaimGate takes `children` and `expired` as two named branches.
      // eslint-disable-next-line react/no-children-prop
      createElement(ClaimGate, {
        key: "gate",
        expiresAt: iso(30 * MIN),
        children: createElement("span", null, "Claim deal"),
        expired: createElement("span", null, "Deal ended"),
      }),
      createElement(EndingSoonRail, { key: "rail", items: [railItem("d1", 30 * MIN)] }),
      createElement(DealCard, { key: "card", ...railItem("d2", 30 * MIN).card })
    );

  // Two hours of drift crosses every boundary in that tree: the claim window,
  // the "within the hour" rail, the grace period and the countdown text.
  const DRIFT = at(120 * MIN);

  it("is byte-identical however far the browser's own clock has moved", () => {
    vi.useFakeTimers();
    try {
      // The server pass, at the instant it seeds.
      vi.setSystemTime(T0);
      const server = renderShopperTree(tree(), T0);
      // The browser's first pass. Its ambient clock is two hours ahead; the
      // serialised seed is the same value, because it came down with the page.
      // renderToStaticMarkup runs no effects, so this is the pre-hydration
      // render — exactly what React reconciles against the server HTML.
      vi.setSystemTime(DRIFT);
      const firstClient = renderShopperTree(tree(), T0);
      expect(firstClient).toBe(server);
    } finally {
      vi.useRealTimers();
    }
  });

  it("and the comparison is not vacuous — advancing the seed does change it", () => {
    // Without this, a tree that ignored the clock entirely would pass the test
    // above. Structure must move, not only text.
    const server = renderShopperTree(tree(), T0);
    const later = renderShopperTree(tree(), DRIFT);
    expect(later).not.toBe(server);
    expect(server).toContain("Claim deal");
    expect(server).not.toContain("Deal ended");
    expect(later).toContain("Deal ended");
    expect(later).not.toContain("Claim deal");
    expect(server).toContain(ENDING_SOON_SUBTITLE);
    expect(later).not.toContain(ENDING_SOON_SUBTITLE);
  });

  it("refuses to render a time-derived shopper element outside the provider", () => {
    // The mechanism that keeps the guarantee: a silent fallback to an unseeded
    // clock is the regression, so there is no silent fallback.
    expect(() =>
      renderToStaticMarkup(
        // eslint-disable-next-line react/no-children-prop
        createElement(ClaimGate, {
          expiresAt: iso(30 * MIN),
          children: null,
          expired: null,
        })
      )
    ).toThrow(/ShopperClockProvider/);
  });

  it("suppresses hydration warnings only where no seed can exist", () => {
    // The workaround is gone from every seeded surface. It survives on the one
    // countdown rendered outside a provider (the merchant deal page), where
    // there genuinely is no server instant to share.
    expect(read("components/ui/claude/deal-card.tsx")).not.toContain(
      "suppressHydrationWarning"
    );
    const chips = read("components/ui/chips.tsx");
    expect(chips).toContain("suppressHydrationWarning={unseeded}");
    expect(chips).not.toContain("suppressHydrationWarning\n");
    // The seeded path must be preferred automatically wherever a provider is
    // mounted, so a chip inside the shopper tree never self-ticks.
    expect(chips).toContain("useOptionalShopperClock()");
    expect(chips).toContain("now ?? shared");
  });
});

describe("criterion 3 — a shared instant is worthless unless it advances", () => {
  // `performance` must be faked alongside the timers: the clock advances by
  // elapsed MONOTONIC time, so without it `advanceTimersByTime` would move the
  // timers and the wall clock while elapsed time stood still.
  const fakeClock = () =>
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "Date", "performance"],
    });

  // The counterexample the whole design has to survive: one clock, threaded
  // everywhere, that never moves. Every element agrees with every other and
  // all of them are wrong. No render comparison can see it — both passes
  // produce the same stale output — so the advancing behaviour is asserted
  // directly.
  it("ticks once immediately, then on every interval", () => {
    fakeClock();
    try {
      vi.setSystemTime(T0);
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);
      // Immediate, so the clock is demonstrably live from the first effect
      // rather than one interval later.
      expect(ticks).toHaveLength(1);
      expect(ticks[0].getTime()).toBe(T0.getTime());

      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS * 3);
      expect(ticks).toHaveLength(4);
      // Each tick carries the CURRENT time, not a re-emitted stale one.
      expect(ticks[3].getTime()).toBe(T0.getTime() + SHOPPER_CLOCK_INTERVAL_MS * 3);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances the SERVER seed, never the device's wall clock", () => {
    // Deadlines are evaluated by the database in server time. Now that the
    // clock decides claimability and membership, a wrong device clock would
    // withdraw a claim the database would still accept, or keep advertising a
    // deal it has already expired — a shopper with a fast phone would simply
    // be shown fewer deals than exist.
    fakeClock();
    try {
      // The device is two hours ahead of the server.
      vi.setSystemTime(at(120 * MIN));
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);
      expect(ticks[0].getTime()).toBe(T0.getTime());
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS * 2);
      // Elapsed time is honoured; the device's absolute clock is not.
      expect(ticks[2].getTime()).toBe(T0.getTime() + SHOPPER_CLOCK_INTERVAL_MS * 2);
      expect(ticks[2].getTime()).toBeLessThan(at(120 * MIN).getTime());
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never runs SLOWER than real time, so a suspended device catches up", () => {
    // The property that matters, and the reason monotonic time alone is not
    // enough: `performance.now()` pauses across device suspend on several
    // platforms, and a locked phone is the normal case at a mall. Trusting it
    // alone leaves the clock hours behind on reopen — expired deals still
    // offered, and a claimed-code countdown still showing time left after
    // verification would reject it.
    //
    // Under fake timers `setSystemTime` moves the wall clock without advancing
    // monotonic time, which is exactly the shape of a resume.
    fakeClock();
    try {
      vi.setSystemTime(T0);
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);
      expect(ticks[0].getTime()).toBe(T0.getTime());

      // Two hours pass with the device asleep: the wall clock moved, elapsed
      // monotonic time did not.
      vi.setSystemTime(at(120 * MIN));
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS);

      const last = ticks[ticks.length - 1];
      expect(last.getTime()).toBeGreaterThanOrEqual(at(120 * MIN).getTime());
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never runs BACKWARDS, whatever the device clock does", () => {
    // The other half of taking the greater of the two readings: a backward
    // step — a user correcting their clock, an NTP slew — must not rewind the
    // shopper's deadlines and resurrect an expired deal.
    fakeClock();
    try {
      vi.setSystemTime(T0);
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS * 2);
      const before = ticks[ticks.length - 1].getTime();

      // The device clock jumps two hours into the past.
      vi.setSystemTime(at(-120 * MIN));
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS);

      expect(ticks[ticks.length - 1].getTime()).toBeGreaterThanOrEqual(before);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never rewinds after a forward step is CORRECTED", () => {
    // Taking the greater of the two CURRENT deltas is not monotone across
    // ticks. A wall clock that jumps an hour forward and is then put right
    // would emit base+1h and then fall back to the monotonic delta, rewinding
    // almost the whole hour — every deal and ticket that expired inside it
    // would come back to life. Elapsed time is a high-water mark.
    fakeClock();
    try {
      vi.setSystemTime(T0);
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);

      // Forward step: the clock follows it.
      vi.setSystemTime(at(60 * MIN));
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS);
      const peak = ticks[ticks.length - 1].getTime();
      expect(peak).toBeGreaterThanOrEqual(at(60 * MIN).getTime());

      // ...and the correction must not undo it.
      vi.setSystemTime(T0);
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS);
      expect(ticks[ticks.length - 1].getTime()).toBeGreaterThanOrEqual(peak);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ticks the moment a backgrounded tab is reopened", () => {
    // A backgrounded interval is throttled and a suspended one stops, so the
    // first thing a returning shopper would otherwise see is the state from
    // before they locked their phone — for up to a full interval.
    const listeners: Record<string, (() => void)[]> = {};
    const add = (k: string, fn: () => void) => {
      (listeners[k] ??= []).push(fn);
    };
    const remove = (k: string, fn: () => void) => {
      listeners[k] = (listeners[k] ?? []).filter((f) => f !== fn);
    };
    const g = globalThis as unknown as Record<string, unknown>;
    const hadDoc = "document" in g;
    const hadWin = "window" in g;
    g.document = { addEventListener: add, removeEventListener: remove };
    g.window = { addEventListener: add, removeEventListener: remove };
    fakeClock();
    try {
      vi.setSystemTime(T0);
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);
      const before = ticks.length;

      vi.setSystemTime(at(120 * MIN));
      listeners["visibilitychange"]?.forEach((f) => f());

      expect(ticks.length).toBeGreaterThan(before);
      expect(ticks[ticks.length - 1].getTime()).toBeGreaterThanOrEqual(
        at(120 * MIN).getTime()
      );

      // ...and teardown removes them, or a navigated-away page keeps ticking.
      stop();
      expect(listeners["visibilitychange"]).toHaveLength(0);
      expect(listeners["pageshow"]).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      if (!hadDoc) delete g.document;
      if (!hadWin) delete g.window;
    }
  });

  it("runs exactly one timer and stops it on teardown", () => {
    // A second timer per element is the other failure mode: a feed of cards
    // waking dozens of times a minute while claiming to share one clock.
    fakeClock();
    try {
      vi.setSystemTime(T0);
      const ticks: Date[] = [];
      const stop = startShopperClock(SHOPPER_CLOCK_INTERVAL_MS, (d) => ticks.push(d), T0);
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS * 10);
      expect(ticks).toHaveLength(11);
      stop();
      vi.advanceTimersByTime(SHOPPER_CLOCK_INTERVAL_MS * 10);
      expect(ticks).toHaveLength(11);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is what the provider actually mounts", () => {
    // Wiring, for the same reason the card's `now={now}` is asserted on the
    // wiring: an advancing helper nothing calls proves nothing.
    const clock = read("lib/use-shopper-clock.tsx");
    expect(clock).toContain("startShopperClock(intervalMs, setNow, seed)");
    // The device clock may inform ELAPSED time; it must never be read as an
    // absolute instant, which is what reintroduces unbounded skew.
    expect(clock).not.toMatch(/onTick\(new Date\(\)\)/);
    expect(clock).toContain("performance.now()");
    expect(clock).toContain("useState(seed)");
  });
});

describe("criterion 3 — the faster ticket timers start from the same instant", () => {
  // The ticket route runs two 1s timers on purpose: a countdown that visibly
  // moves is what makes a screenshotted code obviously stale, and the shared
  // 30s clock is too slow for that. Being INSIDE the provider does nothing on
  // its own — they have to seed from it, or the ticket route keeps the exact
  // structural mismatch the provider exists to remove.
  const ticket = (expiresInMs: number, claimedMs: number) =>
    createElement(
      "div",
      null,
      createElement(ClaimedCode, {
        key: "code",
        code: "123456",
        expiresAt: iso(expiresInMs),
      }),
      createElement(FastVisitPanel, {
        key: "panel",
        claimedAt: iso(claimedMs),
        arrivedAt: null,
        qualifiedAt: null,
      })
    );

  it("renders identically however far the browser's own clock has moved", () => {
    // The Fast Visit window closes 15 minutes after the claim, so 30 minutes of
    // drift crosses it — and that boundary switches the CARD, not just text.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(T0);
      const server = renderShopperTree(ticket(40 * MIN, 0), T0);
      vi.setSystemTime(at(30 * MIN));
      const firstClient = renderShopperTree(ticket(40 * MIN, 0), T0);
      expect(firstClient).toBe(server);
    } finally {
      vi.useRealTimers();
    }
  });

  it("and advancing the seed does change both of them", () => {
    const server = renderShopperTree(ticket(40 * MIN, 0), T0);
    const later = renderShopperTree(ticket(40 * MIN, 0), at(30 * MIN));
    expect(later).not.toBe(server);
    // The reward window is a card swap, not a text change.
    expect(server).not.toMatch(/window ended/i);
    expect(later).toMatch(/window ended/i);
    // ...and the claim countdown moved with it, on the same seed.
    expect(server).not.toBe(later);
  });

  it("keeps the deliberate 1s cadence rather than joining the 30s clock", () => {
    // Slowing these to the shared clock would be a silent product regression:
    // the anti-screenshot property depends on visible movement.
    for (const rel of [
      "app/(shopper)/tickets/[id]/claimed-code.tsx",
      "app/(shopper)/tickets/[id]/fast-visit-panel.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("useShopperClockSeed()");
      expect(src).toContain("startShopperClock(1000");
      expect(src).not.toContain("useShopperClock()");
    }
  });

  it("runs on SERVER time too — the counter is where skew would hurt most", () => {
    // These keep their own 1s timer, so they had their own copy of the
    // device-clock defect: a skewed phone telling a shopper at the counter
    // that their code died while the database still accepts it, or that the
    // reward window is still open when it has closed.
    for (const rel of [
      "app/(shopper)/tickets/[id]/claimed-code.tsx",
      "app/(shopper)/tickets/[id]/fast-visit-panel.tsx",
    ]) {
      const src = read(rel);
      // Advanced through the shared monotonic mechanism, seeded from the
      // server — never read straight off the device.
      expect(src).toContain("startShopperClock(");
      expect(src).not.toMatch(/setInterval\(/);
      expect(src).not.toMatch(/Date\.now\(\)/);
      expect(src).not.toMatch(/\bmsUntil\(/);
    }
  });
});

describe("criterion 3 — an expired deal cannot remain in a discovery collection", () => {
  // The founder ruling of 2026-08-29: shipping an "Expired" card inside "Live
  // deals" would reproduce the row-versus-section regression already corrected
  // on /my-deals. `/shops/[id]` is the sharpest instance — its query filters
  // `expires_at > now` and its heading says, literally, "Live deals".
  //
  // The rule mirrors the SERVER predicate exactly: strictly `expires_at > now`.
  // Not `isLiveNow`, which allows 15 minutes of grace so an already-claimed
  // code still redeems; a discovery surface that used the grace would be more
  // permissive than the query it mirrors.
  const card = (id: string, expiresInMs: number) => ({
    id,
    expiresAt: iso(expiresInMs),
    card: {
      href: `/deals/${id}`,
      imageUrl: null,
      merchantName: "Nyama Spot",
      title: `Deal ${id}`,
      expiresAt: iso(expiresInMs),
      variant: "vertical" as const,
      merchantId: "m1",
      showFavourite: false,
    },
  });

  it("withdraws exactly at expiry, with no grace", () => {
    const at30 = iso(30 * MIN);
    expect(isUnexpiredAt(at30, at(29 * MIN))).toBe(true);
    expect(isUnexpiredAt(at30, at(30 * MIN))).toBe(false);
    // The ticket grace is 15 minutes; discovery must not borrow it.
    expect(isUnexpiredAt(at30, at(31 * MIN))).toBe(false);
    expect(isUnexpiredAt(at30, at(44 * MIN))).toBe(false);
  });

  it("keeps a row whose expiry cannot be read rather than deleting it", () => {
    // `deals.expires_at` is NOT NULL in production (D29), so this cannot come
    // from a real row — and silently removing a card because a value failed to
    // parse is a worse failure than showing it.
    expect(isUnexpiredAt(null, at(0))).toBe(true);
    expect(isUnexpiredAt("not-a-date", at(0))).toBe(true);
  });

  it("preserves the server's order on the surviving subset", () => {
    // A locked rail order is an order WITHIN a rail, so it holds on any subset.
    // That is exactly why removing a member is safe and re-sorting is not.
    const items = [card("a", 90 * MIN), card("b", 10 * MIN), card("c", 60 * MIN)];
    expect(liveItemsAt(items, at(0)).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(liveItemsAt(items, at(20 * MIN)).map((i) => i.id)).toEqual(["a", "c"]);
    expect(liveItemsAt(items, at(70 * MIN)).map((i) => i.id)).toEqual(["a"]);
    expect(liveItemsAt(items, at(95 * MIN))).toEqual([]);
  });

  it("takes the whole section with the last member, heading included", () => {
    // The worst state is not a stale card — it is a heading over nothing. A
    // section that renders its title on the server and its contents on the
    // clock produces exactly that.
    const props = {
      title: "Top picks near you",
      subtitle: "Flash deals — grab them while they last",
      items: [card("a", 30 * MIN)],
    };
    const live = renderShopperTree(createElement(LiveDealCollection, props), at(0));
    expect(live).toContain("Top picks near you");
    expect(live).toContain("Deal a");

    const gone = renderShopperTree(
      createElement(LiveDealCollection, props),
      at(31 * MIN)
    );
    expect(gone).not.toContain("Top picks near you");
    expect(gone).not.toContain("Deal a");
    expect(gone).not.toContain("Expired");
  });

  it("never renders an expired card beside a live one", () => {
    const props = {
      title: "Deals near me",
      items: [card("live", 90 * MIN), card("gone", 10 * MIN)],
    };
    const html = renderShopperTree(
      createElement(LiveDealCollection, props),
      at(20 * MIN)
    );
    expect(html).toContain("Deals near me");
    expect(html).toContain("Deal live");
    expect(html).not.toContain("Deal gone");
    // The heading is only honest if nothing under it reads Expired.
    expect(html).not.toContain("Expired");
  });

  it("promotes the next deal into the lead slot rather than losing the rail head", () => {
    // The lead IS position 1 of the flash rail. When the lead expires the rail
    // must keep a head, not render a rail with a hole where its hero was.
    const props = {
      title: "Top picks near you",
      lead: true,
      items: [card("first", 20 * MIN), card("second", 90 * MIN)],
    };
    const before = renderShopperTree(createElement(LiveDealCollection, props), at(0));
    const after = renderShopperTree(
      createElement(LiveDealCollection, props),
      at(25 * MIN)
    );
    expect(before).toContain("Deal first");
    expect(after).not.toContain("Deal first");
    expect(after).toContain("Deal second");
    expect(after).toContain("Top picks near you");
  });

  it("`shops/[id]` cannot show an Expired row under its Live deals heading", () => {
    const deals = [
      { id: "d1", title: "Platter", image_url: null, expires_at: iso(30 * MIN) },
    ];
    const live = renderShopperTree(createElement(ShopLiveDeals, { deals }), at(0));
    expect(live).toContain("Platter");
    expect(live).not.toContain("No live deals right now");

    const gone = renderShopperTree(
      createElement(ShopLiveDeals, { deals }),
      at(31 * MIN)
    );
    expect(gone).not.toContain("Platter");
    expect(gone).not.toContain("Expired");
    // States the absence rather than leaving the heading over nothing.
    expect(gone).toContain("No live deals right now");
  });

  it("`/search` says there are no results rather than listing expired ones", () => {
    const items = [card("s1", 30 * MIN)];
    const live = renderShopperTree(
      createElement(SearchResults, { items, query: "platter" }),
      at(0)
    );
    expect(live).toContain("Deal s1");

    const gone = renderShopperTree(
      createElement(SearchResults, { items, query: "platter" }),
      at(31 * MIN)
    );
    expect(gone).not.toContain("Deal s1");
    expect(gone).not.toContain("Expired");
    expect(gone).toContain("No results for");
  });

  it("`/browse` and `/map` withdraw through the same predicate", () => {
    // Both already filter client-side, so the predicate belongs in the filter
    // they share rather than in two more collections.
    const rows = [
      { ...browseRow("keep", 90 * MIN) },
      { ...browseRow("drop", 10 * MIN) },
    ];
    expect(filterBrowseDeals(rows, { now: at(0) }).map((d) => d.id)).toEqual([
      "keep",
      "drop",
    ]);
    expect(filterBrowseDeals(rows, { now: at(20 * MIN) }).map((d) => d.id)).toEqual([
      "keep",
    ]);
    // Unconditional: a shopper's own filters cannot bring an expired deal back.
    expect(
      filterBrowseDeals(rows, { now: at(20 * MIN), chip: "all" }).map((d) => d.id)
    ).toEqual(["keep"]);
    expect(
      filterBrowseDeals(rows, { now: at(20 * MIN), rail: "all", time: "any" }).map(
        (d) => d.id
      )
    ).toEqual(["keep"]);
  });

  it("the feed states the quiet market rather than blaming a filter", () => {
    // Counts are recomputed at `now`. Frozen numbers would make an all-expired
    // feed say a category or deal-type filter emptied it, which removed nothing.
    const expiries = [iso(10 * MIN), iso(20 * MIN)];
    const body = (when: Date) =>
      renderShopperTree(
        // eslint-disable-next-line react/no-children-prop
        createElement(FeedBody, {
          liveExpiries: expiries,
          afterCategoryExpiries: expiries,
          shownExpiries: expiries,
          category: "food" as const,
          filter: "flash" as const,
          children: createElement("div", null, "rails"),
        }),
        when
      );
    expect(body(at(0))).toContain("rails");
    const empty = body(at(25 * MIN));
    expect(empty).not.toContain("rails");
    expect(empty).toContain("No deals live right now");
    expect(empty).not.toMatch(/food deals right now|flash deals right now/);
  });
});

describe("criterion 3 — membership changes must not leak per-deal client state", () => {
  it("keys every card in a live collection by its deal", () => {
    // Asserted on the source because the failure needs a REMOUNT to observe and
    // these suites render to static markup, where keys leave no trace.
    //
    // The defect it prevents is not cosmetic. React reconciles an unkeyed child
    // by position, so when the flash lead expires and the next deal takes the
    // slot, the promoted deal reuses the expired one's component instance —
    // and `FavouriteButton` reads `initial` into local state exactly once. A
    // shopper tapping the heart on the new lead would submit the PREVIOUS
    // merchant's saved state: a wrong write to their own data, caused by a card
    // that only moved. Withdrawing members is what makes this reachable, so the
    // guard belongs with the withdrawal.
    // Asserting the SHAPE of a key is not enough, and this guard was weaker
    // than it looked: `key={!!first.id}` contains both `key={` and `.id}` while
    // producing the same `true` for every deal, so promotion would still reuse
    // the expired lead's instance with the test green. The value semantics are
    // therefore behavioural (below) and the source assertion only pins that
    // every card routes through the one named function.
    const src = read("components/shopper/live-deal-collection.tsx");
    const cards = src.match(/<DealCard[^>]*/g) ?? [];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card, `card must key through cardKey(): ${card}`).toMatch(
        /key=\{cardKey\([^)]*,\s*\w+\.id\)\}/
      );
    }
  });

  it("gives two different deals two different keys", () => {
    // The property that actually matters: a key that does not vary by deal is
    // the defect, however it is spelled.
    const a = "6f1c1a4e-0000-4000-8000-000000000001";
    const b = "6f1c1a4e-0000-4000-8000-000000000002";
    expect(cardKey("", a)).not.toBe(cardKey("", b));
    expect(cardKey("fav-", a)).not.toBe(cardKey("fav-", b));
    // Prefixes separate slots, so the same deal in two rails does not collide.
    expect(cardKey("lead-", a)).not.toBe(cardKey("", a));
    // ...and the same deal in the same slot is stable, or nothing would ever
    // keep its state across a re-render.
    expect(cardKey("", a)).toBe(cardKey("", a));
    // A boolean-ish or constant key is exactly what this rules out.
    expect(new Set([cardKey("", a), cardKey("", b)]).size).toBe(2);
  });

  it("keys the rows on every other collection that withdraws members", () => {
    for (const rel of [
      "components/shopper/shop-live-deals.tsx",
      "components/shopper/my-deals-list.tsx",
      "components/shopper/ending-soon-rail.tsx",
    ]) {
      const src = read(rel);
      for (const el of src.match(/<(DealCard|TicketRow|Link)[^>]*/g) ?? []) {
        if (!el.includes("key=")) continue;
        // Any prefix is fine; the key must END in the row's own id, so two
        // different deals can never share one.
        expect(el, `key must carry the row id: ${el}`).toMatch(/key=\{[^}]*\bid\}/);
      }
    }
  });
});

describe("criterion 3 — the price survives the claim bar it was hiding behind", () => {
  // Direction A puts YOU PAY in the anchored decision bar on a claimable deal,
  // so the detail block deliberately renders it only when the deal cannot be
  // claimed. Once ClaimGate withdrew the bar on an open page, the bar was gone
  // and the block was still gated on the SERVER's `claimable` — an aged render
  // showed no price at all, while a fresh render of the same expired deal
  // showed one. Two renders of one state disagreeing is the contradiction
  // criterion 3 forbids between two elements.
  const detail = (serverClaimable: boolean, extras = 0) =>
    createElement(DealPriceDetail, {
      pay: 450,
      was: 800,
      extras,
      charges: [],
      priceKes: 450,
      serverClaimable,
      expiresAt: iso(30 * MIN),
    });

  it("hands the figure over as the bar leaves, in the same tick", () => {
    const claimable = renderShopperTree(detail(true), at(0));
    expect(claimable).not.toContain("You pay");

    const ended = renderShopperTree(detail(true), at(31 * MIN));
    expect(ended).toContain("You pay");
    expect(ended).toContain("KES 450");
  });

  it("matches a fresh render of the same expired deal", () => {
    // The aged page and a reload must not disagree about whether a price exists.
    const aged = renderShopperTree(detail(true), at(31 * MIN));
    const fresh = renderShopperTree(detail(false), at(31 * MIN));
    expect(aged).toContain("You pay");
    expect(fresh).toContain("You pay");
  });

  it("still shows the price immediately when data, not time, blocks the claim", () => {
    // Paused, fully claimed, already ticketed: unclaimable for reasons the
    // clock knows nothing about, and the price was always shown at once.
    const html = renderShopperTree(detail(false), at(0));
    expect(html).toContain("You pay");
    expect(html).toContain("KES 450");
  });
});

describe("criterion 3 — an empty segment describes itself honestly", () => {
  const ticket = (over: Partial<MyDealsTicket> = {}): MyDealsTicket => ({
    id: "t1",
    href: "/tickets/t1",
    code: "123 456",
    status: "pending",
    expiresAt: iso(20 * MIN),
    redeemedAt: null,
    claimedAt: iso(0),
    arrivedAt: null,
    qualifiedAt: null,
    countdownExpiresAt: iso(20 * MIN),
    merchantName: "Nyama Spot",
    dealTitle: "Platter",
    ...over,
  });
  const list = (tickets: MyDealsTicket[], when: "active" | "past", nowAt: Date) =>
    renderShopperTree(
      createElement(MyDealsList, {
        tickets,
        when,
        sort: "newest" as const,
        featureEnabled: false,
        windowMinutes: 15,
      }),
      nowAt
    );

  it("does not tell a shopper who has tickets that they have never claimed", () => {
    // Reachable without navigating now: the last active ticket expires, moves
    // to Past, and the Active tab would otherwise deny the history one tap away.
    const html = list([ticket()], "active", at(21 * MIN));
    expect(html).toContain("No active deals");
    expect(html).not.toContain("No claimed deals yet");
    expect(html).toContain("under Past");
  });

  it("still says nothing has ever been claimed when nothing has", () => {
    const html = list([], "active", at(0));
    expect(html).toContain("No claimed deals yet");
    expect(html).not.toContain("No active deals");
  });

  it("keeps the Past copy unchanged", () => {
    const html = list([ticket()], "past", at(0));
    expect(html).toContain("No past deals");
    expect(html).not.toContain("No claimed deals yet");
  });
});

describe("criterion 3 — surfaces the first discovery audit missed", () => {
  // Two surfaces my own audit got wrong. `/notifications` I excluded outright,
  // reasoning from its DEALS read — rows recording a past event, which really
  // are timeless — and generalising that to the whole page. The code reminder
  // beside them is built from `expires_at > now` and is not timeless at all.
  // `/qr/[token]` I did not consider, because it is a counter surface rather
  // than a discovery one; claimability is criterion 3 wherever it renders.

  it("withdraws a code reminder once the code it describes has expired", () => {
    // Worse than a stale card: a shopper acts on an inbox row by walking to a
    // shop, and this row's whole job is saying their code still has time.
    const items = [
      {
        title: "Nyama Spot",
        body: "Your claimed code expires soon",
        at: iso(0),
        unread: true,
        expiresAt: iso(30 * MIN),
      },
    ];
    const live = renderShopperTree(createElement(NotificationList, { items }), at(0));
    expect(live).toContain("Your claimed code expires soon");

    const gone = renderShopperTree(
      createElement(NotificationList, { items }),
      at(31 * MIN)
    );
    expect(gone).not.toContain("Your claimed code expires soon");
    expect(gone).toContain("Nothing yet");
  });

  it("keeps rows that record a past event, which do not go stale", () => {
    // The half of my original reasoning that was right: "New deal from a saved
    // shop" is a timestamped event, not a claim about the present.
    const items = [
      { title: "Nyama Spot", body: "New deal from a saved shop", at: iso(0), unread: false },
    ];
    for (const when of [at(0), at(600 * MIN)]) {
      expect(renderShopperTree(createElement(NotificationList, { items }), when)).toContain(
        "New deal from a saved shop"
      );
    }
  });

  it("takes an expired claim out of the QR chooser", () => {
    const claims = [
      { redemptionId: "r1", dealTitle: "Summer Abaya", expiresAt: iso(20 * MIN) },
      { redemptionId: "r2", dealTitle: "Shoe Deal", expiresAt: iso(90 * MIN) },
    ];
    const props = {
      token: "t",
      merchantId: "m1",
      merchantName: "Nyama Spot",
      merchantFloor: null,
      claims,
      alreadyCheckedInFor: null,
    };
    const both = renderShopperTree(createElement(QrCheckIn, props), at(0));
    expect(both).toContain("Summer Abaya");
    expect(both).toContain("Shoe Deal");

    const one = renderShopperTree(createElement(QrCheckIn, props), at(21 * MIN));
    expect(one).not.toContain("Summer Abaya");
    expect(one).toContain("Shoe Deal");
  });

  it("does not check a shopper in on their behalf when the other claim expires", () => {
    // "Ask, never guess" is this component's rule. Withdrawing a dead option is
    // a display change; silently checking them into the survivor is an ACTION
    // taken while they were mid-decision at a counter.
    const src = read("app/(shopper)/qr/[token]/qr-check-in.tsx");
    expect(src).toContain("if (alreadyCheckedInFor || claims.length !== 1) return;");
    expect(src).not.toContain("liveClaims.length !== 1) return;");
    // Selection and the empty state read the live set; the auto path does not.
    expect(src).toContain("{liveClaims.map((c) => (");
    expect(src).toContain("if (liveClaims.length === 0 && state.kind !== \"checked-in\")");
  });
});
