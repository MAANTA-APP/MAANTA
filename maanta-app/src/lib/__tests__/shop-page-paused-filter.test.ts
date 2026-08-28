import { beforeEach, describe, expect, it, vi } from "vitest";
import ShopPage from "@/app/(shopper)/shops/[id]/page";

/**
 * D25/D119 — the shop storefront was the surface that still did not filter
 * paused deals.
 *
 * `/feed`, `/browse` and `/map` read through `getLiveDeals`, which carries
 * `is_paused = false`; the SQL `deals_public_browse` view carries
 * `is_paused IS NOT TRUE` (D32); `/search` builds its own query and was fixed
 * in D119. `shops/[id]/page.tsx` builds its own query too and had no such
 * predicate, so a paused deal stayed listed under a heading that says
 * **"Live deals"** while `claim_deal` raises `deal_paused` for it.
 *
 * Behavioural, not a source grep: the page is executed and the filters it
 * actually applies to `deals` are recorded. A source scan would pass on a
 * commented-out predicate and fail on an equivalent rewrite.
 */

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoModeEnabled: () => Promise.resolve(false),
}));

// Only the auth-backed read is stubbed. `withPublicMerchantRows` stays REAL, so
// the merchant gate this page relies on is exercised rather than faked away.
vi.mock("@/lib/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data")>()),
  getAppUser: () => Promise.resolve(null),
  getVerifiedCounts: () => Promise.resolve(new Map<string, number>()),
}));

type Filters = Array<[string, unknown]>;
const dealQueries: Filters[] = [];

const SHOP = {
  id: "shop-1",
  merchant_name: "Test Shop",
  mall_name: "BBS Mall",
  node: "BBS Mall",
  floor: "1st Floor",
  unit_number: "B-14",
  what3words_address: null,
  lat: null,
  lng: null,
  status: "active",
  is_visible: true,
  is_shadow_banned: false,
};

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: (table: string) => {
      const filters: Filters = [];
      if (table === "deals") dealQueries.push(filters);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.gt = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.limit = () => builder;
      builder.order = () => builder;
      builder.maybeSingle = () =>
        Promise.resolve({ data: table === "merchants" ? SHOP : null, error: null });
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  }),
}));

const pausedFilters = (filters: Filters) => filters.filter(([col]) => col === "is_paused");

beforeEach(() => {
  dealQueries.length = 0;
});

describe("the shop storefront excludes paused deals (D25/D119)", () => {
  it("filters is_paused on the deals query", async () => {
    await ShopPage({ params: { id: "shop-1" } });

    expect(dealQueries).not.toHaveLength(0);
    expect(pausedFilters(dealQueries[0])).toEqual([["is_paused", false]]);
  });

  it("applies it to every deals query the page issues", async () => {
    await ShopPage({ params: { id: "shop-1" } });

    // If this page ever issues a second deals select, it is not exempt.
    for (const filters of dealQueries) {
      expect(pausedFilters(filters)).toEqual([["is_paused", false]]);
    }
  });

  it("keeps the other liveness filters, so the paused fix does not replace them", async () => {
    // A "fix" that swapped is_active or the expiry bound for is_paused would
    // trade one discovery leak for another.
    await ShopPage({ params: { id: "shop-1" } });

    const filters = dealQueries[0];
    expect(filters).toContainEqual(["is_active", true]);
    expect(filters.some(([col]) => col === "expires_at")).toBe(true);
  });
});
