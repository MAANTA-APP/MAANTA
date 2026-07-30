import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSE_SORT,
  DEFAULT_FEED_SORT,
  DEAL_SORT_OPTIONS,
  FEED_SORT_OPTIONS,
  lockedBoostedOrder,
  lockedFlashOrder,
  lockedStandardOrder,
  parseDealListFilter,
  parseDealListSort,
  sortDealRows,
} from "@/lib/deal-list-controls";
import type { DealRow } from "@/lib/data";

/**
 * The locked feed structure from Notion "Frozen Scope & Rules → Feed structure
 * (locked)", enforced as code (decision D1, docs/skills/truth-audit-2026-07-30.md):
 *
 *   1 Flash               → soonest expiry first
 *   2 Priority Placements → most recently boosted first
 *   3 All Active Deals    → all-time verified redemptions descending
 *
 * Before 2026-07-30 the feed defaulted to `nearest`, which re-sorted all three
 * rails by distance from the *mall centroid* and threw away the locked orders —
 * including the boosted order Elite merchants pay KES 500/24h for. These tests
 * pin the orders and the default so that regression cannot return silently.
 */

function deal(id: string, partial: Partial<DealRow> = {}): DealRow {
  return {
    id,
    merchant_id: "m1",
    node: "BBS Mall",
    title: `Deal ${id}`,
    description: null,
    image_url: "",
    deal_type: "standard",
    flash_duration_hours: 6,
    is_active: true,
    max_claims: null,
    claims_count: 0,
    success_fee: 30,
    boost_active: false,
    price_kes: 500,
    compare_at_kes: 800,
    charges: null,
    starts_at: "2026-07-26T08:00:00Z",
    expires_at: "2026-07-26T20:00:00Z",
    merchants: {
      id: "m1",
      merchant_name: "Shop",
      floor: "1",
      unit_number: "A",
      what3words_address: "filled.count.soap",
      lat: -1.274,
      lng: 36.85,
      mall_name: "BBS Mall",
      node: "BBS Mall",
    },
    ...partial,
  };
}

const ids = (rows: DealRow[]) => rows.map((d) => d.id);

describe("the feed's default sort is the locked structure", () => {
  it("defaults the feed to featured, not distance", () => {
    expect(DEFAULT_FEED_SORT).toBe("featured");
  });

  it("keeps distance as Browse's default — the locked structure is feed-only", () => {
    expect(DEFAULT_BROWSE_SORT).toBe("nearest");
  });

  it("offers Featured on the feed and not on Browse", () => {
    expect(FEED_SORT_OPTIONS.map((o) => o.value)).toContain("featured");
    // Browse renders one flat list, so a per-rail order has nothing to mean.
    expect(DEAL_SORT_OPTIONS.map((o) => o.value as string)).not.toContain("featured");
  });

  it("passes rows through untouched for featured, so upstream order survives", () => {
    // The whole point: the locked order is applied per rail in getLiveDeals, and
    // the page must not re-sort it. A comparator here would silently undo it.
    const origin = { lat: -1.274, lng: 36.85 };
    const rows = [
      deal("c", { merchants: { ...deal("c").merchants!, lat: -1.4 } }),
      deal("a"),
      deal("b", { merchants: { ...deal("b").merchants!, lat: -1.3 } }),
    ];
    expect(ids(sortDealRows(rows, "featured", origin))).toEqual(["c", "a", "b"]);
  });

  it("still re-sorts every rail when the shopper picks a sort explicitly", () => {
    const origin = { lat: -1.274, lng: 36.85 };
    const rows = [
      deal("far", { merchants: { ...deal("far").merchants!, lat: -1.4 } }),
      deal("near"),
    ];
    expect(ids(sortDealRows(rows, "nearest", origin))).toEqual(["near", "far"]);
  });
});

describe("URL params cannot smuggle past the locked default", () => {
  // A cast is not validation. `?sort=bogus` is a truthy string, so `?? fallback`
  // never fires and sortDealRows falls through to the distance branch — silently
  // reinstating the D1 regression from a URL. Caught by CodeRabbit on #135.
  it("resolves unrecognised, empty and absent ?sort= to the feed default", () => {
    for (const raw of ["bogus", "", "FEATURED", "nearest ", "0", undefined]) {
      expect(
        parseDealListSort(raw as string | undefined, DEFAULT_FEED_SORT, FEED_SORT_OPTIONS),
        `?sort=${String(raw)} must fall back to ${DEFAULT_FEED_SORT}`
      ).toBe(DEFAULT_FEED_SORT);
    }
  });

  it("still honours every sort the feed actually offers", () => {
    for (const o of FEED_SORT_OPTIONS) {
      expect(parseDealListSort(o.value, DEFAULT_FEED_SORT, FEED_SORT_OPTIONS)).toBe(o.value);
    }
  });

  it("rejects a repeated ?sort= array rather than coercing it", () => {
    // Next gives string[] for repeated params; a cast would sail past.
    expect(
      parseDealListSort(["nearest", "newest"], DEFAULT_FEED_SORT, FEED_SORT_OPTIONS)
    ).toBe(DEFAULT_FEED_SORT);
  });

  it("does not offer the feed's `featured` to Browse", () => {
    // Browse has no rails, so `featured` there would be a no-op pass-through of
    // DB order rather than a meaningful sort.
    expect(parseDealListSort("featured", DEFAULT_BROWSE_SORT, DEAL_SORT_OPTIONS)).toBe(
      DEFAULT_BROWSE_SORT
    );
  });

  // Same bug class, worse symptom: an unrecognised filter is not "all", so every
  // rail is emptied and the feed claims there are no deals in a mall that has them.
  it("resolves unrecognised ?filter= to all, so a bad URL is not an empty market", () => {
    for (const raw of ["bogus", "", "FLASH", undefined, ["flash", "boosted"]]) {
      expect(
        parseDealListFilter(raw as string | undefined),
        `?filter=${String(raw)} must fall back to "all"`
      ).toBe("all");
    }
    expect(parseDealListFilter("flash")).toBe("flash");
    expect(parseDealListFilter("boosted")).toBe("boosted");
    expect(parseDealListFilter("standard")).toBe("standard");
  });
});

describe("locked rail 1 — Flash: soonest expiry first", () => {
  it("orders by soonest expiry", () => {
    const rows = [
      deal("late", { expires_at: "2026-07-26T23:00:00Z" }),
      deal("soon", { expires_at: "2026-07-26T09:00:00Z" }),
      deal("mid", { expires_at: "2026-07-26T14:00:00Z" }),
    ];
    expect(ids(lockedFlashOrder(rows))).toEqual(["soon", "mid", "late"]);
  });

  it("sorts an unknown expiry last, so a malformed row cannot take the top", () => {
    const rows = [
      deal("noexpiry", { expires_at: null }),
      deal("soon", { expires_at: "2026-07-26T09:00:00Z" }),
    ];
    expect(ids(lockedFlashOrder(rows))).toEqual(["soon", "noexpiry"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      deal("late", { expires_at: "2026-07-26T23:00:00Z" }),
      deal("soon", { expires_at: "2026-07-26T09:00:00Z" }),
    ];
    lockedFlashOrder(rows);
    expect(ids(rows)).toEqual(["late", "soon"]);
  });

  it("stays a consistent comparator when starts_at is malformed", () => {
    // byNewest goes through `millis`, so a garbage timestamp yields a finite
    // fallback instead of NaN. A NaN comparator makes sort order
    // implementation-defined, which would show up as deals shuffling per render.
    const rows = [
      deal("bad", { starts_at: "not-a-date", expires_at: null }),
      deal("good", { starts_at: "2026-07-26T08:00:00Z", expires_at: null }),
    ];
    const once = ids(lockedFlashOrder(rows));
    const twice = ids(lockedFlashOrder([...rows].reverse()));
    expect(once).toEqual(twice);
    expect(ids(sortDealRows(rows, "newest", null))).toEqual(
      ids(sortDealRows([...rows].reverse(), "newest", null))
    );
  });
});

describe("locked rail 2 — Priority Placements: most recently boosted first", () => {
  it("orders by boost start time, newest boost first", () => {
    const rows = [deal("old"), deal("newest"), deal("mid")];
    const startedAt = new Map([
      ["old", "2026-07-26T06:00:00Z"],
      ["mid", "2026-07-26T10:00:00Z"],
      ["newest", "2026-07-26T15:00:00Z"],
    ]);
    expect(ids(lockedBoostedOrder(rows, startedAt))).toEqual(["newest", "mid", "old"]);
  });

  it("sorts a deal with no known boost start last — no free top placement", () => {
    const rows = [deal("unknown"), deal("boosted")];
    const startedAt = new Map([["boosted", "2026-07-26T06:00:00Z"]]);
    expect(ids(lockedBoostedOrder(rows, startedAt))).toEqual(["boosted", "unknown"]);
  });

  it("falls back to newest-first when boost start times are unavailable", () => {
    // Mirrors getBoostStartTimes degrading to an empty map on query failure:
    // the paid rail loses its exact order for one render, the feed still renders.
    const rows = [
      deal("older", { starts_at: "2026-07-26T05:00:00Z" }),
      deal("newer", { starts_at: "2026-07-26T11:00:00Z" }),
    ];
    expect(ids(lockedBoostedOrder(rows, new Map()))).toEqual(["newer", "older"]);
  });

  it("accepts a plain object, since Maps do not survive the feed cache", () => {
    const rows = [deal("a"), deal("b")];
    expect(
      ids(lockedBoostedOrder(rows, { a: "2026-07-26T06:00:00Z", b: "2026-07-26T12:00:00Z" }))
    ).toEqual(["b", "a"]);
  });
});

describe("locked rail 3 — All Active Deals: verified redemptions descending", () => {
  it("orders by the merchant's all-time verified redemptions", () => {
    const rows = [
      deal("low", { merchant_id: "m-low" }),
      deal("high", { merchant_id: "m-high" }),
      deal("mid", { merchant_id: "m-mid" }),
    ];
    const verified = new Map([
      ["m-low", 1],
      ["m-mid", 12],
      ["m-high", 99],
    ]);
    expect(ids(lockedStandardOrder(rows, verified))).toEqual(["high", "mid", "low"]);
  });

  it("treats a merchant with no verified redemptions as zero, not as missing", () => {
    const rows = [deal("unknown", { merchant_id: "m-new" }), deal("known", { merchant_id: "m-old" })];
    expect(ids(lockedStandardOrder(rows, new Map([["m-old", 3]])))).toEqual([
      "known",
      "unknown",
    ]);
  });

  it("breaks ties by newest, then by id, so order is stable across renders", () => {
    // Two deals from merchants with equal counts must not swap places between a
    // cached read and a live one.
    const rows = [
      deal("b", { merchant_id: "m1", starts_at: "2026-07-26T08:00:00Z" }),
      deal("a", { merchant_id: "m2", starts_at: "2026-07-26T08:00:00Z" }),
      deal("c", { merchant_id: "m1", starts_at: "2026-07-26T12:00:00Z" }),
    ];
    const verified = new Map([
      ["m1", 5],
      ["m2", 5],
    ]);
    const once = ids(lockedStandardOrder(rows, verified));
    const twice = ids(lockedStandardOrder([...rows].reverse(), verified));
    expect(once).toEqual(["c", "a", "b"]);
    expect(twice).toEqual(once);
  });
});
