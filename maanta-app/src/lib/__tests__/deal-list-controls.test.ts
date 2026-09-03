import { describe, expect, it } from "vitest";
import {
  filterDealRowsByRail,
  sortDealRows,
} from "@/lib/deal-list-controls";
import type { DealRow } from "@/lib/data";

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
    is_paused: false,
    max_claims: null,
    claims_count: 0,
    claims_reserved: 0,
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

describe("deal-list-controls", () => {
  it("filters deals by rail", () => {
    const rows = [
      deal("1", { deal_type: "flash" }),
      deal("2", { boost_active: true }),
      deal("3"),
    ];
    expect(filterDealRowsByRail(rows, "flash").map((d) => d.id)).toEqual(["1"]);
    expect(filterDealRowsByRail(rows, "boosted").map((d) => d.id)).toEqual(["2"]);
  });

  it("sorts deals by nearest origin", () => {
    const origin = { lat: -1.274, lng: 36.85 };
    const rows = [
      deal("far", {
        merchants: {
          ...deal("far").merchants!,
          lat: -1.4,
          lng: 36.85,
        },
      }),
      deal("near"),
    ];
    expect(sortDealRows(rows, "nearest", origin).map((d) => d.id)).toEqual([
      "near",
      "far",
    ]);
  });
});
