import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
  BackToYouLink,
  SegmentedLinks,
} from "@/components/ui/claude";
import { LanguageCard, ProfileCard } from "@/app/(shopper)/profile/profile-card";
import { BrowseClient } from "@/components/browse/browse-client";
import { BrowseChips } from "@/app/(shopper)/browse/browse-chips";
import type { DealRow } from "@/lib/data";

describe("Shopper UI polish", () => {
  it("BackToYouLink renders a history-aware back control", () => {
    const html = renderToStaticMarkup(createElement(BackToYouLink));
    expect(html).toContain("Back");
    expect(html).toContain('type="button"');
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
    expect(html).toContain("h-9");
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

  it("BrowseClient renders list chips without embedded map", () => {
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
      is_paused: false,
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
        sort: "nearest",
        filter: "all",
        category: "all",
        categoryOptions: [],
        chip: "all",
        isSignedIn: true,
      })
    );

    expect(html).toContain("Deals around you");
    expect(html).toContain("Search deals or shops");
    expect(html).not.toContain("Any time");
    expect(html).not.toContain("Loading map");
    expect(html).not.toContain("pan the map");
    expect(html).toContain('href="/map"');
  });

  it("BrowseChips renders expiring, flash, and favourites chips", () => {
    const html = renderToStaticMarkup(createElement(BrowseChips));
    expect(html).toContain("Expiring soon");
    expect(html).toContain("Flash");
    expect(html).toContain("Favourites");
    expect(html).toContain("Live now");
    expect(html).toContain("Today");
  });

  it("BrowseClient shows sign-in prompt for Favourites when signed out", () => {
    const html = renderToStaticMarkup(
      createElement(BrowseClient, {
        node: "BBS Mall",
        deals: [],
        origin: { lat: -1.2746, lng: 36.8501 },
        favourites: [],
        sort: "nearest",
        filter: "all",
        category: "all",
        categoryOptions: [],
        chip: "favourites",
        isSignedIn: false,
      })
    );

    expect(html).toContain("Sign in to see favourites");
    expect(html).toContain("/login?next=/browse");
  });
});
