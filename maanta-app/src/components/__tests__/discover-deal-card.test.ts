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
        collectionLabel: "Collect 2–6pm",
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
    expect(html).toContain("Collect 2–6pm");
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
