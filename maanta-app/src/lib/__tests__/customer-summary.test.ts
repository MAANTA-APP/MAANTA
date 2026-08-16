import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { summariseCustomerRedemptions } from "@/lib/customer-summary";

const at = (iso: string) => `${iso}T10:00:00Z`;

describe("summariseCustomerRedemptions", () => {
  it("separates claims from completed redemptions", () => {
    // Same table, different statuses — counting them as two things would
    // double-count one act.
    const s = summariseCustomerRedemptions([
      { status: "success", redeemed_at: at("2026-08-01"), success_fee_charged: 30 },
      { status: "pending", redeemed_at: at("2026-08-02"), success_fee_charged: 30 },
      { status: "failed", redeemed_at: at("2026-08-03"), success_fee_charged: 30 },
      { status: "flagged", redeemed_at: at("2026-08-04"), success_fee_charged: 30 },
    ]);
    expect(s).toMatchObject({ claims: 4, redeemed: 1, pending: 1, failed: 1, flagged: 1 });
  });

  it("counts fees from verified redemptions only", () => {
    // A pending claim has cost nobody anything yet, and a failed one never will.
    const s = summariseCustomerRedemptions([
      { status: "success", redeemed_at: at("2026-08-01"), success_fee_charged: 30 },
      { status: "success", redeemed_at: at("2026-08-02"), success_fee_charged: "30.00" },
      { status: "pending", redeemed_at: at("2026-08-03"), success_fee_charged: 30 },
      { status: "failed", redeemed_at: at("2026-08-04"), success_fee_charged: 30 },
      { status: "flagged", redeemed_at: at("2026-08-05"), success_fee_charged: 30 },
    ]);
    expect(s.feesGenerated).toBe(60);
  });

  it("survives a null or unparseable fee without poisoning the total", () => {
    // NaN would render as "KES NaN" on a money surface.
    const s = summariseCustomerRedemptions([
      { status: "success", redeemed_at: at("2026-08-01"), success_fee_charged: null },
      { status: "success", redeemed_at: at("2026-08-02"), success_fee_charged: "not a number" },
      { status: "success", redeemed_at: at("2026-08-03"), success_fee_charged: 30 },
    ]);
    expect(s.feesGenerated).toBe(30);
    expect(Number.isFinite(s.feesGenerated)).toBe(true);
  });

  it("reports the most recent activity regardless of row order", () => {
    const s = summariseCustomerRedemptions([
      { status: "success", redeemed_at: at("2026-08-02"), success_fee_charged: 30 },
      { status: "pending", redeemed_at: at("2026-08-09"), success_fee_charged: 30 },
      { status: "success", redeemed_at: at("2026-08-05"), success_fee_charged: 30 },
    ]);
    expect(s.lastActivityAt).toBe(at("2026-08-09"));
  });

  it("returns null last activity for an account that has never claimed", () => {
    // The page says "No claims yet" rather than printing an epoch date.
    const s = summariseCustomerRedemptions([]);
    expect(s.lastActivityAt).toBeNull();
    expect(s).toMatchObject({ claims: 0, redeemed: 0, feesGenerated: 0 });
  });

  it("ignores a status it does not know instead of miscounting it", () => {
    const s = summariseCustomerRedemptions([
      { status: "something_new", redeemed_at: at("2026-08-01"), success_fee_charged: 30 },
    ]);
    expect(s.claims).toBe(1);
    expect(s.redeemed + s.pending + s.failed + s.flagged).toBe(0);
    expect(s.feesGenerated).toBe(0);
  });
});

describe("the customer record's privacy decisions", () => {
  const detail = readFileSync(
    path.resolve(__dirname, "..", "..", "app", "admin", "customers", "[id]", "page.tsx"),
    "utf8"
  );
  const list = readFileSync(
    path.resolve(__dirname, "..", "..", "app", "admin", "customers", "page.tsx"),
    "utf8"
  );

  it("masks the phone, as the list and the lead detail do", () => {
    // A shop's phone is a published business contact; a shopper's is personal.
    expect(detail).toContain("maskPhone(user.phone)");
    expect(detail).not.toMatch(/\{user\.phone\}/);
  });

  it("never renders a redemption code", () => {
    // For a pending claim the code is a live credential.
    expect(detail).not.toContain("otp_code");
  });

  it("shows auth linkage as presence, not as the identifier", () => {
    expect(detail).toContain("Clerk-linked");
    expect(detail).not.toMatch(/\{user\.clerk_user_id\}/);
  });

  it("opens from the list", () => {
    expect(list).toContain("href={`/admin/customers/${u.id}`}");
  });

  it("stays read-only — no blacklist or role mutation on this surface", () => {
    expect(detail).not.toContain("is_blacklisted:");
    expect(detail).not.toMatch(/fetch\(/);
  });
});
