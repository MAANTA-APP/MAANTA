import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const { mockIsClerkAuth } = vi.hoisted(() => ({
  mockIsClerkAuth: vi.fn<() => boolean>(),
}));

vi.mock("@/lib/auth/strategy", () => ({
  isClerkAuth: () => mockIsClerkAuth(),
}));

vi.mock("@/components/clerk-auth-shell", () => ({
  ClerkAuthShell: ({ mode }: { mode: string }) =>
    createElement(
      "div",
      { "data-testid": "clerk-auth-shell", "data-clerk-ui": "true" },
      `Clerk:${mode}`
    ),
}));

vi.mock("@/components/auth/supabase-email-login", () => ({
  SupabaseEmailLogin: ({ mode }: { mode: string }) =>
    createElement(
      "div",
      { "data-testid": "supabase-email-login" },
      `Supabase:${mode}`
    ),
}));

const AUTH_PAGES = [
  {
    name: "login",
    importPath: "@/app/login/[[...sign-in]]/page",
    clerkMode: "sign-in" as const,
    supabaseMode: "sign-in" as const,
  },
  {
    name: "sign-up",
    importPath: "@/app/sign-up/[[...sign-up]]/page",
    clerkMode: "sign-up" as const,
    supabaseMode: "sign-up" as const,
  },
] as const;

afterEach(() => {
  vi.resetModules();
  mockIsClerkAuth.mockReset();
});

describe("auth pages (/login, /sign-up)", () => {
  it.each(AUTH_PAGES)(
    "$name renders Supabase email OTP when strategy is supabase",
    async ({ importPath }) => {
      mockIsClerkAuth.mockReturnValue(false);
      const { default: Page } = await import(importPath);
      const html = renderToStaticMarkup(createElement(Page));

      expect(html).toContain('data-testid="supabase-email-login"');
      expect(html).not.toContain('data-testid="clerk-auth-shell"');
      expect(html).not.toContain("data-clerk-ui");
      expect(html).not.toMatch(/Secured by Clerk/i);
    }
  );

  it.each(AUTH_PAGES)(
    "$name renders Clerk shell when strategy is clerk",
    async ({ importPath, clerkMode }) => {
      mockIsClerkAuth.mockReturnValue(true);
      const { default: Page } = await import(importPath);
      const html = renderToStaticMarkup(createElement(Page));

      expect(html).toContain('data-testid="clerk-auth-shell"');
      expect(html).toContain(`Clerk:${clerkMode}`);
      expect(html).not.toContain('data-testid="supabase-email-login"');
    }
  );

  it.each(AUTH_PAGES)(
    "$name is force-dynamic so auth UI is not baked in at build time",
    async ({ importPath }) => {
      const mod = await import(importPath);
      expect(mod.dynamic).toBe("force-dynamic");
    }
  );
});
