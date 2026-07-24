import { describe, expect, it } from "vitest";
import { envHealth } from "@/lib/health";

// A fully-wired production-shaped env for the required groups.
const fullEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://axrrslqssmbngbataejg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk",
  CLERK_SECRET_KEY: "sk",
  NEXT_PUBLIC_APP_URL: "https://maanta.app",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  W3W_API_KEY: "w3w",
} as Record<string, string>;

describe("envHealth (E10 self-check)", () => {
  it("reports booleans only — never a value", () => {
    const report = envHealth(fullEnv);
    const json = JSON.stringify(report);
    // No secret material leaks into the report.
    expect(json).not.toContain("service");
    expect(json).not.toContain("whsec_x");
    for (const g of Object.values(report.groups)) {
      for (const v of Object.values(g.vars)) expect(typeof v).toBe("boolean");
    }
  });

  it("is ready when every non-optional group is complete (optional integrations absent)", () => {
    const report = envHealth(fullEnv);
    expect(report.groups.supabase.complete).toBe(true);
    expect(report.groups.auth.complete).toBe(true);
    expect(report.groups.stripe.complete).toBe(true);
    // Optional + absent must not block readiness.
    expect(report.groups.monitoring.complete).toBe(false);
    expect(report.groups.monitoring.optional).toBe(true);
    expect(report.ready).toBe(true);
  });

  it("is NOT ready when a required group is incomplete", () => {
    const { SUPABASE_SERVICE_ROLE_KEY, ...missingService } = fullEnv;
    void SUPABASE_SERVICE_ROLE_KEY;
    const report = envHealth(missingService);
    expect(report.groups.supabase.complete).toBe(false);
    expect(report.groups.supabase.vars.SUPABASE_SERVICE_ROLE_KEY).toBe(false);
    expect(report.ready).toBe(false);
  });

  it("treats a blank / whitespace-only var as missing", () => {
    const report = envHealth({ ...fullEnv, W3W_API_KEY: "   " });
    expect(report.groups.w3w.vars.W3W_API_KEY).toBe(false);
    expect(report.ready).toBe(false);
  });

  it("surfaces Stripe/IntaSend mode as a non-secret note", () => {
    expect(envHealth(fullEnv).groups.stripe.note).toContain("test/sandbox");
    expect(
      envHealth({ ...fullEnv, STRIPE_ENV: "live" }).groups.stripe.note
    ).toContain("live");
  });
});
