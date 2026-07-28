import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isClerkAuth } from "../auth/strategy";

const srcRoot = join(process.cwd(), "src");

const AUTH_ROUTE_FILES = [
  "app/login/[[...sign-in]]/page.tsx",
  "app/sign-up/[[...sign-up]]/page.tsx",
] as const;

const CLERK_UI_MARKERS = [
  "ClerkAuthShell",
  "Secured by Clerk",
  "@clerk/nextjs",
  "data-clerk",
] as const;

function readRouteSource(rel: (typeof AUTH_ROUTE_FILES)[number]): string {
  return readFileSync(join(srcRoot, rel), "utf8");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public auth routes (/login, /sign-up)", () => {
  it.each(AUTH_ROUTE_FILES)(
    "%s branches on isClerkAuth and renders SupabaseEmailLogin when strategy is supabase",
    (rel) => {
      const src = readRouteSource(rel);
      expect(src).toMatch(/if\s*\(\s*isClerkAuth\(\)\s*\)/);
      expect(src).toContain("ClerkAuthShell");
      expect(src).toContain("SupabaseEmailLogin");
      expect(src).toMatch(/export const dynamic\s*=\s*["']force-dynamic["']/);
    }
  );

  it.each([
    ["supabase", "supabase"],
    ["clerk", "supabase"],
    ["supabase", "clerk"],
    ["", ""],
  ] as const)(
    "does not enable clerk auth when MAANTA=%s and NEXT_PUBLIC=%s (unless both clerk)",
    (server, client) => {
      vi.stubEnv("MAANTA_AUTH_STRATEGY", server);
      vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", client);
      const bothClerk = server === "clerk" && client === "clerk";
      expect(isClerkAuth()).toBe(bothClerk);
    }
  );

  it("enables clerk auth only when both vars are explicitly clerk", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "clerk");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "clerk");
    expect(isClerkAuth()).toBe(true);
  });

  it("middleware uses authStrategy() — not a hardcoded clerk fallback", () => {
    const middleware = readFileSync(join(srcRoot, "middleware.ts"), "utf8");
    expect(middleware).toContain("authStrategy()");
    expect(middleware).not.toMatch(/strategy\s*===\s*["']clerk["']/);
  });

  it("AuthProviders skips ClerkProvider unless client strategy is clerk", () => {
    const providers = readFileSync(
      join(srcRoot, "components/auth/auth-providers.tsx"),
      "utf8"
    );
    expect(providers).toMatch(/if\s*\(\s*!isClerkAuthClient\(\)\s*\)/);
    expect(providers).toContain("ClerkProvider");
  });

  it("SupabaseEmailLogin does not import Clerk UI", () => {
    const supabaseLogin = readFileSync(
      join(srcRoot, "components/auth/supabase-email-login.tsx"),
      "utf8"
    );
    for (const marker of CLERK_UI_MARKERS) {
      expect(supabaseLogin).not.toContain(marker);
    }
  });
});
