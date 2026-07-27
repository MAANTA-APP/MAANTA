import { describe, expect, it } from "vitest";
import {
  canAccessAdminConsole,
  canAccessAgentConsole,
  canAccessFounderDashboard,
  getDefaultRouteForRole,
} from "@/lib/roles";

describe("role access matrix", () => {
  it("admin reaches admin, founder, and agent consoles", () => {
    expect(canAccessAdminConsole("admin")).toBe(true);
    expect(canAccessFounderDashboard("admin")).toBe(true);
    expect(canAccessAgentConsole("admin")).toBe(true);
  });

  it("cofounder reaches founder and agent but not admin", () => {
    expect(canAccessFounderDashboard("cofounder")).toBe(true);
    expect(canAccessAgentConsole("cofounder")).toBe(true);
    expect(canAccessAdminConsole("cofounder")).toBe(false);
  });

  it("agent reaches agent console only among ops surfaces", () => {
    expect(canAccessAgentConsole("agent")).toBe(true);
    expect(canAccessAdminConsole("agent")).toBe(false);
    expect(canAccessFounderDashboard("agent")).toBe(false);
  });

  it("merchant and shopper roles are blocked from ops consoles", () => {
    for (const role of ["customer", "merchant_admin", "merchant_staff"] as const) {
      expect(canAccessAdminConsole(role)).toBe(false);
      expect(canAccessFounderDashboard(role)).toBe(false);
      expect(canAccessAgentConsole(role)).toBe(false);
    }
  });
});

describe("getDefaultRouteForRole", () => {
  it("routes each role to its default console", () => {
    expect(getDefaultRouteForRole("customer")).toBe("/feed");
    expect(getDefaultRouteForRole("merchant_admin")).toBe("/merchant/dashboard");
    expect(getDefaultRouteForRole("merchant_staff")).toBe("/merchant/dashboard");
    expect(getDefaultRouteForRole("admin")).toBe("/admin");
    expect(getDefaultRouteForRole("agent")).toBe("/agent");
    expect(getDefaultRouteForRole("cofounder")).toBe("/founder");
  });
});
