import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  usePathname: () => "/feed",
  useSearchParams: () => new URLSearchParams(),
}));

import { DealCategoryChips } from "@/components/browse/deal-category-chips";
import { DEAL_CATEGORIES } from "@/lib/deal-categories";

/**
 * The shopper-facing category row. What matters here is what a shopper can see
 * and get back from — not the mechanics of the URL, which the taxonomy suite
 * covers.
 */
describe("DealCategoryChips", () => {
  const all = DEAL_CATEGORIES.map((c) => ({ key: c.key, label: c.label }));

  it("renders nothing at all when there is nothing to filter", () => {
    // Not an empty container with padding — nothing. Before the migration is
    // applied this is every render, and the feed must look untouched.
    expect(renderToStaticMarkup(createElement(DealCategoryChips, { options: [] }))).toBe(
      ""
    );
  });

  it("leads with All, so the way out is the first thing in reading order", () => {
    const html = renderToStaticMarkup(createElement(DealCategoryChips, { options: all }));
    // `&` renders as `&amp;` — "Fashion & fabric" is never in the markup
    // verbatim, and a naive indexOf would return -1 and pass this vacuously.
    const escaped = (s: string) => s.replace(/&/g, "&amp;");
    expect(html.indexOf(">All<")).toBeGreaterThan(-1);
    for (const c of DEAL_CATEGORIES) {
      const at = html.indexOf(escaped(c.label));
      expect(at, `${c.label} missing from the row`).toBeGreaterThan(-1);
      expect(html.indexOf(">All<")).toBeLessThan(at);
    }
  });

  it("marks the selected chip with aria-pressed, not colour alone", () => {
    // Frozen rule 4: state is icon + word and must survive greyscale. The chip's
    // ink fill is the visual cue; aria-pressed is the one a screen reader gets.
    const html = renderToStaticMarkup(createElement(DealCategoryChips, { options: all }));
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/aria-pressed="true"/g), "exactly one chip is selected").toHaveLength(
      1
    );
  });

  it("names the group for a screen reader", () => {
    const html = renderToStaticMarkup(createElement(DealCategoryChips, { options: all }));
    expect(html).toContain('aria-label="Filter deals by category"');
  });

  it("carries no amber and no money", () => {
    // A discovery control is not an action and never a price. Frozen rules 1-3.
    const html = renderToStaticMarkup(createElement(DealCategoryChips, { options: all }));
    expect(html).not.toMatch(/amber/i);
    expect(html).not.toMatch(/KES/);
  });
});
