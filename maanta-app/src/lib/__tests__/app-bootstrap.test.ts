import { describe, it, expect } from "vitest";
import { dashboardPathForUser } from "@/lib/app-bootstrap";

describe("dashboardPathForUser", () => {
  it("routes founder email to /founder even with admin role", () => {
    expect(dashboardPathForUser("admin", "founder@maanta.app")).toBe("/founder");
  });

  it("routes admin to /admin", () => {
    expect(dashboardPathForUser("admin", "admin@maanta.app")).toBe("/admin");
  });

  it("routes customers to /feed", () => {
    expect(dashboardPathForUser("customer", "shopper.ke@maanta.app")).toBe("/feed");
  });
});
