import { afterEach, describe, expect, it } from "vitest";
import { getAppOrigin } from "@/lib/app-url";

describe("getAppOrigin", () => {
  const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalUrl;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns configured URL without trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://maanta.app/";
    expect(getAppOrigin()).toBe("https://maanta.app");
  });

  it("falls back to localhost in development when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("returns null in production when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    expect(getAppOrigin()).toBeNull();
  });
});
