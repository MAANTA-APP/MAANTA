import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

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

import { DealCard } from "@/components/ui/claude";

describe("DealCard (Claude design system)", () => {
  it("renders flash rail card with YOU PAY and struck compare price", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        href: "/deals/d1",
        imageUrl: null,
        merchantName: "Nyama Spot",
        mallName: "BBS Mall",
        title: "Platter for two",
        // D213 criterion 3 — the card derives its own expiry label from
        // `expiresAt` on the shopper clock. There is no `expiryLabel` prop to
        // pass any more, precisely so a server-frozen string cannot sit beside
        // a ticking chip disagreeing with it.
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        distanceLabel: "120 m",
        pay: 500,
        wasKes: 900,
        tag: "flash",
        merchantId: "m1",
        isFavourite: false,
      })
    );
    expect(html).toContain("Nyama Spot");
    expect(html).toContain("You pay");
    expect(html).toContain("KES 500");
    expect(html).toContain("KES 900");
    expect(html).toContain("line-through");
    expect(html).toContain("120 m");
    expect(html).toMatch(/Expires in \d+h \d+m/);
    expect(html).toContain("Flash");
  });

  it("renders vertical standard card with Standard badge", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        href: "/deals/d2",
        imageUrl: null,
        merchantName: "Coffee Co",
        mallName: "BBS Mall",
        title: "Morning brew",
        pay: 200,
        tag: "standard",
        merchantId: "m2",
        variant: "vertical",
      })
    );
    expect(html).toContain("Coffee Co");
    expect(html).toContain("Morning brew");
    expect(html).toContain("BBS Mall");
    expect(html).toContain("Standard");
  });
});
