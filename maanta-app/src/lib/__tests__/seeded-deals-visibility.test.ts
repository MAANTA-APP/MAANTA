import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIVE_DEAL_BOOSTED_LIMIT,
  LIVE_DEAL_FLASH_LIMIT,
  LIVE_DEAL_STANDARD_LIMIT,
} from "@/lib/data";

const root = join(process.cwd(), "src");

describe("seeded deals visibility (post-login surfaces)", () => {
  it("live-deal rail caps fit elite seed (100 flash + 100 standard) plus node0 inventory", () => {
    // elite_merchants_100.sql: 1 flash + 1 standard per merchant (pending merchants excluded by RLS-style filters)
    expect(LIVE_DEAL_FLASH_LIMIT).toBeGreaterThanOrEqual(100);
    expect(LIVE_DEAL_STANDARD_LIMIT).toBeGreaterThanOrEqual(100);
    // node0_100_deals_seed also contributes boosted rails
    expect(LIVE_DEAL_BOOSTED_LIMIT).toBeGreaterThanOrEqual(20);
  });

  it("Browse page does not import or render the map component", () => {
    const browsePage = readFileSync(
      join(root, "app/(shopper)/browse/page.tsx"),
      "utf8"
    );
    const browseClient = readFileSync(
      join(root, "components/browse/browse-client.tsx"),
      "utf8"
    );
    const shopperTopBar = readFileSync(
      join(root, "components/nav/shopper-top-bar.tsx"),
      "utf8"
    );
    expect(browsePage).toContain("BrowseClient");
    expect(browsePage).not.toMatch(/BrowseMap|browse-map/);
    expect(browseClient).not.toMatch(/BrowseMap|browse-map|Loading map/);
    // Map remains a separate entry point (top bar), not embedded in Browse.
    expect(shopperTopBar).toContain('href="/map"');
  });

  it("standalone Map page still uses BrowseMap", () => {
    const mapClient = readFileSync(
      join(root, "app/(shopper)/map/map-client.tsx"),
      "utf8"
    );
    expect(mapClient).toContain("browse-map");
    expect(mapClient).toContain("BrowseMap");
  });

  it("merchant deal list queries by merchant_id without synthetic-excluding filters", () => {
    const dealsPage = readFileSync(
      join(root, "app/merchant/(app)/deals/page.tsx"),
      "utf8"
    );
    expect(dealsPage).toContain('.eq("merchant_id", merchant.id)');
    expect(dealsPage).toContain('.eq("is_active", true)');
    // Must not hide elite/seeded rows via visibility or tier gates
    expect(dealsPage).not.toContain("is_visible");
    expect(dealsPage).not.toContain("elite.seed");
  });

  it("admin merchants directory cap covers 100 elite seed merchants", () => {
    const adminMerchants = readFileSync(
      join(root, "app/admin/merchants/page.tsx"),
      "utf8"
    );
    expect(adminMerchants).toMatch(/\.limit\(300\)/);
  });
});
