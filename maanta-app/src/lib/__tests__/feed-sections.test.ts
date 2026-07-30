import { describe, expect, it } from "vitest";
import type { DealRow } from "@/lib/data";
import {
  FEED_SECTIONS,
  isNearMeDeal,
  nearMeSubtitle,
  orderNearMeDeals,
  selectNearMeDeals,
} from "@/lib/feed-sections";

/**
 * Founder decision D-01 (2026-07-29): the third feed section is **Deals Near
 * Me**, and it carries nearby STANDARD deals only.
 *
 * Two things must not drift back:
 *   1. the label — it was briefly "All active deals";
 *   2. the contents — Flash and Priority placements are separate promotional
 *      surfaces, and padding this rail with either would make the three
 *      sections indistinguishable.
 */

const BBS = { lat: -1.2833, lng: 36.85 };

function deal(over: Partial<DealRow> & { id: string }): DealRow {
  return {
    merchant_id: over.merchant_id ?? `m-${over.id}`,
    node: "BBS Mall",
    title: `Deal ${over.id}`,
    description: null,
    image_url: "/x.png",
    deal_type: "standard",
    flash_duration_hours: 6,
    is_active: true,
    max_claims: null,
    claims_count: 0,
    success_fee: 30,
    boost_active: false,
    price_kes: 500,
    compare_at_kes: null,
    charges: [],
    starts_at: "2026-07-20T00:00:00Z",
    expires_at: "2999-01-01T00:00:00Z",
    merchants: {
      id: over.merchant_id ?? `m-${over.id}`,
      merchant_name: `Shop ${over.id}`,
      floor: null,
      unit_number: null,
      what3words_address: "a.b.c",
      lat: null,
      lng: null,
      mall_name: "BBS Mall",
      node: "BBS Mall",
    },
    ...over,
  } as DealRow;
}

/** A deal whose shop sits `metres`-ish east of the node centre. */
function located(id: string, metresEast: number, over: Partial<DealRow> = {}) {
  const d = deal({ id, ...over });
  // ~111_320 m per degree of longitude at the equator; BBS is close enough.
  return {
    ...d,
    merchants: { ...d.merchants!, lat: BBS.lat, lng: BBS.lng + metresEast / 111_320 },
  } as DealRow;
}

describe("the frozen section labels", () => {
  it("names the third section Deals Near Me", () => {
    // D-01. If this changes, the contract, the docs and the smoke anchor all
    // have to change with it — that is the point of asserting it here.
    expect(FEED_SECTIONS.nearMe.title).toBe("Deals Near Me");
  });

  it("keeps Flash and Priority placements as their own separate rails", () => {
    expect(FEED_SECTIONS.flash.title).toBe("Flash deals");
    expect(FEED_SECTIONS.boosted.title).toBe("Priority placements");
    const titles = Object.values(FEED_SECTIONS).map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("never calls the third section a generic all-deals feed", () => {
    expect(FEED_SECTIONS.nearMe.title).not.toMatch(/all active|all deals/i);
  });
});

describe("isNearMeDeal — what belongs in Deals Near Me", () => {
  it("includes a standard, non-boosted deal", () => {
    expect(isNearMeDeal(deal({ id: "a" }))).toBe(true);
  });

  it("excludes a flash deal — Flash is its own rail", () => {
    expect(isNearMeDeal(deal({ id: "b", deal_type: "flash" }))).toBe(false);
  });

  it("excludes a boosted deal — Priority placements is its own rail", () => {
    expect(isNearMeDeal(deal({ id: "c", boost_active: true }))).toBe(false);
  });

  it("excludes a boosted flash deal", () => {
    expect(
      isNearMeDeal(deal({ id: "d", deal_type: "flash", boost_active: true }))
    ).toBe(false);
  });

  it("does not filter on merchant tier — an Elite shop's non-boosted standard deal belongs here", () => {
    // D-01 is explicit: Standard merchants' one standard deal PLUS Elite
    // merchants' standard deals that are not boosted. Tier is not the test;
    // being flash or boosted is.
    expect(isNearMeDeal(deal({ id: "e" }))).toBe(true);
  });
});

describe("selectNearMeDeals — defence in depth over the query", () => {
  it("strips flash and boosted deals if a widened query ever lets them through", () => {
    const mixed = [
      deal({ id: "std-1" }),
      deal({ id: "flash-1", deal_type: "flash" }),
      deal({ id: "boost-1", boost_active: true }),
      deal({ id: "std-2" }),
    ];
    expect(selectNearMeDeals(mixed).map((d) => d.id)).toEqual(["std-1", "std-2"]);
  });
});

describe("orderNearMeDeals — proximity-led", () => {
  it("puts the nearest shop first", () => {
    const ordered = orderNearMeDeals(
      [located("far", 900), located("near", 50), located("mid", 300)],
      BBS
    );
    expect(ordered.map((d) => d.id)).toEqual(["near", "mid", "far"]);
  });

  it("ranks shops with no coordinates after the located ones, newest first", () => {
    // They are genuinely at the same node, just unrankable — so they follow the
    // located shops rather than being dropped or treated as infinitely far in
    // whatever order the query returned.
    const ordered = orderNearMeDeals(
      [
        deal({ id: "unlocated-old", starts_at: "2026-07-01T00:00:00Z" }),
        located("located-far", 800),
        deal({ id: "unlocated-new", starts_at: "2026-07-25T00:00:00Z" }),
        located("located-near", 20),
      ],
      BBS
    );
    expect(ordered.map((d) => d.id)).toEqual([
      "located-near",
      "located-far",
      "unlocated-new",
      "unlocated-old",
    ]);
  });

  it("falls back to newest first when there is no origin to measure from", () => {
    const ordered = orderNearMeDeals(
      [
        deal({ id: "old", starts_at: "2026-07-01T00:00:00Z" }),
        deal({ id: "new", starts_at: "2026-07-28T00:00:00Z" }),
      ],
      null
    );
    expect(ordered.map((d) => d.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the input array", () => {
    const input = [located("b", 500), located("a", 10)];
    const snapshot = input.map((d) => d.id);
    orderNearMeDeals(input, BBS);
    expect(input.map((d) => d.id)).toEqual(snapshot);
  });

  it("is stable for shops at the same distance", () => {
    const ordered = orderNearMeDeals(
      [
        located("same-old", 100, { starts_at: "2026-07-01T00:00:00Z" }),
        located("same-new", 100, { starts_at: "2026-07-25T00:00:00Z" }),
      ],
      BBS
    );
    expect(ordered.map((d) => d.id)).toEqual(["same-new", "same-old"]);
  });
});

describe("nearMeSubtitle — honest about what 'near' means", () => {
  it("names the mall and claims nearest-first when there is an origin", () => {
    expect(nearMeSubtitle(BBS, "BBS Mall, Eastleigh")).toBe(
      "Standard deals at BBS Mall, Eastleigh, nearest first"
    );
  });

  it("drops the proximity claim entirely with no coordinates", () => {
    // Overclaiming "near me" when nothing is being measured is the failure this
    // guards against.
    const copy = nearMeSubtitle(null, "BBS Mall, Eastleigh");
    expect(copy).not.toMatch(/near/i);
    expect(copy).toMatch(/newest first/);
  });

  it("still avoids naming a mall it does not know", () => {
    expect(nearMeSubtitle(BBS, null)).toBe(
      "Standard deals at your mall, nearest first"
    );
  });
});
