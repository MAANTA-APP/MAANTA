import { describe, it, expect, vi } from "vitest";
// Shopper time-derived elements read the server-seeded clock and throw
// without it, so these harnesses mount the same provider a shopper route does.
import { renderShopperTree } from "@/lib/__tests__/helpers/shopper-clock";

// These fixtures are dated. D213 made every discovery collection withdraw
// expired deals on the shared clock, so the seed is pinned to the fixtures'
// own era — this file is about the CATEGORY filter, and evaluating them at the
// wall clock would empty the list for an unrelated and correct reason.
const AT = new Date("2026-08-19T12:00:00Z");
const renderAt = (node: Parameters<typeof renderShopperTree>[0]) =>
  renderShopperTree(node, AT);
import { createElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/browse",
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

import { BrowseClient } from "@/components/browse/browse-client";
import type { DealRow } from "@/lib/data";

/**
 * Does the category filter actually filter?
 *
 * Every other guard in this feature checks a taxonomy, a URL parser, a pure
 * helper or a string in a source file. None of them render a deal list. Deleting
 * the `filterDealsByCategory` call from the browse surface left the entire suite
 * green — the feature could have been removed and CI would have shrugged.
 *
 * So this one renders the real component with real rows and looks at the output.
 */
function deal(id: string, category: string | null, title: string): DealRow {
  return {
    id,
    merchant_id: `m-${id}`,
    node: "BBS Mall",
    title,
    description: null,
    image_url: "",
    deal_type: "standard",
    category,
    flash_duration_hours: 6,
    is_active: true,
    is_paused: false,
    max_claims: null,
    claims_count: 0,
    claims_issued: 0,
    success_fee: 30,
    boost_active: false,
    price_kes: 500,
    compare_at_kes: 800,
    charges: null,
    starts_at: "2026-08-18T08:00:00Z",
    expires_at: "2026-08-19T20:00:00Z",
    merchants: {
      id: `m-${id}`,
      merchant_name: `Shop ${id}`,
      floor: "1",
      unit_number: "A",
      what3words_address: "filled.count.soap",
      lat: -1.2746,
      lng: 36.8501,
      mall_name: "BBS Mall",
      node: "BBS Mall",
    },
  };
}

const DEALS = [
  deal("1", "food", "Sambusa platter"),
  deal("2", "fashion", "Abaya restock"),
  deal("3", null, "Uncategorised suitcase"),
];

const base = {
  node: "BBS Mall",
  origin: { lat: -1.2746, lng: 36.8501 },
  favourites: [] as string[],
  sort: "nearest" as const,
  filter: "all" as const,
  chip: "all" as const,
  categoryOptions: [
    { key: "fashion" as const, label: "Fashion & fabric" },
    { key: "food" as const, label: "Food" },
  ],
  isSignedIn: true,
};

const render = (category: "all" | "food" | "fashion") =>
  renderAt(
    createElement(BrowseClient, { ...base, deals: DEALS, category })
  );

describe("browse actually filters by category", () => {
  it("shows every deal, categorised or not, under All", () => {
    const html = render("all");
    expect(html).toContain("Sambusa platter");
    expect(html).toContain("Abaya restock");
    expect(html).toContain("Uncategorised suitcase");
  });

  it("shows only the chosen category's deals", () => {
    const html = render("food");
    expect(html).toContain("Sambusa platter");
    expect(html).not.toContain("Abaya restock");
  });

  it("never sweeps an uncategorised deal into a category", () => {
    // The whole reason uncategorised stayed NULL instead of being back-filled:
    // a deal must not appear under a bucket nobody filed it in.
    expect(render("food")).not.toContain("Uncategorised suitcase");
    expect(render("fashion")).not.toContain("Uncategorised suitcase");
  });

  it("counts what it shows, so the subtitle cannot contradict the list", () => {
    expect(render("food")).toContain("1 deal matches your filters");
    expect(render("all")).toContain("3 deals match your filters");
  });
});

describe("an empty category does not claim the mall is empty", () => {
  // The /browse half of the defect the feed had: `browseEmptyState` never saw
  // the category, so a category that emptied the list produced copy about
  // "filters" generally, and — on the favourites chip — a sentence asserting the
  // shopper's saved merchants have no live deals, which was simply untrue.
  const foodOnly = [deal("1", "food", "Sambusa platter")];

  it("names the category and offers the way back", () => {
    const html = renderAt(
      createElement(BrowseClient, { ...base, deals: foodOnly, category: "fashion" })
    );
    expect(html).toContain("fashion");
    expect(html).toContain("Tap All");
  });

  it("does not blame the merchant when a category emptied the favourites view", () => {
    const html = renderAt(
      createElement(BrowseClient, {
        ...base,
        deals: foodOnly,
        category: "fashion",
        chip: "favourites",
        favourites: ["m-1"],
      })
    );
    expect(html).not.toContain("no live deals in this node");
  });
});
