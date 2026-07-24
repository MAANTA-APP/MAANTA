import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

// next/link → a plain anchor for static rendering (no router context in tests).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

import { WalletHeader } from "../wallet-header";

describe("WalletHeader", () => {
  it("shows the balance in ink and links to the existing wallet page", () => {
    const html = renderToStaticMarkup(createElement(WalletHeader, { balance: 540 }));
    expect(html).toContain("Wallet");
    expect(html).toContain("KES 540");
    expect(html).toContain('href="/merchant/wallet"');
    // Money stays ink, never colour-coded.
    expect(html).toContain("text-ink");
    expect(html).not.toContain("text-brand");
  });

  it("renders a zero balance without breaking", () => {
    const html = renderToStaticMarkup(createElement(WalletHeader, { balance: 0 }));
    expect(html).toContain("KES 0");
  });
});
