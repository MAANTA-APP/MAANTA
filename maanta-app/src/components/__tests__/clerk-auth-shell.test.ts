import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ClerkAuthShell } from "../clerk-auth-shell";

vi.mock("@clerk/nextjs", () => ({
  ClerkLoading: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-loading" }, children),
  ClerkFailed: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-failed" }, children),
  ClerkLoaded: () => null,
  SignUp: () => null,
  SignIn: () => null,
}));

// Clerk-hosted auth pages must never render an empty shell when Clerk is still
// loading or blocked — the loading skeleton is the regression guard.

describe("ClerkAuthShell", () => {
  it("renders a visible loading state while Clerk loads", () => {
    const html = renderToStaticMarkup(createElement(ClerkAuthShell, { mode: "sign-up" }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
  });

  it("renders relative fallback links on sign-up failure (no hard-coded deployment URLs)", () => {
    const html = renderToStaticMarkup(createElement(ClerkAuthShell, { mode: "sign-up" }));
    expect(html).toContain("Couldn’t load sign-up");
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/feed"');
    expect(html).not.toMatch(/vercel\.app/);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("renders relative fallback links on sign-in failure", () => {
    const html = renderToStaticMarkup(createElement(ClerkAuthShell, { mode: "sign-in" }));
    expect(html).toContain("Couldn’t load sign-in");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/feed"');
    expect(html).not.toMatch(/vercel\.app/);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("mentions Clerk/domain misconfiguration when a publishable key is present", () => {
    const prev = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_example";
    try {
      const html = renderToStaticMarkup(createElement(ClerkAuthShell, { mode: "sign-in" }));
      expect(html).toContain("Clerk may be blocked or misconfigured");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prev;
    }
  });
});
