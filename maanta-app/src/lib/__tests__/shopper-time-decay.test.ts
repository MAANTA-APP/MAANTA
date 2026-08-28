import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { stripComments } from "./helpers/comment-stripping";
import { endingSoonDeals } from "@/lib/ending-soon";
import { fastVisitChipState, fastVisitChipLabel } from "@/lib/fast-visit-chip";
import { dealExpiryLabel } from "@/lib/deal-expiry";
import { isNearExpiry } from "@/lib/ui";
import { DealCard } from "@/components/ui/claude";

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
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        href: "/deals/d1",
        imageUrl: null,
        merchantName: "Nyama Spot",
        title: "Platter",
        expiresAt: new Date(Date.now() + 90 * MIN).toISOString(),
        variant: "vertical" as const,
        merchantId: "m1",
        showFavourite: false,
      })
    );
    expect(html).toMatch(/Expires in 1h \d+m/);
  });
});

describe("the clock fetches nothing — criteria 1-3 are clock-derived only", () => {
  it("introduces no polling, refetch or network call", () => {
    // Criterion 4 needs fresh data; these three do not, and must not smuggle
    // it in. A fetch here would also change the load profile of every open
    // shopper page.
    for (const rel of [
      "lib/use-shopper-clock.ts",
      "components/shopper/ticket-row-chips.tsx",
      "components/shopper/ending-soon-rail.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/\bfetch\(|useSWR|refetch|router\.refresh|revalidate/);
    }
  });

  it("keeps one shared interval rather than a timer per element", () => {
    const clock = read("lib/use-shopper-clock.ts");
    expect(clock).toContain("SHOPPER_CLOCK_INTERVAL_MS");
    expect(clock).toContain("clearInterval");
    // No component may start its own competing timer.
    for (const rel of [
      "components/shopper/ticket-row-chips.tsx",
      "components/shopper/ending-soon-rail.tsx",
      "components/ui/claude/deal-card.tsx",
    ]) {
      expect(read(rel)).not.toContain("setInterval");
    }
  });
});
