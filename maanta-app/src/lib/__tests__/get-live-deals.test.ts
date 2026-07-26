import { beforeEach, describe, expect, it, vi } from "vitest";

// getLiveDeals must distinguish a hard query FAILURE from a genuine empty
// result: on error it throws (so the feed error boundary shows "we couldn't
// load deals"), and on success it partitions deals into flash / boosted /
// nearMe. Without this, a transient DB error looked identical to "no deals".
// When merchants.lat/lng are missing on the remote, it retries without those
// columns instead of hard-failing the feed.

let dealsQueue: Array<{ data: unknown; error: unknown }> = [];
let redemptionsResult: { data: unknown; error: unknown } = { data: [], error: null };

/** A chainable, awaitable query stub: every method returns itself; awaiting it
 *  resolves to the next queued deals result (or redemptions). */
function makeQuery(table: string) {
  const q: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => {
            const result =
              table === "deals"
                ? (dealsQueue.shift() ?? { data: [], error: null })
                : redemptionsResult;
            return Promise.resolve(result).then(resolve);
          };
        }
        return () => q;
      },
    }
  );
  return q;
}

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => () => fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => makeQuery(table),
  }),
}));

import { getLiveDeals, isMissingLatLngColumnError } from "@/lib/data";

describe("isMissingLatLngColumnError", () => {
  it("detects PostgREST schema-cache misses for lat/lng", () => {
    expect(
      isMissingLatLngColumnError({
        code: "PGRST204",
        message: "Could not find the 'lat' column of 'merchants' in the schema cache",
      })
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(
      isMissingLatLngColumnError({ code: "PGRST301", message: "JWT expired" })
    ).toBe(false);
  });
});

describe("getLiveDeals — error vs empty", () => {
  beforeEach(() => {
    dealsQueue = [];
    redemptionsResult = { data: [], error: null };
  });

  it("throws when the deals query errors (so the error boundary shows, not the empty state)", async () => {
    dealsQueue = [{ data: null, error: { message: "connection reset" } }];
    await expect(getLiveDeals("BBS Mall")).rejects.toBeTruthy();
  });

  it("retries without lat/lng when those columns are missing remotely", async () => {
    const merchants = {
      id: "m1",
      merchant_name: "Shop",
      is_visible: true,
      status: "active",
      is_shadow_banned: false,
    };
    dealsQueue = [
      {
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'lat' column of 'merchants' in the schema cache",
        },
      },
      {
        data: [
          {
            id: "d1",
            merchant_id: "m1",
            deal_type: "standard",
            boost_active: false,
            merchants,
          },
        ],
        error: null,
      },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.nearMe.map((d) => d.id)).toEqual(["d1"]);
    expect(res.nearMe[0]?.merchants?.lat).toBeNull();
    expect(res.nearMe[0]?.merchants?.lng).toBeNull();
  });

  it("returns empty rails (no throw) when there are genuinely no deals", async () => {
    dealsQueue = [{ data: [], error: null }];
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash).toEqual([]);
    expect(res.boosted).toEqual([]);
    expect(res.nearMe).toEqual([]);
  });

  it("partitions live deals into flash / boosted / nearMe", async () => {
    const merchants = { id: "m1", merchant_name: "Shop", is_visible: true };
    dealsQueue = [
      {
        data: [
          { id: "d1", merchant_id: "m1", deal_type: "flash", boost_active: false, merchants },
          { id: "d2", merchant_id: "m1", deal_type: "standard", boost_active: true, merchants },
          { id: "d3", merchant_id: "m1", deal_type: "standard", boost_active: false, merchants },
        ],
        error: null,
      },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash.map((d) => d.id)).toEqual(["d1"]);
    expect(res.boosted.map((d) => d.id)).toEqual(["d2"]);
    expect(res.nearMe.map((d) => d.id)).toEqual(["d3"]);
  });
});
