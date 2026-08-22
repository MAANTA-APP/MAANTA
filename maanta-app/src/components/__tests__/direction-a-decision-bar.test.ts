import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stripComments } from "@/lib/__tests__/helpers/comment-stripping";

/**
 * Direction A slice 3 — the anchored decision bar (decisions log 2026-08-22).
 *
 * On deal detail the YOU PAY figure moves next to the action, so the shopper
 * decides with the price and the button in one glance instead of scrolling
 * between them. On the claimed ticket the same figure is anchored — label
 * left, figure right — and stays outside the code card.
 *
 * Frozen rules this pins, not just the layout:
 *  - rule 7: the YOU PAY figure is identical on tile, detail and claimed code,
 *    and the itemised breakdown appears only on deal detail;
 *  - rule 6: the six-digit code is the only bare numeral in the code card —
 *    no price may render inside it;
 *  - rule 3: money is never coloured and never amber.
 *
 * Source-reading assertions strip comments first (shared lexer, drift D38/D50):
 * a guard that a JSX comment can satisfy is not a guard.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@/components/favourite-button", () => ({
  FavouriteButton: () => createElement("button", { type: "button" }, "Save"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { ClaimFlow } from "@/app/(shopper)/deals/[id]/claim-flow";
import { DealCard } from "@/components/ui/claude/deal-card";

const SRC = path.resolve(__dirname, "../..");
/** Source with comments removed — a commented-out string proves nothing. */
const code = (rel: string) => stripComments(readFileSync(path.join(SRC, rel), "utf8"));
const raw = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

const PAY = 1200;
const WAS = 2000;

const renderBar = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ClaimFlow, {
      dealId: "d1",
      dealTitle: "3 metres of cotton print",
      merchantName: "Riverside Fabrics",
      w3w: "stored.riches.shine",
      node: "BBS Mall",
      signedIn: true,
      pay: PAY,
      was: WAS,
      ...props,
    })
  );

/** Class list of the element whose text starts a given KES figure. */
const moneyClass = (html: string, figure: string): string =>
  html.match(new RegExp(`<(?:div|span) class="([^"]*)"[^>]*>(?:Was )?KES\\s?${figure}`))?.[1] ?? "";

const BANNED_ON_MONEY = [
  "text-brand",
  "bg-brand",
  "text-rust",
  "bg-rust",
  "text-verified",
  "bg-verified",
  "text-flame",
];

describe("Direction A — anchored decision bar", () => {
  it("deal detail: the price and the action sit in the same bar", () => {
    const html = renderBar();
    expect(html).toContain("You pay");
    expect(html).toContain("KES 1,200");
    expect(html).toContain("Was KES 2,000");
    expect(html).toContain("line-through");
    expect(html).toContain("Claim deal");
    expect(html).toContain("justify-between");
  });

  it("both money spans in the bar are ink, never amber or coloured", () => {
    const html = renderBar();
    for (const [figure, label] of [
      ["1,200", "pay"],
      ["2,000", "was"],
    ] as const) {
      const cls = moneyClass(html, figure);
      expect(cls, `the ${label} figure should render in the bar`).not.toBe("");
      for (const banned of BANNED_ON_MONEY) {
        expect(cls, `${label} figure must not carry ${banned}`).not.toContain(banned);
      }
    }
    expect(moneyClass(html, "1,200")).toContain("text-ink");
  });

  it("the bar wraps rather than letting a figure overrun the action", () => {
    const html = renderBar();
    // The row itself wraps, and no money figure may break mid-number.
    expect(html).toMatch(/flex flex-wrap items-center justify-between/);
    expect(moneyClass(html, "1,200")).toContain("whitespace-nowrap");
    expect(moneyClass(html, "2,000")).toContain("whitespace-nowrap");
  });

  it("with no price the bar degrades to the full-width action it was", () => {
    const html = renderBar({ pay: null, was: null });
    expect(html).not.toContain("You pay");
    expect(html).toContain("Claim deal");
    expect(html, "the lone action stretches").toContain("w-full");
  });

  it("rule 7: the bar and the tile render byte-identical YOU PAY figures", () => {
    const barFigure = renderBar().match(/KES\s?[\d,]+/)?.[0];
    const tile = renderToStaticMarkup(
      createElement(DealCard, {
        href: "/deals/d1",
        imageUrl: null,
        merchantName: "Riverside Fabrics",
        title: "3 metres of cotton print",
        merchantId: "m1",
        pay: PAY,
        wasKes: WAS,
        variant: "lead",
      })
    );
    const tileFigure = tile.match(/KES\s?[\d,]+/)?.[0];
    expect(barFigure).toBe("KES 1,200");
    expect(tileFigure, "tile and decision bar must agree exactly").toBe(barFigure);
  });

  it("deal detail keeps the itemised breakdown and drops the duplicate hero", () => {
    const src = code("app/(shopper)/deals/[id]/page.tsx");
    expect(src).toContain("pay={pay}");
    expect(src).toContain("was={was}");
    // The standalone body figure is gated on the deal NOT being claimable —
    // matched loosely so prettier's line breaks are not part of the contract.
    expect(src).toMatch(/!claimable\s*\?/);
    // Rule 7: the breakdown survives, on detail only.
    expect(src).toContain("Deal price");
    expect(src).toContain("Total you pay");
    expect(code("app/(shopper)/tickets/[id]/page.tsx")).not.toContain("Total you pay");
  });

  it("ticket: the price is anchored and protected, outside the code card", () => {
    const src = code("app/(shopper)/tickets/[id]/page.tsx");
    expect(src).toMatch(/items-baseline justify-between/);
    expect(src).toMatch(/whitespace-nowrap[^"]*text-2xl font-bold text-ink/);
    // Rule 6 — the code card holds the code alone. Checked on raw source: a
    // price must not appear there even in a comment-stripped sense, and a bare
    // numeral is as much a violation as a KES-prefixed one.
    const codeCard = raw("app/(shopper)/tickets/[id]/claimed-code.tsx");
    expect(codeCard).not.toMatch(/KES/);
    expect(codeCard).not.toMatch(/You pay/i);
    expect(codeCard).not.toMatch(/\bpay\b/i);
  });

  it("rule 3: no price surface carries amber at all", () => {
    for (const rel of [
      "app/(shopper)/deals/[id]/page.tsx",
      "app/(shopper)/deals/[id]/claim-flow.tsx",
      "app/(shopper)/tickets/[id]/page.tsx",
    ]) {
      const src = code(rel);
      expect(src, `${rel} must not colour text amber`).not.toContain("text-brand");
      expect(src, `${rel} must not fill amber directly`).not.toContain("bg-brand");
    }
  });
});
