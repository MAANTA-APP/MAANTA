import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

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

import LandingPage from "@/app/(public)/page";

describe("LandingPage", () => {
  it("renders account CTAs and product screens", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).toContain("Create account");
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/login"');
    expect(html).toContain("Browse live deals");
    expect(html).toContain("How Maanta works");
    expect(html).toContain("Open deals near your mall");
    expect(html).toContain("Claim on your phone");
    expect(html).toContain("Redeem at the counter");
    expect(html).toContain("See Maanta in action");
    expect(html).toContain("Join merchant waitlist");
    expect(html).not.toContain("Join waitlist");
  });
});
