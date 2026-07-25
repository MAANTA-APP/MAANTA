import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ClerkAuthShell } from "../clerk-auth-shell";

vi.mock("@clerk/nextjs", () => ({
  ClerkLoading: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-loading" }, children),
  ClerkFailed: () => null,
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
});
