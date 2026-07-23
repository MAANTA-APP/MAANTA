import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppOrigin } from "@/lib/app-url";

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

  it("returns null in production when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getAppOrigin()).toBeNull();
  });
});
