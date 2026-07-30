import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  criticalEnvNames,
  reportCriticalEnv,
  warnMissingCriticalEnv,
  buildTimePublicEnvNames,
  ENV_CATALOG,
  __resetEnvWarnLatchForTests,
} from "../env";

const TOUCHED = [
  "MAANTA_AUTH_STRATEGY",
  "NEXT_PUBLIC_MAANTA_AUTH_STRATEGY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NODE_ENV",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of TOUCHED) saved[k] = process.env[k];
  __resetEnvWarnLatchForTests();
});

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetEnvWarnLatchForTests();
});

describe("ENV_CATALOG", () => {
  it("includes auth strategy and supabase core vars", () => {
    const names = ENV_CATALOG.map((e) => e.name);
    expect(names).toContain("MAANTA_AUTH_STRATEGY");
    expect(names).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(names).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("marks NEXT_PUBLIC_* as build-time public", () => {
    for (const entry of ENV_CATALOG) {
      if (entry.name.startsWith("NEXT_PUBLIC_")) {
        expect(entry.buildTimePublic).toBe(true);
        expect(entry.redeployRequired).toBe(true);
      }
    }
  });
});

describe("criticalEnvNames", () => {
  it("requires Clerk keys for clerk strategy", () => {
    expect(criticalEnvNames("clerk")).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ]);
  });

  it("omits Clerk keys for supabase strategy", () => {
    expect(criticalEnvNames("supabase")).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("treats authjs like supabase", () => {
    expect(criticalEnvNames("authjs")).toEqual(criticalEnvNames("supabase"));
  });
});

describe("reportCriticalEnv", () => {
  it("reports ok when clerk strategy has all keys", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    process.env.CLERK_SECRET_KEY = "sk_test";
    const r = reportCriticalEnv("clerk");
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("allows missing Clerk keys under supabase strategy", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const r = reportCriticalEnv("supabase");
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("lists missing vars under clerk strategy", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const r = reportCriticalEnv("clerk");
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("CLERK_SECRET_KEY");
    expect(r.missing).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  });
});

describe("warnMissingCriticalEnv", () => {
  it("warns once when critical env is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMissingCriticalEnv("supabase");
    warnMissingCriticalEnv("supabase");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("buildTimePublicEnvNames", () => {
  it("returns only NEXT_PUBLIC_* catalog entries", () => {
    const names = buildTimePublicEnvNames();
    expect(names.every((n) => n.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect(names).toContain("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY");
  });
});
