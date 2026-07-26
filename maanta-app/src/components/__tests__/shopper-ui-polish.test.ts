import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => createElement("a", { href, ...rest }, children),
}));

import {
  BackToProfileLink,
  SegmentedLinks,
} from "@/components/ui/claude";
import { LanguageCard, ProfileCard } from "@/app/(shopper)/profile/profile-card";
import { BrowseClient } from "@/components/browse/browse-client";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { NotificationPreferencesPanel } from "@/components/notifications/notification-preferences-panel";
import type { DealRow } from "@/lib/data";

describe("Shopper UI polish", () => {
  it("BackToProfileLink returns to /profile with Back label", () => {
    const html = renderToStaticMarkup(createElement(BackToProfileLink));
    expect(html).toContain('href="/profile"');
    expect(html).toContain("Back");
  });

  it("SegmentedLinks renders compact tabs with active segment", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedLinks, {
        active: "deals",
        tabs: [
          { value: "deals", label: "Deals", href: "/my-deals" },
          { value: "shops", label: "Shops", href: "/my-deals?tab=shops" },
        ],
      })
    );
    expect(html).toContain("h-8");
    expect(html).toContain("Deals");
    expect(html).toContain("Shops");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('href="/my-deals?tab=shops"');
  });

  it("ProfileCard exposes Edit profile affordance", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileCard, {
        fullName: "Amina Okello",
        phoneMasked: "+254 ••• ••• 123",
        preferredLanguage: "en",
        node: "BBS Mall",
      })
    );
    expect(html).toContain("Edit profile");
    expect(html).toContain("Amina Okello");
  });

  it("LanguageCard shows English active and Kiswahili coming soon", () => {
    const html = renderToStaticMarkup(
      createElement(LanguageCard, { preferredLanguage: "en" })
    );
    expect(html).toContain("English");
    expect(html).toContain("Kiswahili");
    expect(html).toContain("Coming soon");
    expect(html).toContain("Active");
  });

  it("Profile Settings omits Notification preferences row", () => {
    const src = readFileSync(
      path.join(__dirname, "../../app/(shopper)/profile/page.tsx"),
      "utf8"
    );
    expect(src).toContain('label="Notifications"');
    expect(src).toContain('label="Help & support"');
    expect(src).not.toContain("Notification preferences");
    expect(src).not.toContain("/notifications/preferences");
  });

  it("ShopperTopBar Map and bell use larger type/hit targets", () => {
    const html = renderToStaticMarkup(
      createElement(ShopperTopBar, { node: "BBS Mall" })
    );
    expect(html).toContain("BBS Mall, Eastleigh");
    expect(html).toContain("Current location");
    expect(html).toContain(">Map</a>");
    expect(html).toContain('href="/browse"');
    expect(html).toContain('aria-label="Browse map"');
    expect(html).toContain("text-sm font-semibold");
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("h-6 w-6");
  });

  it("NotificationPreferencesPanel exposes the three toggles", () => {
    const html = renderToStaticMarkup(
      createElement(NotificationPreferencesPanel)
    );
    expect(html).toContain("Flash deals near me");
    expect(html).toContain("New deals from saved shops");
    expect(html).toContain("Code expiry reminders");
    expect(html).toContain('role="switch"');
  });

  it("BrowseClient lists deals above the map", () => {
    const deal: DealRow = {
      id: "d1",
      merchant_id: "m1",
      node: "BBS Mall",
      title: "Flash tray",
      description: null,
      image_url: "/x.png",
      deal_type: "flash",
      flash_duration_hours: 6,
      is_active: true,
      max_claims: null,
      claims_count: 0,
      success_fee: 30,
      boost_active: false,
      price_kes: 350,
      compare_at_kes: 700,
      charges: null,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      merchants: {
        id: "m1",
        merchant_name: "Habibi Grill",
        floor: "1",
        unit_number: "A-01",
        what3words_address: "stored.riches.shine",
        lat: -1.2746,
        lng: 36.8501,
        mall_name: "BBS Mall",
        node: "BBS Mall",
      },
    };

    const html = renderToStaticMarkup(
      createElement(BrowseClient, {
        node: "BBS Mall",
        deals: [deal],
        origin: { lat: -1.2746, lng: 36.8501 },
        favourites: [],
      })
    );

    expect(html).toContain("Deals around you");
    expect(html).toContain("Search deals or shops");
    expect(html).toContain("Flash");
    expect(html).toContain("Collect now");
    // List section markup appears before the map loading placeholder.
    const listIdx = html.indexOf("Deals around you");
    const mapIdx = html.indexOf("Loading map");
    expect(listIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(listIdx);
  });
});
