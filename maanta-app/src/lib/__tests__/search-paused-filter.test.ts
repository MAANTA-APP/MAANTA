import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "@/app/(shopper)/search/page";

/**
 * D119 — `/search` was the one shopper discovery surface that did not filter
 * paused deals. `/feed`, `/browse` and `/map` read through `getLiveDeals`, and
 * the SQL `deals_public_browse` view carries `is_paused IS NOT TRUE` (D32);
 * `src/app/(shopper)/search/page.tsx` builds its own query and had no such
 * predicate, so a paused deal stayed reachable by searching for it — and both
 * `/feed` rails link into it (`/search?type=flash`, `/search?type=boosted`).
 *
 * Behavioural, not a source grep: the page is executed and the filters it
 * actually applies are recorded, per query. Both text paths are covered — the
 * title match and the shop-name match — because they are two separate selects
 * and a fix to one is not a fix to the other.
 */

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoModeEnabled: () => Promise.resolve(false),
}));

type Filters = Array<[string, unknown]>;
const queries: Filters[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    // `getVerifiedCounts` goes through an RPC, not the table builder.
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: () => {
      const filters: Filters = [];
      queries.push(filters);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.gt = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.ilike = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.limit = () => builder;
      builder.order = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  }),
}));


function pausedFilters(filters: Filters) {
  return filters.filter(([col]) => col === "is_paused");
}

beforeEach(() => {
  queries.length = 0;
});

describe("/search excludes paused deals (D119)", () => {
  it("filters is_paused on the title-match query", async () => {
    await SearchPage({ searchParams: { q: "abaya" } });

    const titleQuery = queries[0];
    expect(titleQuery).toContainEqual(["title", "%abaya%"]);
    expect(pausedFilters(titleQuery)).toEqual([["is_paused", false]]);
  });

  it("filters is_paused on the shop-name-match query", async () => {
    await SearchPage({ searchParams: { q: "skandi" } });

    const shopQuery = queries.find((f) =>
      f.some(([col]) => col === "merchants.merchant_name")
    );
    expect(shopQuery).toBeDefined();
    expect(pausedFilters(shopQuery!)).toEqual([["is_paused", false]]);
  });

  it("filters is_paused on a type-only search, which is how the feed rails link in", async () => {
    await SearchPage({ searchParams: { type: "boosted" } });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContainEqual(["boost_active", true]);
    expect(pausedFilters(queries[0])).toEqual([["is_paused", false]]);
  });

  it("applies the filter to every deal query the page issues", async () => {
    await SearchPage({ searchParams: { q: "abaya", type: "flash" } });

    // Two selects on `deals` (title, shop name); neither may be the exception.
    expect(queries).toHaveLength(2);
    for (const filters of queries) {
      expect(pausedFilters(filters)).toEqual([["is_paused", false]]);
    }
  });
});
