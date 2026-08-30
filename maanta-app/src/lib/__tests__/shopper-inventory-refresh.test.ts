import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  needsDealCacheInvalidation,
  needsInventoryRefresh,
  SHOPPER_INVENTORY_REFRESH_MS,
} from "@/components/shopper/inventory-refresh";
import {
  QUEUE_CONFIRMATION_BOUND_MS,
  QUEUE_MEMBERSHIP_POLL_MS,
  QUEUE_MEMBERSHIP_REQUEST_TIMEOUT_MS,
} from "@/app/(shopper)/qr/[token]/qr-check-in";
import {
  SHOPPER_INVENTORY_BYPASS_COOKIE,
  shouldBypassLiveDealsCache,
} from "@/lib/shopper-inventory";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("D213 criterion 4 inventory refresh", () => {
  it("uses the founder-ratified maximum interval", () => {
    expect(SHOPPER_INVENTORY_REFRESH_MS).toBe(30_000);
  });

  it("covers every shopper surface that advertises deal availability", () => {
    for (const route of [
      "/feed",
      "/browse",
      "/map",
      "/search",
      "/shops/m1",
      "/deals/d1",
    ]) {
      expect(needsInventoryRefresh(route), route).toBe(true);
    }
    for (const route of ["/tickets/r1", "/qr/token", "/you", "/my-deals"]) {
      expect(needsInventoryRefresh(route), route).toBe(false);
    }
  });

  it("invalidates only the discovery surfaces backed by getLiveDeals", () => {
    for (const route of ["/feed", "/browse", "/map"]) {
      expect(needsDealCacheInvalidation(route), route).toBe(true);
    }
    for (const route of ["/search", "/shops/m1", "/deals/d1"]) {
      expect(needsDealCacheInvalidation(route), route).toBe(false);
    }
  });

  it("mounts once at the shopper boundary and refreshes on cadence and resume", () => {
    const layout = read("app/(shopper)/layout.tsx");
    const refresh = read("components/shopper/inventory-refresh.tsx");
    expect(layout).toContain("<ShopperInventoryRefresh />");
    expect(refresh).toContain("await fetch(\"/api/shopper/inventory-refresh\"");
    expect(refresh).toContain("SHOPPER_INVENTORY_REFRESH_MS");
    expect(refresh).toContain('document.addEventListener("visibilitychange", onVisible)');
    expect(refresh).toContain('window.addEventListener("pageshow", onPageShow)');
    expect(refresh).toContain("router.refresh()");
  });

  it("bypasses the shared cache only for a server-marked polling read", () => {
    expect(shouldBypassLiveDealsCache("1")).toBe(true);
    expect(shouldBypassLiveDealsCache(undefined)).toBe(false);
    expect(shouldBypassLiveDealsCache("yes")).toBe(false);

    const data = read("lib/data.ts");
    expect(data).toContain("export async function getShopperLiveDeals(");
    expect(data).toContain("getLiveDealsUncached(node, includeDemo)");
    expect(data).toContain("shouldBypassLiveDealsCache(");
    expect(SHOPPER_INVENTORY_BYPASS_COOKIE).toBe(
      "maanta-shopper-inventory-fresh"
    );
  });
});

describe("D217 server-authoritative queue lapse bound", () => {
  it("reserves one half of the total bound for polling and one for response", () => {
    expect(QUEUE_MEMBERSHIP_POLL_MS).toBe(15_000);
    expect(QUEUE_MEMBERSHIP_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(QUEUE_MEMBERSHIP_POLL_MS + QUEUE_MEMBERSHIP_REQUEST_TIMEOUT_MS).toBe(
      QUEUE_CONFIRMATION_BOUND_MS
    );
  });

  it("polls the server independently of the shared shopper clock", () => {
    const source = read("app/(shopper)/qr/[token]/qr-check-in.tsx");
    expect(source).toContain("window.setInterval(");
    expect(source).toContain("pollMembership,");
    expect(source).toContain("QUEUE_MEMBERSHIP_POLL_MS");
    expect(source).toContain("QUEUE_MEMBERSHIP_REQUEST_TIMEOUT_MS");
  });
});
