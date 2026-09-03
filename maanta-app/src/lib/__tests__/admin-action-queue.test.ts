import { describe, expect, it } from "vitest";
import {
  buildActionQueue,
  countByCategory,
  summariseQueue,
  sortActionItems,
  STALE_ARRIVAL_MINUTES,
  STUCK_TOPUP_MINUTES,
  type ActionQueueInput,
} from "@/lib/admin-action-queue";

const now = new Date("2026-09-03T12:00:00Z");
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();

/** Every category readable and empty — the honest all-clear. */
function empty(): ActionQueueInput {
  return {
    now,
    pendingMerchants: [],
    heldRedemptions: [],
    appealableRedemptions: [],
    fraudEvents: [],
    openTasks: [],
    merchants: [],
    cappedLiveDeals: [],
    unlinkedStaffSeats: [],
    blacklistedLiveClaims: [],
    staleArrivals: [],
    stuckTopups: [],
    demoModeEnabled: false,
  };
}

const merchant = (over: Partial<ActionQueueInput["merchants"] extends (infer T)[] | null ? T : never> = {}) => ({
  id: "m1",
  merchant_name: "Shop One",
  status: "active",
  is_visible: true,
  is_shadow_banned: false,
  is_demo: false,
  account_balance: 300,
  outstanding_arrears: 0,
  updated_at: ago(60),
  evidence: "internal" as const,
  visibleDeals: 2,
  ...over,
});

describe("buildActionQueue — an empty, readable queue is genuinely empty", () => {
  it("returns nothing when every category is readable and clear", () => {
    expect(buildActionQueue(empty())).toEqual([]);
    expect(summariseQueue([])).toBe("0 urgent · 0 need attention");
  });
});

describe("a failed read is never an all-clear", () => {
  it("emits one unavailable item per unreadable category, sorted first", () => {
    const items = buildActionQueue({ ...empty(), heldRedemptions: null, pendingMerchants: [] });
    expect(items).toHaveLength(1);
    expect(items[0].unavailable).toBe(true);
    expect(items[0].category).toBe("redemption");
    expect(items[0].reason).toMatch(/read failure, not an empty queue/);
  });

  it("names the failure in the summary before any count", () => {
    const items = buildActionQueue({ ...empty(), fraudEvents: null });
    expect(summariseQueue(items)).toMatch(/^1 category unreadable/);
  });

  it("reports an unreadable demo flag rather than assuming OFF", () => {
    const items = buildActionQueue({ ...empty(), demoModeEnabled: null });
    expect(items.some((i) => i.unavailable && i.category === "evidence")).toBe(true);
  });
});

describe("every item points at the record and states its condition", () => {
  it("approval → the merchant's actions anchor", () => {
    const [item] = buildActionQueue({
      ...empty(),
      pendingMerchants: [{ id: "m9", merchant_name: "New Shop", created_at: ago(30) }],
    });
    expect(item.href).toBe("/admin/merchants/m9#actions");
    expect(item.since).toBe(ago(30));
    expect(item.reason).toMatch(/pending/);
  });

  it("held redemption → the redemption page, urgent", () => {
    const [item] = buildActionQueue({
      ...empty(),
      heldRedemptions: [{ id: "r1", redeemed_at: ago(5), merchant_name: "Shop One" }],
    });
    expect(item.href).toBe("/admin/redemptions/r1");
    expect(item.severity).toBe("urgent");
    expect(item.reason).toMatch(/no fee has moved/i);
  });

  it("support task → the merchant's support anchor, urgent when overdue", () => {
    const items = buildActionQueue({
      ...empty(),
      openTasks: [
        { id: "t1", task_type: "fraud_review", priority: "normal", created_at: ago(120), due_at: ago(10), merchant_id: "m1", merchant_name: "Shop One" },
        { id: "t2", task_type: "audit", priority: "normal", created_at: ago(5), due_at: null, merchant_id: "m1", merchant_name: "Shop One" },
      ],
    });
    expect(items[0].id).toBe("task:t1");
    expect(items[0].severity).toBe("urgent");
    expect(items[0].title).toMatch(/overdue/);
    expect(items[0].href).toBe("/admin/merchants/m1#support");
    expect(items[1].severity).toBe("attention");
  });
});

describe("merchant rules", () => {
  it("skips synthetic merchants entirely", () => {
    expect(
      buildActionQueue({ ...empty(), merchants: [merchant({ is_demo: true, status: "suspended", account_balance: 0 })] })
    ).toEqual([]);
  });

  it("diagnoses visibility before supply, using the canonical blocker", () => {
    const [shadow] = buildActionQueue({
      ...empty(),
      merchants: [merchant({ is_shadow_banned: true, visibleDeals: 0 })],
    });
    expect(shadow.id).toBe("shadow:m1");
    const [hidden] = buildActionQueue({
      ...empty(),
      merchants: [merchant({ is_visible: false, visibleDeals: 0 })],
    });
    expect(hidden.id).toBe("hidden:m1");
  });

  it("raises no-supply only for a public merchant with a real zero, never a null", () => {
    const [item] = buildActionQueue({ ...empty(), merchants: [merchant({ visibleDeals: 0 })] });
    expect(item.id).toBe("no-supply:m1");
    expect(item.severity).toBe("urgent");
    expect(buildActionQueue({ ...empty(), merchants: [merchant({ visibleDeals: null })] })).toEqual([]);
  });

  it("carries the credit-wall doctrine on the zero-balance item", () => {
    const [item] = buildActionQueue({ ...empty(), merchants: [merchant({ account_balance: 0 })] });
    expect(item.category).toBe("balance");
    expect(item.reason).toMatch(/Do NOT raise this with the merchant/);
    expect(item.action).toBe("Observe only");
  });

  it("prefers arrears over zero balance when both hold", () => {
    const items = buildActionQueue({ ...empty(), merchants: [merchant({ account_balance: 0, outstanding_arrears: 60 })] });
    expect(items.map((i) => i.id)).toEqual(["arrears:m1"]);
  });

  it("flags an unclassified non-demo merchant as an evidence gap", () => {
    const items = buildActionQueue({ ...empty(), merchants: [merchant({ evidence: "unclassified" })] });
    expect(items.map((i) => i.id)).toEqual(["unclassified:m1"]);
    expect(items[0].category).toBe("evidence");
  });

  it("treats a suspended merchant as attention with the counter consequence stated", () => {
    const [item] = buildActionQueue({ ...empty(), merchants: [merchant({ status: "suspended" })] });
    expect(item.id).toBe("suspended:m1");
    expect(item.reason).toMatch(/Verification is blocked/);
  });
});

describe("deal, seat, shopper, visit and top-up rules", () => {
  it("raises fully-claimed only at the D236 boundary", () => {
    const items = buildActionQueue({
      ...empty(),
      cappedLiveDeals: [
        { id: "d1", title: "Half price", merchant_id: "m1", merchant_name: "Shop One", max_claims: 10, claims_reserved: 10, updated_at: ago(1) },
        { id: "d2", title: "Not yet", merchant_id: "m1", merchant_name: "Shop One", max_claims: 10, claims_reserved: 9, updated_at: ago(1) },
        { id: "d3", title: "No cap", merchant_id: "m1", merchant_name: "Shop One", max_claims: null, claims_reserved: 99, updated_at: ago(1) },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["fully-claimed:d1"]);
    expect(items[0].reason).toMatch(/Claim allocation 10 reached/);
    expect(items[0].reason).not.toMatch(/redemption limit/i);
  });

  it("raises an unlinked seat only for an active merchant", () => {
    const items = buildActionQueue({
      ...empty(),
      unlinkedStaffSeats: [
        { id: "s1", staff_name: "Amina", merchant_id: "m1", merchant_name: "Shop One", merchant_status: "active", invited_at: ago(1440) },
        { id: "s2", staff_name: "Ben", merchant_id: "m2", merchant_name: "Pending Shop", merchant_status: "pending", invited_at: ago(1440) },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["seat:s1"]);
    expect(items[0].href).toBe("/admin/merchants/m1#staff");
  });

  it("raises a blacklisted account holding a live claim as urgent", () => {
    const [item] = buildActionQueue({
      ...empty(),
      blacklistedLiveClaims: [{ id: "r7", user_id: "u1", full_name: null, claimed_at: ago(3), merchant_name: "Shop One" }],
    });
    expect(item.severity).toBe("urgent");
    expect(item.category).toBe("shopper");
    expect(item.href).toBe("/admin/redemptions/r7");
  });

  it("raises a stale arrival only past the threshold, and never for a redeemed row", () => {
    const later = new Date(now.getTime() + 3_600_000).toISOString();
    const items = buildActionQueue({
      ...empty(),
      staleArrivals: [
        { id: "a1", status: "pending", expires_at: later, arrived_at: ago(STALE_ARRIVAL_MINUTES + 1), merchant_name: "Shop One" },
        { id: "a2", status: "pending", expires_at: later, arrived_at: ago(STALE_ARRIVAL_MINUTES - 1), merchant_name: "Shop One" },
        { id: "a3", status: "success", expires_at: later, arrived_at: ago(500), merchant_name: "Shop One" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["stale-arrival:a1"]);
    expect(items[0].category).toBe("visit");
    expect(items[0].reason).toMatch(/An arrival is not a redemption/);
  });

  it("raises a stuck top-up only past the threshold", () => {
    const items = buildActionQueue({
      ...empty(),
      stuckTopups: [
        { api_ref: "topup:1", merchant_id: "m1", merchant_name: "Shop One", amount: 500, currency: "KES", created_at: ago(STUCK_TOPUP_MINUTES + 5) },
        { api_ref: "topup:2", merchant_id: "m1", merchant_name: "Shop One", amount: 500, currency: "KES", created_at: ago(5) },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["topup:topup:1"]);
    expect(items[0].reason).toMatch(/No money has been credited/);
  });

  it("raises demo mode ON as an evidence item that names the founder as owner", () => {
    const [item] = buildActionQueue({ ...empty(), demoModeEnabled: true });
    expect(item.id).toBe("demo-mode");
    expect(item.reason).toMatch(/D189/);
    expect(item.href).toBe("/admin/operations");
  });
});

describe("ordering and summaries", () => {
  it("sorts unavailable, then urgent, then attention, oldest first within a band", () => {
    const items = sortActionItems([
      { id: "b", category: "support", severity: "attention", title: "", entity: { kind: "task", id: "b", name: "" }, reason: "", since: ago(10), href: "/x", action: "" },
      { id: "a", category: "support", severity: "attention", title: "", entity: { kind: "task", id: "a", name: "" }, reason: "", since: ago(100), href: "/x", action: "" },
      { id: "u", category: "redemption", severity: "urgent", title: "", entity: { kind: "redemption", id: "u", name: "" }, reason: "", since: ago(1), href: "/x", action: "" },
      { id: "n", category: "deal", severity: "attention", title: "", entity: { kind: "deal", id: "n", name: "" }, reason: "", since: null, href: "/x", action: "" },
      { id: "x", category: "visit", severity: "urgent", title: "", entity: { kind: "config", id: "x", name: "" }, reason: "", since: null, href: "/x", action: "", unavailable: true },
    ]);
    expect(items.map((i) => i.id)).toEqual(["x", "u", "a", "b", "n"]);
  });

  it("counts by category", () => {
    const items = buildActionQueue({
      ...empty(),
      pendingMerchants: [{ id: "m9", merchant_name: "New", created_at: ago(1) }],
      demoModeEnabled: true,
    });
    const c = countByCategory(items);
    expect(c.approval).toBe(1);
    expect(c.evidence).toBe(1);
    expect(c.support).toBe(0);
    expect(summariseQueue(items)).toBe("0 urgent · 2 need attention");
  });
});
