import { beforeEach, describe, expect, it, vi } from "vitest";

// getLiveDeals must distinguish a hard query FAILURE from a genuine empty
// result: on error it throws (so the feed error boundary shows "we couldn't
// load deals"), and on success it partitions deals into flash / boosted /
// nearMe. Without this, a transient DB error looked identical to "no deals".
// When merchants.lat/lng are missing on the remote, it retries without those
// columns instead of hard-failing the feed.
//
// Feed loads use three bucket queries (flash / boosted / standard) plus an
// RPC for verified counts — mocks must support both.

type DealFixture = {
  id: string;
  merchant_id: string;
  deal_type: "flash" | "standard";
  boost_active: boolean;
  /** Omitted means a real deal. Set true to assert demo rows are excluded. */
  is_demo?: boolean;
  /** Omitted means not paused (feed default). Set true to assert pause filter. */
  is_paused?: boolean;
  /** Only needed by the locked-order tests; other fixtures leave them unset. */
  expires_at?: string | null;
  starts_at?: string;
  merchants: Record<string, unknown>;
};

/** Columns applied by the live-deal query that fixtures don't need to model. */
const IGNORED_EQ_COLS = new Set([
  "is_active",
  "node",
  "merchants.status",
  "merchants.is_visible",
  "merchants.is_shadow_banned",
]);

let dealsFixture: DealFixture[] = [];
let dealsError: { code?: string; message: string } | null = null;
let verifiedRpc: { data: unknown; error: unknown } = { data: [], error: null };

function makeDealsQuery() {
  const state: {
    eqs: Record<string, unknown>;
    neqs: Record<string, unknown>;
    limit: number | null;
    select: string;
  } = { eqs: {}, neqs: {}, limit: null, select: "" };

  const q: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => {
            // Missing lat/lng: fail only the select that asks for lat/lng columns.
            if (
              dealsError?.code === "PGRST204" &&
              state.select.includes("lat, lng")
            ) {
              return Promise.resolve({ data: null, error: dealsError }).then(resolve);
            }
            if (dealsError && dealsError.code !== "PGRST204") {
              return Promise.resolve({ data: null, error: dealsError }).then(resolve);
            }
            let rows = [...dealsFixture].map((r) => ({
              ...r,
              // Fixtures model REAL deals unless they say otherwise, so the
              // is_demo=false predicate is exercised rather than ignored: a
              // fixture with is_demo:true must genuinely be filtered out.
              is_demo: "is_demo" in r ? r.is_demo : false,
              // Same for pause: live feed excludes is_paused=true.
              is_paused: "is_paused" in r ? r.is_paused : false,
              merchants: {
                ...r.merchants,
                lat: "lat" in r.merchants ? r.merchants.lat : null,
                lng: "lng" in r.merchants ? r.merchants.lng : null,
              },
            }));
            for (const [col, val] of Object.entries(state.eqs)) {
              if (IGNORED_EQ_COLS.has(col) || col.startsWith("merchants.")) continue;
              rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val);
            }
            for (const [col, val] of Object.entries(state.neqs)) {
              rows = rows.filter((r) => (r as Record<string, unknown>)[col] !== val);
            }
            if (state.limit != null) rows = rows.slice(0, state.limit);
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          };
        }
        if (prop === "select") {
          return (s: string) => {
            state.select = s;
            return q;
          };
        }
        if (prop === "eq") {
          return (col: string, val: unknown) => {
            state.eqs[col] = val;
            return q;
          };
        }
        if (prop === "neq") {
          return (col: string, val: unknown) => {
            state.neqs[col] = val;
            return q;
          };
        }
        if (prop === "limit") {
          return (n: number) => {
            state.limit = n;
            return q;
          };
        }
        return () => q;
      },
    }
  );
  return q;
}

/**
 * The boosted rail's locked order ("most recently boosted first") reads
 * `boost_flags.starts_at` in a second query. Fixtures default to empty, which
 * exercises the degraded path: no boost start times → newest-first fallback,
 * never a thrown feed.
 */
let boostFlagsFixture: { deal_id: string; starts_at: string }[] = [];
let boostFlagsError: { message: string } | null = null;

function makeBoostFlagsQuery() {
  const state: { ins: string[] | null } = { ins: null };
  const q: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => {
            if (boostFlagsError) {
              return Promise.resolve({ data: null, error: boostFlagsError }).then(resolve);
            }
            const rows = state.ins
              ? boostFlagsFixture.filter((r) => state.ins!.includes(r.deal_id))
              : boostFlagsFixture;
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          };
        }
        if (prop === "in") {
          return (_col: string, vals: string[]) => {
            state.ins = vals;
            return q;
          };
        }
        return () => q;
      },
    }
  );
  return q;
}

// Records the key every cached read is filed under. The demo flag must be part
// of it: resolved inside the cached function instead, a demo-mode toggle would
// keep serving the previous answer for the whole revalidate window.
const cache = vi.hoisted(() => ({ keys: [] as string[][] }));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, keys: string[]) => {
    cache.keys.push(keys);
    return () => fn();
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "deals") return makeDealsQuery();
      if (table === "boost_flags") return makeBoostFlagsQuery();
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (name: string) => {
      if (name !== "verified_counts_by_merchant") {
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
      }
      return Promise.resolve(verifiedRpc);
    },
  }),
}));

import { getLiveDeals, getVerifiedCounts, isMissingLatLngColumnError } from "@/lib/data";

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

describe("getVerifiedCounts", () => {
  beforeEach(() => {
    verifiedRpc = { data: [], error: null };
  });

  it("maps RPC rows into a Map", async () => {
    verifiedRpc = {
      data: [
        { merchant_id: "m1", verified_count: 12 },
        { merchant_id: "m2", verified_count: "3" },
      ],
      error: null,
    };
    const map = await getVerifiedCounts(["m1", "m2", "m1"]);
    expect(map.get("m1")).toBe(12);
    expect(map.get("m2")).toBe(3);
  });

  it("throws when the RPC errors", async () => {
    verifiedRpc = { data: null, error: { message: "boom" } };
    await expect(getVerifiedCounts(["m1"])).rejects.toBeTruthy();
  });
});

describe("getLiveDeals — error vs empty", () => {
  beforeEach(() => {
    dealsFixture = [];
    dealsError = null;
    verifiedRpc = { data: [], error: null };
    boostFlagsFixture = [];
    boostFlagsError = null;
  });

  it("throws when the deals query errors (so the error boundary shows, not the empty state)", async () => {
    dealsError = { message: "connection reset" };
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
    dealsError = {
      code: "PGRST204",
      message: "Could not find the 'lat' column of 'merchants' in the schema cache",
    };
    dealsFixture = [
      {
        id: "d1",
        merchant_id: "m1",
        deal_type: "standard",
        boost_active: false,
        merchants,
      },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.nearMe.map((d) => d.id)).toEqual(["d1"]);
    expect(res.nearMe[0]?.merchants?.lat).toBeNull();
    expect(res.nearMe[0]?.merchants?.lng).toBeNull();
  });

  // Demo mode is unreachable here (the mock has no app_config table, so the
  // config read throws), which is the fail-safe path: an unreadable flag must
  // resolve to "exclude demo" rather than leaking synthetic rows into the feed.
  it("excludes demo deals from the feed when demo mode cannot be confirmed", async () => {
    const merchants = {
      id: "m1",
      merchant_name: "Shop",
      is_visible: true,
      status: "active",
      is_shadow_banned: false,
    };
    dealsFixture = [
      { id: "real", merchant_id: "m1", deal_type: "standard", boost_active: false, merchants },
      {
        id: "synthetic",
        merchant_id: "m1",
        deal_type: "standard",
        boost_active: false,
        is_demo: true,
        merchants,
      },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.nearMe.map((d) => d.id)).toEqual(["real"]);
  });

  it("keys the cache entry on the demo flag, so a toggle isn't served stale", async () => {
    cache.keys.length = 0;
    await getLiveDeals("BBS Mall");
    expect(cache.keys).toHaveLength(1);
    expect(cache.keys[0]).toEqual(["live-deals", "BBS Mall", "real"]);
  });

  it("returns empty rails (no throw) when there are genuinely no deals", async () => {
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash).toEqual([]);
    expect(res.boosted).toEqual([]);
    expect(res.nearMe).toEqual([]);
  });

  it("loads flash / boosted / nearMe from separate bucket queries", async () => {
    const merchants = { id: "m1", merchant_name: "Shop", is_visible: true };
    dealsFixture = [
      { id: "d1", merchant_id: "m1", deal_type: "flash", boost_active: false, merchants },
      { id: "d2", merchant_id: "m1", deal_type: "standard", boost_active: true, merchants },
      { id: "d3", merchant_id: "m1", deal_type: "standard", boost_active: false, merchants },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash.map((d) => d.id)).toEqual(["d1"]);
    expect(res.boosted.map((d) => d.id)).toEqual(["d2"]);
    expect(res.nearMe.map((d) => d.id)).toEqual(["d3"]);
  });

  it("returns enough rows to surface elite seed inventory (100 flash + 100 standard)", async () => {
    const merchants = {
      id: "m1",
      merchant_name: "Elite Shop",
      is_visible: true,
      status: "active",
      is_shadow_banned: false,
    };
    dealsFixture = [];
    for (let i = 1; i <= 100; i++) {
      dealsFixture.push({
        id: `flash-${i}`,
        merchant_id: `m${i}`,
        deal_type: "flash",
        boost_active: false,
        merchants: { ...merchants, id: `m${i}` },
      });
      dealsFixture.push({
        id: `std-${i}`,
        merchant_id: `m${i}`,
        deal_type: "standard",
        boost_active: false,
        merchants: { ...merchants, id: `m${i}` },
      });
    }
    const res = await getLiveDeals("BBS Mall");
    expect(res.flash).toHaveLength(100);
    expect(res.nearMe).toHaveLength(100);
    expect(res.flash[0]?.id).toMatch(/^flash-/);
    expect(res.nearMe[0]?.id).toMatch(/^std-/);
  });

  it("excludes paused deals from every rail (parity with claim_deal + merchant copy)", async () => {
    const merchants = { id: "m1", merchant_name: "Shop", is_visible: true };
    dealsFixture = [
      { id: "live", merchant_id: "m1", deal_type: "standard", boost_active: false, merchants },
      {
        id: "paused",
        merchant_id: "m1",
        deal_type: "standard",
        boost_active: false,
        is_paused: true,
        merchants,
      },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.nearMe.map((d) => d.id)).toEqual(["live"]);
  });
});

/**
 * The locked feed structure is applied in getLiveDeals, server-side, so it lands
 * in the 30s cache already ordered and the page cannot undo it. These assert the
 * ordering end-to-end rather than only at the comparator level — the pre-2026-07-30
 * bug was not a wrong comparator, it was a correct one being discarded downstream.
 */
describe("getLiveDeals — locked feed order (decision D1)", () => {
  const merchants = { id: "m1", merchant_name: "Shop", is_visible: true };

  beforeEach(() => {
    dealsFixture = [];
    dealsError = null;
    verifiedRpc = { data: [], error: null };
    boostFlagsFixture = [];
    boostFlagsError = null;
  });

  it("returns the flash rail soonest-expiry first", () => {
    dealsFixture = [
      { id: "late", merchant_id: "m1", deal_type: "flash", boost_active: false, expires_at: "2026-07-26T23:00:00Z", merchants },
      { id: "soon", merchant_id: "m1", deal_type: "flash", boost_active: false, expires_at: "2026-07-26T09:00:00Z", merchants },
    ];
    return getLiveDeals("BBS Mall").then((res) => {
      expect(res.flash.map((d) => d.id)).toEqual(["soon", "late"]);
    });
  });

  it("returns the boosted rail most-recently-boosted first", async () => {
    dealsFixture = [
      { id: "older-boost", merchant_id: "m1", deal_type: "standard", boost_active: true, merchants },
      { id: "newer-boost", merchant_id: "m1", deal_type: "standard", boost_active: true, merchants },
    ];
    boostFlagsFixture = [
      { deal_id: "older-boost", starts_at: "2026-07-26T06:00:00Z" },
      { deal_id: "newer-boost", starts_at: "2026-07-26T18:00:00Z" },
    ];
    const res = await getLiveDeals("BBS Mall");
    expect(res.boosted.map((d) => d.id)).toEqual(["newer-boost", "older-boost"]);
  });

  it("still renders the boosted rail when the boost-times query fails", async () => {
    // Degrade, never throw: a broken paid-rail order for one render beats a
    // blank feed. Falls back to newest-first.
    dealsFixture = [
      { id: "a", merchant_id: "m1", deal_type: "standard", boost_active: true, starts_at: "2026-07-26T05:00:00Z", merchants },
      { id: "b", merchant_id: "m1", deal_type: "standard", boost_active: true, starts_at: "2026-07-26T15:00:00Z", merchants },
    ];
    boostFlagsError = { message: "boost_flags unavailable" };
    const res = await getLiveDeals("BBS Mall");
    expect(res.boosted.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("returns the standard rail by all-time verified redemptions descending", async () => {
    dealsFixture = [
      { id: "quiet", merchant_id: "m-quiet", deal_type: "standard", boost_active: false, merchants },
      { id: "busy", merchant_id: "m-busy", deal_type: "standard", boost_active: false, merchants },
    ];
    verifiedRpc = {
      data: [
        { merchant_id: "m-quiet", verified_count: 2 },
        { merchant_id: "m-busy", verified_count: 87 },
      ],
      error: null,
    };
    const res = await getLiveDeals("BBS Mall");
    expect(res.nearMe.map((d) => d.id)).toEqual(["busy", "quiet"]);
  });
});
