import { describe, expect, it } from "vitest";
import {
  dealExpiryLabel,
  dealRail,
  dealsToPins,
  filterBrowseDeals,
  isEndingSoon,
  isLiveNow,
  parseBrowseChip,
} from "@/lib/browse";
import type { DealRow } from "@/lib/data";

function deal(partial: Partial<DealRow> & { id: string }): DealRow {
  return {
    merchant_id: "m1",
    node: "BBS Mall",
    title: "Deal",
    description: null,
    image_url: "",
    deal_type: "standard",
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
    starts_at: new Date("2026-07-26T08:00:00Z").toISOString(),
    expires_at: new Date("2026-07-26T20:00:00Z").toISOString(),
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

describe("browse helpers", () => {
  it("parses browse chip URL param", () => {
    expect(parseBrowseChip(null)).toBe("all");
    expect(parseBrowseChip("flash")).toBe("flash");
    expect(parseBrowseChip("bogus")).toBe("all");
  });

  it("classifies flash / boosted / standard rails", () => {
    expect(dealRail(deal({ id: "1", deal_type: "flash" }))).toBe("flash");
    expect(
      dealRail(deal({ id: "2", deal_type: "standard", boost_active: true }))
    ).toBe("boosted");
    expect(dealRail(deal({ id: "3" }))).toBe("standard");
  });

  it("filters by rail and live-now", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const deals = [
      deal({ id: "flash", deal_type: "flash" }),
      deal({
        id: "later",
        starts_at: new Date("2026-07-27T08:00:00Z").toISOString(),
        expires_at: new Date("2026-07-27T20:00:00Z").toISOString(),
      }),
    ];
    expect(filterBrowseDeals(deals, { rail: "flash" }).map((d) => d.id)).toEqual([
      "flash",
    ]);
    expect(
      filterBrowseDeals(deals, { time: "now", now }).map((d) => d.id)
    ).toEqual(["flash"]);
    expect(isLiveNow(deals[1], now)).toBe(false);
  });

  it("filters by browse chips: ending soon, flash, favourites", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const deals = [
      deal({
        id: "flash-soon",
        deal_type: "flash",
        merchant_id: "m-fav",
        expires_at: new Date("2026-07-26T16:00:00Z").toISOString(),
      }),
      deal({
        id: "standard-later",
        merchant_id: "m-other",
        expires_at: new Date("2026-07-28T12:00:00Z").toISOString(),
      }),
      deal({
        id: "boosted-fav",
        deal_type: "standard",
        boost_active: true,
        merchant_id: "m-fav",
        expires_at: new Date("2026-07-27T12:00:00Z").toISOString(),
      }),
    ];

    expect(isEndingSoon(deals[0], now)).toBe(true);
    expect(isEndingSoon(deals[1], now)).toBe(false);

    expect(
      filterBrowseDeals(deals, { chip: "flash", now }).map((d) => d.id)
    ).toEqual(["flash-soon"]);

    expect(
      filterBrowseDeals(deals, {
        chip: "favourites",
        favouriteMerchantIds: new Set(["m-fav"]),
        now,
      }).map((d) => d.id)
    ).toEqual(["flash-soon", "boosted-fav"]);

    expect(
      filterBrowseDeals(deals, { chip: "ending_soon", now }).map((d) => d.id)
    ).toEqual(["flash-soon"]);
  });

  it("filters list to map viewport bounds", () => {
    const deals = [
      deal({ id: "in", merchants: {
        id: "m1",
        merchant_name: "In",
        floor: null,
        unit_number: null,
        what3words_address: "a.b.c",
        lat: -1.27,
        lng: 36.85,
        mall_name: null,
        node: "BBS Mall",
      }}),
      deal({ id: "out", merchants: {
        id: "m2",
        merchant_name: "Out",
        floor: null,
        unit_number: null,
        what3words_address: "d.e.f",
        lat: -1.4,
        lng: 36.85,
        mall_name: null,
        node: "BBS Mall",
      }}),
    ];
    const bounds = { south: -1.28, west: 36.84, north: -1.26, east: 36.86 };
    expect(
      filterBrowseDeals(deals, { bounds }).map((d) => d.id)
    ).toEqual(["in"]);
  });

  it("builds pins only for deals with lat/lng", () => {
    const deals = [
      deal({ id: "with" }),
      deal({
        id: "without",
        merchants: {
          id: "m2",
          merchant_name: "No GPS",
          floor: null,
          unit_number: null,
          what3words_address: "a.b.c",
          lat: null,
          lng: null,
          mall_name: null,
          node: "BBS Mall",
        },
      }),
    ];
    const pins = dealsToPins(deals);
    expect(pins).toHaveLength(1);
    expect(pins[0].dealId).toBe("with");
    expect(pins[0].what3wordsAddress).toBe("filled.count.soap");
  });

  it("formats deal expiry countdown labels", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const label = dealExpiryLabel("2026-07-26T14:14:00Z", now);
    expect(label).toBe("Expires in 2h 14m");
  });
});
