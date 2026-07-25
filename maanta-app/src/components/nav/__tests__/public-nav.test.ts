import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PublicNav } from "../public-nav";

vi.mock("@clerk/nextjs", () => ({
  ClerkLoading: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-loading" }, children),
  ClerkFailed: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-failed" }, children),
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "signed-out" }, children),
  SignedIn: () => null,
  UserButton: () => null,
}));

// Sign-in must be a plain /login link — not SignInButton — so nav works when Clerk JS is blocked.

describe("PublicNav", () => {
  it("renders sign-in and sign-up as relative links without SignInButton", () => {
    const html = renderToStaticMarkup(createElement(PublicNav));
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/sign-up"');
    expect(html).not.toMatch(/vercel\.app/);
    expect(html).not.toMatch(/https?:\/\/.*\/login/);
  });
});
