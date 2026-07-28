import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isClerkAuth } from "../auth/strategy";

const srcRoot = join(process.cwd(), "src");

const AUTH_ROUTE_FILES = [
  "app/login/[[...sign-in]]/page.tsx",
  "app/sign-up/[[...sign-up]]/page.tsx",
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

  it("does not render Clerk auth when MAANTA_AUTH_STRATEGY=supabase", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "supabase");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "supabase");
    expect(isClerkAuth()).toBe(false);
  });

  it("AuthProviders skips ClerkProvider unless client strategy is clerk", () => {
    const providers = readFileSync(
      join(srcRoot, "components/auth/auth-providers.tsx"),
      "utf8"
    );
    expect(providers).toMatch(/if\s*\(\s*!isClerkAuthClient\(\)\s*\)/);
    expect(providers).toContain("ClerkProvider");
  });
});
