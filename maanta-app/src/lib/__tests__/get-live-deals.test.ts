import { beforeEach, describe, expect, it, vi } from "vitest";

// getLiveDeals must distinguish a hard query FAILURE from a genuine empty
// result: on error it throws (so the feed error boundary shows "we couldn't
// load deals"), and on success it partitions deals into flash / boosted /
// nearMe. Without this, a transient DB error looked identical to "no deals".

let dealsResult: { data: unknown; error: unknown } = { data: [], error: null };
let redemptionsResult: { data: unknown; error: unknown } = { data: [], error: null };

/** A chainable, awaitable query stub: every method returns itself; awaiting it
 *  resolves to the per-table result. A Proxy handles any builder method
 *  (eq/gt/order/limit/in/or/is/…) without enumerating them. */
function makeQuery(result: { data: unknown; error: unknown }) {
  const q: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
        }
        return () => q;
      },
    }
  );
  return q;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) =>
      makeQuery(table === "deals" ? dealsResult : redemptionsResult),
  }),
}));

import { getLiveDeals } from "@/lib/data";

describe("getLiveDeals — error vs empty", () => {
  beforeEach(() => {
    dealsResult = { data: [], error: null };
    redemptionsResult = { data: [], error: null };
  });

  it("throws when the deals query errors (so the error boundary shows, not the empty state)", async () => {
    dealsResult = { data: null, error: { message: "connection reset" } };
    await expect(getLiveDeals("BBS Mall")).rejects.toBeTruthy();
  });

  it("returns empty rails (no throw) when there are genuinely no deals", async () => {
    dealsResult = { data: [], error: null };
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash).toEqual([]);
    expect(res.boosted).toEqual([]);
    expect(res.nearMe).toEqual([]);
  });

  it("partitions live deals into flash / boosted / nearMe", async () => {
    const merchants = { id: "m1", merchant_name: "Shop", is_visible: true };
    dealsResult = {
      data: [
        { id: "d1", merchant_id: "m1", deal_type: "flash", boost_active: false, merchants },
        { id: "d2", merchant_id: "m1", deal_type: "standard", boost_active: true, merchants },
        { id: "d3", merchant_id: "m1", deal_type: "standard", boost_active: false, merchants },
      ],
      error: null,
    };
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash.map((d) => d.id)).toEqual(["d1"]);
    expect(res.boosted.map((d) => d.id)).toEqual(["d2"]);
    expect(res.nearMe.map((d) => d.id)).toEqual(["d3"]);
  });
});
