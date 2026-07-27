import { describe, it, expect } from "vitest";
import { dashboardPathForUser } from "@/lib/app-bootstrap";

describe("dashboardPathForUser", () => {
  it("routes founder email to /founder even with admin role", () => {
    expect(dashboardPathForUser("admin", "founder@maanta.app")).toBe("/founder");
  });

  it("routes admin to /admin", () => {
    expect(dashboardPathForUser("admin", "admin@maanta.app")).toBe("/admin");
  });

  it("routes agent to /agent", () => {
    expect(dashboardPathForUser("agent", "agent@maanta.app")).toBe("/agent");
  });

  it("routes merchant roles to merchant dashboard", () => {
    expect(dashboardPathForUser("merchant_admin", "merchant.a.owner@maanta.app")).toBe(
      "/merchant/dashboard",
    );
    expect(dashboardPathForUser("merchant_staff", "merchant.a.staff@maanta.app")).toBe(
      "/merchant/dashboard",
    );
  });

  it("routes customers to /feed", () => {
    expect(dashboardPathForUser("customer", "shopper.ke@maanta.app")).toBe("/feed");
  });
});
