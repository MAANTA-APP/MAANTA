import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Direction A feed hierarchy (decisions log 2026-08-22): the first flash deal
 * renders as the one image-forward "lead" card and the standard list recedes
 * to compact "row" cards. These are rendered assertions on the two new
 * `DealCard` variants plus a source pin on the feed wiring — the rail names
 * and orders themselves are pinned by `rail-names.test.ts` and
 * `locked-feed-order.test.ts`, not here.
 */

vi.mock("@/components/favourite-button", () => ({
  // The real button needs the app router; the variants only need a slot.
  FavouriteButton: () => createElement("button", { type: "button" }, "Save"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { DealCard } from "@/components/ui/claude/deal-card";

const baseProps = {
  href: "/deals/x",
  imageUrl: null,
  merchantName: "Nyota Café",
  mallName: "BBS Mall",
  title: "2-for-1 samosas & chai",
  merchantId: "m1",
  pay: 1200,
  wasKes: 2000,
} as const;

const render = (variant: "lead" | "row" | "vertical" | "horizontal") =>
  renderToStaticMarkup(createElement(DealCard, { ...baseProps, variant }));

describe("Direction A DealCard variants", () => {
  it("lead: borderless shadow card with the price anchored in a bottom bar, money in ink", () => {
    const html = render("lead");
    expect(html).toContain("rounded-card bg-white shadow-card");
    expect(html).not.toContain("border border-line");
    expect(html).toContain("You pay");
    expect(html).toContain("KES 1,200");
    expect(html).toContain("line-through");
    // The anchored price bar is a hairline divider — the one border-line use.
    expect(html).toContain("border-t border-line");
    // Frozen rule 3: the pay figure carries ink, never brand/verified/rust.
    expect(html).toContain("text-ink");
    for (const banned of ["text-brand", "text-verified", "text-rust", "text-flame"]) {
      expect(html, `money must not be coloured (${banned})`).not.toContain(banned);
    }
  });

  it("row: compact borderless row that still carries YOU PAY and the was-price", () => {
    const html = render("row");
    expect(html).toContain("rounded-card bg-white p-3 shadow-card");
    expect(html).not.toContain("border border-line");
    expect(html).toContain("You pay KES 1,200");
    expect(html).toContain("line-through");
  });

  it("frozen rule 7: the YOU PAY figure is identical across every variant", () => {
    const figures = (["lead", "row", "vertical", "horizontal"] as const).map((v) => {
      const m = render(v).match(/KES[\s ]?1,200/);
      return m?.[0] ?? null;
    });
    expect(figures.every((f) => f !== null && f === figures[0])).toBe(true);
  });

  it("the feed wires lead to the first flash deal and rows to the standard list", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../app/(shopper)/feed/page.tsx"),
      "utf8"
    );
    expect(src).toContain('variant="lead"');
    expect(src).toContain("flashDeals[0]");
    expect(src).toContain("flashDeals.slice(1)");
    expect(src).toContain('variant="row"');
    // The vertical stack of image cards must not silently return to rail 3.
    expect(src).not.toContain('variant="vertical"');
  });
});
