import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DealKpis } from "@/components/ui/claude/deal-kpis";

/**
 * Decision KPIs on a deal card (founder request 2026-08-22): a card was too
 * thin to decide from, so it now carries how much better than usual, how many
 * are left, and how many redemptions the shop has actually verified.
 *
 * A KPI is a claim, so the tests are mostly about honesty: nothing renders
 * without its input, the discount agrees with the prices on the same card, and
 * no number is coloured (frozen rule 3) or carries meaning by colour alone
 * (frozen rule 4).
 */

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(DealKpis, props));

describe("deal KPIs", () => {
  it("states the discount from the same figures the card shows", () => {
    // 2,000 → 1,200 is 40% off. Arithmetic, not a merchant-typed claim.
    expect(render({ pay: 1200, was: 2000 })).toContain("40% off");
  });

  it("rounds the discount rather than inventing precision", () => {
    // 999 → 750 is 24.92…%
    expect(render({ pay: 750, was: 999 })).toContain("25% off");
  });

  it("shows no discount when there is no compare-at price", () => {
    expect(render({ pay: 1200, was: null })).not.toContain("off");
  });

  it("shows no discount when the compare-at price is not actually higher", () => {
    expect(render({ pay: 1200, was: 1200 })).not.toContain("off");
    expect(render({ pay: 1200, was: 900 })).not.toContain("off");
  });

  it("counts down what is left, not up what is taken", () => {
    expect(render({ claimsReserved: 28, maxClaims: 40 })).toContain("12 left");
  });

  it("says fully claimed rather than '0 left'", () => {
    const html = render({ claimsReserved: 40, maxClaims: 40 });
    expect(html).toContain("Fully claimed");
    expect(html).not.toContain("0 left");
  });

  it("shows no scarcity when the merchant set no cap", () => {
    const html = render({ claimsReserved: 28, maxClaims: null });
    expect(html).not.toContain("left");
    expect(html).not.toContain("Fully claimed");
  });

  it("states a zero verified count plainly instead of hiding it", () => {
    expect(render({ verifiedCount: 0 })).toContain("0 verified");
  });

  it("renders nothing at all when it knows nothing", () => {
    expect(render({ pay: 1200 })).toBe("");
  });

  it("frozen rules: no coloured numbers, and the check icon carries the state", () => {
    const html = render({ pay: 1200, was: 2000, claimsReserved: 28, maxClaims: 40, verifiedCount: 7 });
    for (const banned of ["text-brand", "bg-brand", "text-rust", "bg-rust", "text-flame"]) {
      expect(html, `KPIs must not carry ${banned}`).not.toContain(banned);
    }
    // Verified is icon + word, so it survives greyscale (frozen rule 4). The
    // icon is the only coloured thing and it is decorative to a screen reader.
    expect(html).toContain("verified");
    expect(html).toContain("aria-hidden");
  });

  it("the tall card variants render it; the rail card stays glanceable", () => {
    const card = readFileSync(
      path.resolve(__dirname, "../ui/claude/deal-card.tsx"),
      "utf8"
    );
    // Three uses: lead, row, vertical. The 17.5rem horizontal rail card is
    // deliberately left out — a KPI row would crowd it.
    expect(card.match(/<DealKpis/g)?.length).toBe(3);
  });

  it("search results carry the KPIs — the surface that prompted this", () => {
    // D213 moved the results list into a client collection so an expired
    // result leaves it; the card props are now built as an object on the page
    // instead of as JSX attributes. Same KPIs, same surface, new spelling.
    const search = readFileSync(
      path.resolve(__dirname, "../../app/(shopper)/search/page.tsx"),
      "utf8"
    );
    expect(search).toContain('variant: "row" as const');
    // D236: the scarcity KPI must read the ISSUED counter. Pinning the exact
    // source here is the point of the assertion — wired to `claims_count` it
    // rendered "12 left" on a deal whose 40 codes were all already handed out.
    expect(search).toContain("claimsReserved: d.claims_reserved");
    expect(search).not.toContain("claimsReserved: d.claims_count");
    expect(search).toContain("maxClaims: d.max_claims");
    expect(search).toContain("wasKes: priced.was");
    // The thin legacy card must not come back to this surface.
    expect(search).not.toContain("DealCardHorizontal");
  });
});
