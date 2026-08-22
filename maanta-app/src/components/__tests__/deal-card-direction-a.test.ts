import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Direction A feed hierarchy (decisions log 2026-08-22): the first flash deal
 * renders as the one image-forward "lead" card and the standard list recedes
 * to compact "row" cards. Rendered assertions on the two new `DealCard`
 * variants plus a source pin on the feed wiring — rail names and orders are
 * pinned by `rail-names.test.ts` and `locked-feed-order.test.ts`, not here.
 *
 * The money assertions are scoped to the element that carries the figure, not
 * the whole document — `text-ink` appears on headings unconditionally, so a
 * document-wide `toContain` could never fail for the money reason.
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

const IN_TWO_HOURS = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

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

type Variant = NonNullable<Parameters<typeof DealCard>[0]["variant"]>;

const render = (variant: Variant, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(DealCard, { ...baseProps, ...extra, variant }));

/** Class list of the element whose text starts the KES 1,200 figure. */
const moneyClass = (html: string): string => {
  const m = html.match(/<(?:p|span) class="([^"]*)"[^>]*>(?:You pay )?KES\s?1,200/);
  return m?.[1] ?? "";
};

describe("Direction A DealCard variants", () => {
  it("lead: borderless shadow card, price anchored in a bottom hairline bar", () => {
    const html = render("lead");
    const article = html.match(/<article class="([^"]*)"/)?.[1] ?? "";
    expect(article).toContain("rounded-card bg-white shadow-card");
    expect(article).not.toContain("border-line");
    expect(html).toContain("You pay");
    expect(html).toContain("border-t border-line");
    expect(html).toContain("line-through");
  });

  it("money carries ink and never a colour, on every variant that shows it", () => {
    for (const variant of ["lead", "row", "vertical", "horizontal"] as const) {
      const cls = moneyClass(render(variant));
      expect(cls, `${variant} should render the KES figure`).not.toBe("");
      expect(cls, `${variant} money element carries ink`).toContain("text-ink");
      for (const banned of [
        "text-brand",
        "bg-brand",
        "text-rust",
        "bg-rust",
        "text-verified",
        "bg-verified",
        "text-flame",
      ]) {
        expect(cls, `${variant} money must not carry ${banned}`).not.toContain(banned);
      }
    }
  });

  it("lead with flash urgency: rust stays on the badge/chip, off the money", () => {
    const html = render("lead", { tag: "flash", expiresAt: IN_TWO_HOURS });
    expect(html).toContain("bg-rust"); // the Flash badge renders
    expect(html).toContain("Expires in"); // the live countdown renders
    expect(moneyClass(html)).not.toContain("rust");
  });

  it("row: compact, keeps the countdown inside the link and shows no Standard badge", () => {
    const html = render("row", { tag: "standard", expiresAt: IN_TWO_HOURS });
    const article = html.match(/<article class="([^"]*)"/)?.[1] ?? "";
    expect(article).toContain("rounded-card bg-white p-3 shadow-card");
    expect(html).toContain("You pay KES 1,200");
    expect(html).not.toContain("Standard");
    // Accessible association: the countdown renders before the closing </a>,
    // so the expiry is part of the link's accessible name — a bare sibling
    // span after the link would orphan it for links-list navigation.
    const link = html.match(/<a [^>]*href="\/deals\/x"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    expect(link).toContain("Expires in");
    // And the flash/boosted badges still surface when a row carries one.
    expect(render("row", { tag: "boosted" })).toContain("Boosted");
  });

  it("frozen rule 7: the YOU PAY figure is present and identical across variants", () => {
    const figures = (["lead", "row", "vertical", "horizontal"] as const).map(
      (v) => render(v).match(/KES\s?1,200/)?.[0] ?? null
    );
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
