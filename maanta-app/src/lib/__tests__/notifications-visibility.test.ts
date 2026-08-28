import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsPage from "@/app/(shopper)/notifications/page";
import {
  PUBLIC_MERCHANT_CONDITIONS,
  VERIFICATION_BLOCKING_MERCHANT_STATUSES,
} from "@/lib/merchant-visibility";

/**
 * D215 + D216 — the notifications inbox, implemented together because they meet
 * in one helper.
 *
 * D215: the inbox applied no merchant-visibility gate, so a merchant suspended
 * or shadow-banned AFTER a shopper favourited them kept generating "New deal
 * from a saved shop". Shadow-ban is the sharp case: its purpose is that the
 * merchant does not know they are hidden.
 *
 * D216: no `is_demo` predicate in either direction, so a synthetic deal could
 * notify a real shopper in launch mode — the D189 contamination shape, arriving
 * as a push rather than a passive listing.
 *
 * They are coupled: `withPublicMerchant` defaults to excluding demo rows, so
 * adopting it for D215 without threading `includeDemo` would break D216's
 * requirement that demo mode keeps working.
 *
 * Behavioural: the page is executed and the filters it actually applies per
 * table are recorded. Two scopes are deliberately distinguished —
 *
 *   - the saved-shop DEALS read is discovery and carries the full policy;
 *   - the two REDEMPTION reads are the shopper's own live commitments and
 *     carry demo exclusion only. `verify_redemption` has no merchant status or
 *     shadow-ban check, so a ticket claimed before suspension still verifies;
 *     hiding "your code expires soon" would strip the deadline from a live
 *     ticket.
 */

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

type Filters = Array<[string, unknown]>;
const byTable: Record<string, Filters[]> = {};
const selects: Record<string, string[]> = {};
let demoEnabled = false;

vi.mock("@/lib/demo-mode", () => ({
  isDemoModeEnabled: () => Promise.resolve(demoEnabled),
}));

vi.mock("@/lib/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data")>()),
  getAppUser: () => Promise.resolve({ id: "user-1" }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: (table: string) => {
      const filters: Filters = [];
      (byTable[table] ??= []).push(filters);
      const rows = table === "merchant_favourites" ? [{ merchant_id: "m-1" }] : [];
      const builder: Record<string, unknown> = {};
      builder.select = (cols: string) => ((selects[table] ??= []).push(cols), builder);
      builder.eq = (c: string, v: unknown) => (filters.push([c, v]), builder);
      builder.gt = (c: string, v: unknown) => (filters.push([c, v]), builder);
      builder.lt = (c: string, v: unknown) => (filters.push([c, v]), builder);
      builder.in = (c: string, v: unknown) => (filters.push([c, v]), builder);
      builder.not = (c: string, op: string, v: unknown) => (filters.push([`not.${c}.${op}`, v]), builder);
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return builder;
    },
  }),
}));

const cols = (f: Filters) => f.map(([c]) => c);
const dealsQuery = () => byTable["deals"][0];
const redemptionQueries = () => byTable["redemptions"];

beforeEach(() => {
  for (const k of Object.keys(byTable)) delete byTable[k];
  for (const k of Object.keys(selects)) delete selects[k];
  demoEnabled = false;
});

describe("notifications follow the canonical public merchant-visibility policy (D215)", () => {
  it("applies every condition the policy names, not a hand-written subset", async () => {
    await NotificationsPage();

    // Derived from the policy itself, so adding a fourth condition to
    // PUBLIC_MERCHANT_CONDITIONS fails here until this surface carries it.
    for (const c of PUBLIC_MERCHANT_CONDITIONS) {
      expect(dealsQuery()).toContainEqual([`merchants.${c.column}`, c.value]);
    }
  });

  it("cannot be satisfied by a suspended or shadow-banned merchant", async () => {
    await NotificationsPage();

    expect(dealsQuery()).toContainEqual(["merchants.status", "active"]);
    expect(dealsQuery()).toContainEqual(["merchants.is_shadow_banned", false]);
    expect(dealsQuery()).toContainEqual(["merchants.is_visible", true]);
  });

  it("joins merchants with !inner, or the merchant predicates would not exclude rows", async () => {
    // PostgREST nulls the embed on a left join instead of dropping the row, so
    // without !inner every assertion above would pass while the gate did nothing.
    await NotificationsPage();

    for (const sel of selects["deals"]) expect(sel).toContain("merchants!inner");
    for (const sel of selects["redemptions"]) expect(sel).toContain("merchants!inner");
  });
});

describe("demo predicates follow isDemoModeEnabled() (D216)", () => {
  it("excludes synthetic deals AND synthetic merchants in launch mode", async () => {
    demoEnabled = false;
    await NotificationsPage();

    expect(dealsQuery()).toContainEqual(["is_demo", false]);
    expect(dealsQuery()).toContainEqual(["merchants.is_demo", false]);
  });

  it("keeps demo-mode notifications available when demo mode is ON", async () => {
    // The marketplace doubles as a sales-demonstration surface, so suppressing
    // these in demo mode would be over-correcting past the defect.
    demoEnabled = true;
    await NotificationsPage();

    expect(cols(dealsQuery())).not.toContain("is_demo");
    expect(cols(dealsQuery())).not.toContain("merchants.is_demo");
  });

  it("excludes synthetic merchants from the shopper's own redemptions too", async () => {
    // D188: claim_deal never sets redemptions.is_demo, so a claim against a
    // synthetic merchant is tagged false. Filtering the row alone would let a
    // demo shop's NAME render in launch mode.
    demoEnabled = false;
    await NotificationsPage();

    expect(redemptionQueries()).not.toHaveLength(0);
    for (const q of redemptionQueries()) {
      expect(q).toContainEqual(["is_demo", false]);
      expect(q).toContainEqual(["merchants.is_demo", false]);
    }
  });

  it("does not filter demo on redemptions when demo mode is ON", async () => {
    demoEnabled = true;
    await NotificationsPage();

    for (const q of redemptionQueries()) {
      expect(cols(q)).not.toContain("is_demo");
    }
  });
});

describe("the shopper's own live commitments keep their notices", () => {
  it("keeps the notice for a hidden or shadow-banned merchant, whose tickets still verify", async () => {
    // Redeemability, not visibility. `requireMerchant` blocks only suspended /
    // rejected / churned; a hidden or shadow-banned merchant CAN still verify,
    // so gating on the discovery policy would strip the deadline from a live,
    // redeemable ticket. `status = 'active'` would also wrongly drop `pending`.
    demoEnabled = false;
    await NotificationsPage();

    for (const q of redemptionQueries()) {
      expect(cols(q)).not.toContain("merchants.is_shadow_banned");
      expect(cols(q)).not.toContain("merchants.is_visible");
      expect(q).not.toContainEqual(["merchants.status", "active"]);
    }
  });

  it("drops the expiry notice when the merchant cannot verify at all", async () => {
    // requireMerchant("can_verify") returns 403 for these BEFORE
    // verify_redemption runs, so the ticket cannot be redeemed through the
    // product and an expiry deadline on it is false urgency. Derived from the
    // same constant the route enforces, so adding a blocked status there
    // fails here until this surface carries it.
    demoEnabled = false;
    await NotificationsPage();

    const pendingQuery = redemptionQueries()[0];
    const blocked = pendingQuery.find(([c]) => c === "not.merchants.status.in");
    expect(blocked).toBeDefined();
    for (const status of VERIFICATION_BLOCKING_MERCHANT_STATUSES) {
      expect(String(blocked![1])).toContain(status);
    }
  });

  it("still scopes both redemption reads to the signed-in shopper", async () => {
    await NotificationsPage();

    for (const q of redemptionQueries()) {
      expect(q).toContainEqual(["user_id", "user-1"]);
    }
  });
});

describe("the paused predicate survives this change (D214)", () => {
  it("still excludes paused deals", async () => {
    await NotificationsPage();
    expect(dealsQuery()).toContainEqual(["is_paused", false]);
    expect(dealsQuery()).toContainEqual(["is_active", true]);
  });
});
