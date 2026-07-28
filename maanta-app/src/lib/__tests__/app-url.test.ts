import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppOrigin,
  getAuthEmailRedirectTo,
  PRODUCTION_APP_ORIGIN,
} from "@/lib/app-url";

describe("getAppOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns configured URL without trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maanta.app/");
    expect(getAppOrigin()).toBe("https://maanta.app");
  });

  it("falls back to localhost in development when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("defaults to www.maanta.app in production when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getAppOrigin()).toBe(PRODUCTION_APP_ORIGIN);
  });

  it("ignores localhost NEXT_PUBLIC_APP_URL in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    expect(getAppOrigin()).toBe(PRODUCTION_APP_ORIGIN);
  });
});

describe("getAuthEmailRedirectTo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds production callback URL on www.maanta.app", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getAuthEmailRedirectTo("/select-mall")).toBe(
      "https://www.maanta.app/auth/callback?next=%2Fselect-mall"
    );
  });
});
