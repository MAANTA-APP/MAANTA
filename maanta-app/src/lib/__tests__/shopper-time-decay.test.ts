import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { stripComments } from "./helpers/comment-stripping";
import { renderShopperTree } from "./helpers/shopper-clock";
import { endingSoonDeals, ENDING_SOON_SUBTITLE } from "@/lib/ending-soon";
import { fastVisitChipState, fastVisitChipLabel } from "@/lib/fast-visit-chip";
import { dealExpiryLabel, isDealClaimable } from "@/lib/deal-expiry";
import { isNearExpiry } from "@/lib/ui";
import { DealCard } from "@/components/ui/claude";
import { ClaimGate } from "@/components/shopper/claim-gate";
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
    // Gone from Active entirely — not present-but-contradicting.
    expect(past).not.toContain("ACTIVE");
    expect(past).not.toContain("Nyama Spot");
    expect(past).toContain("No claimed deals yet");
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
