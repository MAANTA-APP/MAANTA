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

vi.mock("@/components/pwa-install-button", () => ({
  PwaInstallButton: () => createElement("div", { "data-testid": "pwa-install" }, "Install"),
}));

import DownloadPage from "@/app/download/page";

describe("DownloadPage", () => {
  it("renders install guidance and sign-in CTA", () => {
    const html = renderToStaticMarkup(createElement(DownloadPage));
    expect(html).toContain("Install Maanta on your phone");
    expect(html).toContain("iPhone / iPad (Safari)");
    expect(html).toContain("Android (Chrome)");
    expect(html).toContain('href="/login?next=/app-bootstrap"');
    expect(html).toContain('href="/help/phone-login"');
    expect(html).toContain('href="/app-bootstrap"');
  });
});
