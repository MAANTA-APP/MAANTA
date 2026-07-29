import { describe, expect, it } from "vitest";
import type { StaffPermissions } from "@/lib/merchant";
import {
  canUseMerchantSurface,
  merchantBottomNavItems,
  merchantHomeHref,
  merchantMoreRows,
} from "@/lib/merchant-nav";

/**
 * Merchant staff nav hardening: a staff member must not see bottom-nav items
 * or More rows they'd only bounce off. Owners hold every permission, so their
 * shell is unchanged — that's the regression this file locks down.
 */

const OWNER: StaffPermissions = {
  can_verify: true,
  can_deals: true,
  can_topup: true,
  can_purchase: true,
};
const VERIFY_ONLY: StaffPermissions = {
  can_verify: true,
  can_deals: false,
  can_topup: false,
  can_purchase: false,
};
const NO_PERMISSIONS: StaffPermissions = {
  can_verify: false,
  can_deals: false,
  can_topup: false,
  can_purchase: false,
};

const labels = (p: StaffPermissions) => merchantBottomNavItems(p).map((i) => i.label);

describe("merchantBottomNavItems", () => {
  it("leaves the owner bar unchanged — Redeem / Deals / Wallet / More in order", () => {
    expect(labels(OWNER)).toEqual(["Redeem", "Deals", "Wallet", "More"]);
  });

  it("gives verify-only staff a verify-focused shell (no Deals, no Wallet)", () => {
    expect(labels(VERIFY_ONLY)).toEqual(["Redeem", "More"]);
  });

  it("adds Deals for staff granted can_deals, still no Wallet", () => {
    expect(labels({ ...VERIFY_ONLY, can_deals: true })).toEqual([
      "Redeem",
      "Deals",
      "More",
    ]);
  });

  it("adds Wallet for staff granted can_topup", () => {
    expect(labels({ ...VERIFY_ONLY, can_topup: true })).toEqual([
      "Redeem",
      "Wallet",
      "More",
    ]);
  });

  it("hides Redeem from staff without can_verify but never leaves an empty bar", () => {
    expect(labels(NO_PERMISSIONS)).toEqual(["More"]);
  });

  it("keeps the wallet tab matching the top-up route so it stays highlighted", () => {
    const wallet = merchantBottomNavItems(OWNER).find((i) => i.surface === "wallet");
    expect(wallet?.match).toContain("/merchant/topup");
  });
});

describe("canUseMerchantSurface", () => {
  it("maps each gated surface to its one staff permission", () => {
    expect(canUseMerchantSurface("redeem", VERIFY_ONLY)).toBe(true);
    expect(canUseMerchantSurface("deals", VERIFY_ONLY)).toBe(false);
    expect(canUseMerchantSurface("topup", VERIFY_ONLY)).toBe(false);
    expect(canUseMerchantSurface("plan", VERIFY_ONLY)).toBe(false);
    expect(canUseMerchantSurface("plan", { ...VERIFY_ONLY, can_purchase: true })).toBe(
      true
    );
  });

  it("treats the informational More surface as always available", () => {
    expect(canUseMerchantSurface("more", NO_PERMISSIONS)).toBe(true);
  });
});

describe("merchantHomeHref", () => {
  it("sends owners and verify-capable staff to the keypad", () => {
    expect(merchantHomeHref(OWNER)).toBe("/merchant/redeem");
    expect(merchantHomeHref(VERIFY_ONLY)).toBe("/merchant/redeem");
  });

  it("never lands a staff member on a surface they can't use", () => {
    expect(merchantHomeHref({ ...NO_PERMISSIONS, can_deals: true })).toBe(
      "/merchant/deals"
    );
    expect(merchantHomeHref(NO_PERMISSIONS)).toBe("/merchant/more");
  });
});

describe("merchantMoreRows", () => {
  it("shows the owner every row including Staff and Plan & billing", () => {
    expect(merchantMoreRows(OWNER, true).map((r) => r.label)).toEqual([
      "Dashboard",
      "Redemption history",
      "Alerts",
      "Staff",
      "Plan & billing",
      "Settings",
      "Support",
    ]);
  });

  it("hides Staff from non-owners and Plan & billing without can_purchase", () => {
    const rows = merchantMoreRows(VERIFY_ONLY, false).map((r) => r.label);
    expect(rows).not.toContain("Staff");
    expect(rows).not.toContain("Plan & billing");
    // Informational rows stay: a cashier still needs history and support.
    expect(rows).toEqual([
      "Dashboard",
      "Redemption history",
      "Alerts",
      "Settings",
      "Support",
    ]);
  });

  it("restores Plan & billing for staff granted can_purchase", () => {
    expect(
      merchantMoreRows({ ...VERIFY_ONLY, can_purchase: true }, false).map((r) => r.label)
    ).toContain("Plan & billing");
  });
});
