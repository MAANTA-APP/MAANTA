import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  needsInventoryRefresh,
  SHOPPER_INVENTORY_REFRESH_MS,
} from "@/components/shopper/inventory-refresh";

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

  it("mounts once at the shopper boundary and refreshes on cadence and resume", () => {
    const layout = read("app/(shopper)/layout.tsx");
    const refresh = read("components/shopper/inventory-refresh.tsx");
    expect(layout).toContain("<ShopperInventoryRefresh />");
    expect(refresh).toContain("window.setInterval(refresh, SHOPPER_INVENTORY_REFRESH_MS)");
    expect(refresh).toContain('document.addEventListener("visibilitychange", onVisible)');
    expect(refresh).toContain('window.addEventListener("pageshow", refresh)');
    expect(refresh).toContain("router.refresh()");
  });
});
