import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAdminAttentionItems } from "@/lib/admin-ops-health";

describe("admin deterministic attention rules", () => {
  it("surfaces each actionable queue with an explicit reason", () => {
    const items = buildAdminAttentionItems({
      pendingMerchants: 2,
      heldRedemptions: 1,
      openTasks: 3,
      merchantsInArrears: 4,
      activeMerchants: 5,
      liveDeals: 0,
      genuineClaims7d: 20,
      genuineVerified7d: 2,
    });

    expect(items.map((item) => item.id)).toEqual([
      "held",
      "approvals",
      "support",
      "arrears",
      "supply",
      "claim-conversion",
    ]);
    for (const item of items) {
      expect(item.reason.length).toBeGreaterThan(10);
      expect(item.href).toMatch(/^\/admin\//);
    }
  });

  it("does not flag conversion below the minimum sample", () => {
    const items = buildAdminAttentionItems({
      pendingMerchants: 0,
      heldRedemptions: 0,
      openTasks: 0,
      merchantsInArrears: 0,
      activeMerchants: 1,
      liveDeals: 1,
      genuineClaims7d: 9,
      genuineVerified7d: 0,
    });
    expect(items.some((item) => item.id === "claim-conversion")).toBe(false);
  });

  it("does not invent alerts from unavailable genuine metrics", () => {
    const items = buildAdminAttentionItems({
      pendingMerchants: 0,
      heldRedemptions: 0,
      openTasks: 0,
      merchantsInArrears: 0,
      activeMerchants: 0,
      liveDeals: 0,
      genuineClaims7d: null,
      genuineVerified7d: null,
    });
    expect(items).toEqual([]);
  });
});

describe("PR 4 admin operations ratchets", () => {
  const read = (rel: string) =>
    readFileSync(path.join(__dirname, "../../", rel), "utf8");

  it("uses the full D188 parent join for every genuine-tagged census", () => {
    const src = read("app/admin/page.tsx");
    expect(
      src.match(/merchants!inner\(is_demo,node\), deals!inner\(is_demo\)/g)
        ?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
    expect(src.match(/\.eq\("is_demo", false\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src.match(/\.eq\("merchants\.is_demo", false\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src.match(/\.eq\("deals\.is_demo", false\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).toContain(
      "Internal E2E activity can still be included, so this is not external field validation."
    );
  });

  it("keeps runtime config read-only and allow-listed", () => {
    const src = read("app/admin/page.tsx");
    for (const key of [
      "demo_mode_enabled",
      "fast_visit_enabled",
      "fast_visit_points",
      "success_fee_kes",
    ]) {
      expect(src).toContain(`"${key}"`);
    }
    expect(src).not.toMatch(/app_config[^\n]*(insert|update|delete)/i);
    expect(src).toContain("Read-only visibility. No config write controls exist here.");
  });

  it("reads the durable admin audit table and exposes no audit write UI", () => {
    const overview = read("app/admin/page.tsx");
    const audit = read("app/admin/audit/page.tsx");
    expect(overview).toContain('.from("admin_ops_log")');
    expect(audit).toContain('.from("admin_ops_log")');
    expect(audit).toContain("read only");
    expect(audit).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("links the audit reader from the admin shell", () => {
    const sidebar = read("components/nav/admin-sidebar.tsx");
    expect(sidebar).toContain('{ href: "/admin/audit", label: "Audit" }');
  });
});
