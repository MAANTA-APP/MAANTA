import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMerchantContext } from "@/lib/merchant";

/**
 * D154 — a staff seat links by VERIFIED EMAIL as well as verified phone.
 *
 * Founder ruling 2026-08-23, after the email-primary ruling of 2026-08-22 left
 * Staff 01 impossible to onboard: `merchant_staff.phone` was NOT NULL, the
 * invite API demanded a phone, and a seat linked only on `users.phone` — which
 * is NULL for every account while the Clerk phone attribute is off.
 *
 * The email key is safe on exactly the terms the phone key is: `users.email` is
 * written only from `verifiedPrimaryEmail` (Clerk-verified or nothing) and
 * frozen against its holder by D142. This file pins BOTH halves — that the
 * branch exists, and that it keeps the guards. Delete the email branch from
 * `getMerchantContext` and the first case fails; loosen either guard and the
 * last two do.
 */

let appUser: Record<string, unknown> | null;
vi.mock("@/lib/data", () => ({
  getAppUser: () => Promise.resolve(appUser),
  getMerchantForUser: () => Promise.resolve(null), // not an owner: staff path
}));

let seatByUserId: Record<string, unknown> | null;
let seatByPhone: Record<string, unknown> | null;
let seatByEmail: Record<string, unknown> | null;
/** Every seat lookup, as `column=value`, in the order the code made them. */
const seatFilters: string[] = [];
/** True when the lookup carried `.is("user_id", null)` — the unclaimed guard. */
let lastLookupRequiredUnclaimed = false;
const staffUpdates: Array<Record<string, unknown>> = [];
const userUpdates: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      let by: "phone" | "email" | "user_id" | null = null;
      let updating = false;
      let sawUnclaimedGuard = false;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        if (table === "merchant_staff" && !updating) {
          if (col === "phone" || col === "email" || col === "user_id") {
            by = col;
            seatFilters.push(`${col}=${String(val)}`);
          }
        }
        return builder;
      };
      builder.is = (col: string, val: unknown) => {
        if (table === "merchant_staff" && col === "user_id" && val === null) {
          sawUnclaimedGuard = true;
        }
        return builder;
      };
      builder.update = (payload: Record<string, unknown>) => {
        updating = true;
        (table === "users" ? userUpdates : staffUpdates).push(payload);
        return builder;
      };
      builder.maybeSingle = () => {
        if (updating) return Promise.resolve({ data: null, error: null });
        if (table === "merchants")
          return Promise.resolve({
            data: { id: "merchant-1", merchant_name: "Test Shop" },
            error: null,
          });
        lastLookupRequiredUnclaimed = sawUnclaimedGuard;
        const row =
          by === "phone" ? seatByPhone : by === "email" ? seatByEmail : seatByUserId;
        return Promise.resolve({ data: row, error: null });
      };
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
  seatFilters.length = 0;
  staffUpdates.length = 0;
  userUpdates.length = 0;
  lastLookupRequiredUnclaimed = false;
  seatByUserId = null;
  seatByPhone = null;
  seatByEmail = null;
  appUser = null;
});

describe("D154 — staff seat linking by verified email", () => {
  it("links an email-invited seat for a phone-less user, and applies its permissions", async () => {
    // The email-primary shape: Clerk phone is off, so users.phone is NULL.
    appUser = { id: "u1", role: "customer", phone: null, email: "staff@shop.co" };
    seatByEmail = SEAT;

    const result = await getMerchantContext();

    expect(seatFilters).toContain("email=staff@shop.co");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.ctx.isOwner).toBe(false);
    expect(result.ctx.permissions.can_verify).toBe(true);
    // First sign-in claims the seat and promotes the role, exactly as the
    // phone branch does (wireframe 10aa).
    expect(staffUpdates).toEqual([{ user_id: "u1" }]);
    expect(userUpdates).toEqual([{ role: "merchant_staff" }]);
  });

  it("only ever matches an UNCLAIMED seat — the seat-hijack guard (D124)", async () => {
    appUser = { id: "u2", role: "customer", phone: null, email: "staff@shop.co" };
    seatByEmail = SEAT;

    await getMerchantContext();

    // If this filter is ever dropped, a second account holding the same address
    // could take over a seat already linked to someone else.
    expect(lastLookupRequiredUnclaimed).toBe(true);
  });

  it("does not look up a seat at all when the user has no email", async () => {
    appUser = { id: "u3", role: "customer", phone: null, email: null };
    seatByEmail = SEAT;

    const result = await getMerchantContext();

    expect(seatFilters.some((f) => f.startsWith("email="))).toBe(false);
    expect(staffUpdates).toEqual([]);
    expect(result.status).toBe("no-merchant");
  });

  it("lower-cases the lookup so a mixed-case mirror still matches the stored seat", async () => {
    // `users.email` arrives lower-cased from Clerk and the invite column carries
    // a lowercase CHECK, but the match is exact `=`: if either side ever stops
    // normalising, seats stop linking silently. Belt and braces, pinned.
    appUser = { id: "u4", role: "customer", phone: null, email: "Staff@Shop.CO" };
    seatByEmail = SEAT;

    await getMerchantContext();

    expect(seatFilters).toContain("email=staff@shop.co");
  });

  it("prefers the phone match, leaving every existing phone-invited seat unchanged", async () => {
    appUser = {
      id: "u5",
      role: "customer",
      phone: "+254712345678",
      email: "staff@shop.co",
    };
    seatByPhone = SEAT;
    seatByEmail = { ...SEAT, id: "seat-other" };

    const result = await getMerchantContext();

    // Phone is tried first and short-circuits, so the email lookup never runs.
    expect(seatFilters).toEqual(["user_id=u5", "phone=+254712345678"]);
    expect(result.status).toBe("ok");
    expect(staffUpdates).toEqual([{ user_id: "u5" }]);
  });
});
