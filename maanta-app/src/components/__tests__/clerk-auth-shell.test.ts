import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ClerkAuthShell } from "../clerk-auth-shell";

let capturedAppearance: unknown;

vi.mock("@clerk/nextjs", () => ({
  ClerkLoading: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-loading" }, children),
  ClerkFailed: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-failed" }, children),
  ClerkLoaded: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-testid": "clerk-loaded" }, children),
  SignUp: (props: { appearance?: unknown }) => {
    capturedAppearance = props.appearance;
    return createElement("div", { "data-testid": "clerk-signup" });
  },
  SignIn: (props: { appearance?: unknown }) => {
    capturedAppearance = props.appearance;
    return createElement("div", { "data-testid": "clerk-signin" });
  },
}));

// Clerk-hosted auth pages must never render an empty shell when Clerk is still
// loading or blocked — the loading skeleton is the regression guard.
// Loaded state must be a single Claude card (not Maanta card + Clerk cardBox).

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

  it("uses one auth card and strips Clerk cardBox/card chrome when loaded", () => {
    const html = renderToStaticMarkup(createElement(ClerkAuthShell, { mode: "sign-in" }));
    expect(html).toContain('data-testid="auth-card"');
    // Heading sits outside the card; only one shadow-card silhouette in the loaded tree.
    const loaded = html.match(
      /data-testid="clerk-loaded"[\s\S]*?(?=data-testid="clerk-|$)/
    )?.[0];
    expect(loaded).toBeTruthy();
    expect(loaded!.match(/shadow-card/g)?.length ?? 0).toBe(1);

    const elements = (capturedAppearance as { elements: Record<string, string> }).elements;
    expect(elements.cardBox).toContain("!shadow-none");
    expect(elements.card).toContain("!bg-transparent");
    expect(elements.footer).toContain("!bg-transparent");
  });
});
