import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

import { ClaimFlow } from "@/app/(shopper)/deals/[id]/claim-flow";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

const renderBar = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ClaimFlow, {
      dealId: "d1",
      dealTitle: "3 metres of cotton print",
      merchantName: "Riverside Fabrics",
      w3w: "stored.riches.shine",
      node: "BBS Mall",
      signedIn: true,
      pay: 1200,
      was: 2000,
      ...props,
    })
  );

describe("Direction A — anchored decision bar", () => {
  it("deal detail: the price and the action sit in the same bar", () => {
    const html = renderBar();
    expect(html).toContain("You pay");
    expect(html).toContain("KES 1,200");
    expect(html).toContain("KES 2,000");
    expect(html).toContain("line-through");
    expect(html).toContain("Claim deal");
    // Anchored, not stacked: one row, price left, action right.
    expect(html).toContain("flex items-center justify-between");
  });

  it("the bar's money is ink and never amber or coloured", () => {
    const html = renderBar();
    const cls =
      html.match(/<(?:div|span) class="([^"]*)"[^>]*>KES\s?1,200/)?.[1] ?? "";
    expect(cls, "the pay figure should render in the bar").not.toBe("");
    expect(cls).toContain("text-ink");
    for (const banned of ["text-brand", "bg-brand", "text-rust", "text-verified", "text-flame"]) {
      expect(cls, `money must not carry ${banned}`).not.toContain(banned);
    }
  });

  it("with no price the bar degrades to the full-width action it was", () => {
    const html = renderBar({ pay: null, was: null });
    expect(html).not.toContain("You pay");
    expect(html).toContain("Claim deal");
  });

  it("deal detail keeps the itemised breakdown and drops the duplicate hero", () => {
    const src = read("app/(shopper)/deals/[id]/page.tsx");
    // The figure is handed to the bar…
    expect(src).toContain("pay={pay}");
    expect(src).toContain("was={was}");
    // …and the standalone body figure only renders when there is no bar.
    expect(src).toContain("{!claimable ? (");
    // The breakdown (rule 7: detail-only) survives.
    expect(src).toContain("Deal price");
    expect(src).toContain("Total you pay");
  });

  it("ticket: the price is anchored, outside the code card", () => {
    const src = read("app/(shopper)/tickets/[id]/page.tsx");
    expect(src).toContain("flex items-baseline justify-between");
    // Rule 6 — the code card renders the code alone; no price is passed to it.
    const codeCard = read("app/(shopper)/tickets/[id]/claimed-code.tsx");
    expect(codeCard).not.toMatch(/KES/);
    expect(codeCard).not.toMatch(/You pay/i);
  });

  it("rule 7: every surface formats the figure the same way", () => {
    const bar = renderBar().match(/KES\s?1,200/)?.[0];
    const sources = [
      "app/(shopper)/deals/[id]/page.tsx",
      "app/(shopper)/tickets/[id]/page.tsx",
      "components/ui/claude/deal-card.tsx",
    ];
    expect(bar).toBeTruthy();
    for (const rel of sources) {
      // One formatter everywhere — never a hand-rolled toFixed or template.
      expect(read(rel), `${rel} formats KES via toLocaleString`).toContain(
        'toLocaleString("en-KE")'
      );
    }
  });
});
