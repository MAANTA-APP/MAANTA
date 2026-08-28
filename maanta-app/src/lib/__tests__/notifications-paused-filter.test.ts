import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsPage from "@/app/(shopper)/notifications/page";

/**
 * D25/D119/D214 — `/notifications` is a shopper DISCOVERY surface: it renders
 * "New deal from a saved shop" for deals created in the last 24 hours. It
 * selects from `deals` directly rather than reading `getLiveDeals`, and had no
 * `is_paused` predicate, so a merchant who posted a deal and then paused it
 * within the window kept being advertised in the inbox.
 *
 * Third surface to make this exact mistake, all for the same reason. The audit
 * behind D214 checked every direct `deals` select: `getLiveDeals`, `/search`,
 * `shops/[id]` and this page are the shopper-discovery set, and the merchant,
 * admin and founder surfaces are deliberately outside the rule — `merchant/
 * redeem` filters `is_paused = true` on purpose, because a merchant must see
 * their own paused deals.
 *
 * Behavioural: the page is executed and the filters actually applied to `deals`
 * are recorded.
 */

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoModeEnabled: () => Promise.resolve(false),
}));

type Filters = Array<[string, unknown]>;
const dealQueries: Filters[] = [];

vi.mock("@/lib/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data")>()),
  getAppUser: () => Promise.resolve({ id: "user-1" }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: (table: string) => {
      const filters: Filters = [];
      if (table === "deals") dealQueries.push(filters);
      const rows = table === "merchant_favourites" ? [{ merchant_id: "m-1" }] : [];
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.gt = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.lt = (col: string, val: unknown) => (filters.push([col, val]), builder);
      builder.in = (col: string, val: unknown) => (filters.push([col, val]), builder);
      // The page gained `.not(...)` when D215 landed; recording it keeps this
      // guard executing the real page rather than a stale shape of it.
      builder.not = (col: string, op: string, val: unknown) =>
        (filters.push([`not.${col}.${op}`, val]), builder);
      builder.limit = () => builder;
      builder.order = () => builder;
      builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return builder;
    },
  }),
}));

const pausedFilters = (filters: Filters) => filters.filter(([col]) => col === "is_paused");

beforeEach(() => {
  dealQueries.length = 0;
});

describe("the notifications inbox excludes paused deals (D25/D119/D214)", () => {
  it("filters is_paused on the saved-shop deals query", async () => {
    await NotificationsPage();

    expect(dealQueries).not.toHaveLength(0);
    expect(pausedFilters(dealQueries[0])).toEqual([["is_paused", false]]);
  });

  it("applies it to every deals query the page issues", async () => {
    await NotificationsPage();

    for (const filters of dealQueries) {
      expect(pausedFilters(filters)).toEqual([["is_paused", false]]);
    }
  });

  it("keeps the other filters, so the paused fix does not replace them", async () => {
    // Swapping is_active or the 24h window for is_paused would trade one
    // wrong inbox entry for another.
    await NotificationsPage();

    const filters = dealQueries[0];
    expect(filters).toContainEqual(["is_active", true]);
    expect(filters.some(([col]) => col === "created_at")).toBe(true);
    expect(filters.some(([col]) => col === "merchant_id")).toBe(true);
  });
});
