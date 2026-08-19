import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMerchantContext } from "@/lib/merchant";

/**
 * D129 — the consequence half.
 *
 * `getMerchantContext` links a pre-invited `merchant_staff` seat by matching
 * `public.users.phone` against `merchant_staff.phone`, behind `if (!staff &&
 * user.phone)`. A NULL column short-circuits that branch: the seat never links,
 * `can_verify` never applies, the user's role is never promoted, and the shop
 * assistant lands at the counter as an ordinary shopper with no verify keypad.
 *
 * The fix is in `ensureAppUserFromClerk` (backfill the mirror), so a test that
 * only asserts the write would pass against code where the seat still never
 * links. This asserts the outcome the merchant actually cares about, in both
 * directions.
 */

let appUser: Record<string, unknown> | null;
vi.mock("@/lib/data", () => ({
  getAppUser: () => Promise.resolve(appUser),
  getMerchantForUser: () => Promise.resolve(null), // not an owner: staff path
}));

let staffByUserId: Record<string, unknown> | null;
let staffByPhone: Record<string, unknown> | null;
let merchantRow: Record<string, unknown> | null;
const staffPhoneFilters: string[] = [];
const staffUpdates: Array<Record<string, unknown>> = [];
const userUpdates: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      let byPhone = false;
      let updating = false;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        if (table === "merchant_staff" && col === "phone") {
          byPhone = true;
          staffPhoneFilters.push(String(val));
        }
        return builder;
      };
      builder.is = () => builder;
      builder.update = (payload: Record<string, unknown>) => {
        updating = true;
        (table === "users" ? userUpdates : staffUpdates).push(payload);
        return builder;
      };
      builder.maybeSingle = () => {
        if (updating) return Promise.resolve({ data: null, error: null });
        if (table === "merchants") return Promise.resolve({ data: merchantRow, error: null });
        return Promise.resolve({
          data: byPhone ? staffByPhone : staffByUserId,
          error: null,
        });
      };
      // `.update().eq()` is awaited without maybeSingle in the link path.
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return builder;
    },
  }),
}));


const SEAT = {
  id: "seat-1",
  merchant_id: "merchant-1",
  user_id: null,
  can_verify: true,
  can_deals: false,
  can_topup: false,
  can_purchase: false,
};

beforeEach(() => {
  staffPhoneFilters.length = 0;
  staffUpdates.length = 0;
  userUpdates.length = 0;
  staffByUserId = null;
  staffByPhone = SEAT;
  merchantRow = { id: "merchant-1", merchant_name: "SKANDI SKAN" };
  appUser = { id: "u1", role: "customer", phone: "+254712345678" };
});

describe("getMerchantContext — pre-invited staff seat linking", () => {
  it("links the seat and applies its permissions once the user has a phone", async () => {
    const result = await getMerchantContext();

    expect(staffPhoneFilters).toEqual(["+254712345678"]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.ctx.isOwner).toBe(false);
    expect(result.ctx.permissions.can_verify).toBe(true);
    // First sign-in links the seat and promotes the role (wireframe 10aa).
    expect(staffUpdates).toEqual([{ user_id: "u1" }]);
    expect(userUpdates).toEqual([{ role: "merchant_staff" }]);
  });

  it("never links the seat while users.phone is NULL — the D129 failure at the counter", async () => {
    appUser = { id: "u1", role: "customer", phone: null };

    const result = await getMerchantContext();

    // The by-phone lookup is not even attempted, so the seat stays unclaimed and
    // the person has no verify screen. Nothing errors; that is the whole problem.
    expect(staffPhoneFilters).toEqual([]);
    expect(staffUpdates).toEqual([]);
    expect(userUpdates).toEqual([]);
    expect(result.status).toBe("no-merchant");
  });
});
