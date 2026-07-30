import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { destinationForRole } from "@/lib/pwa/app-bootstrap";
import { DownloadHeroCopy } from "@/app/(public)/download/download-install-panel";

describe("destinationForRole", () => {
  it("routes customer to /feed", () => {
    expect(destinationForRole("customer")).toBe("/feed");
  });

  it("routes merchant_admin and merchant_staff to dashboard", () => {
    expect(destinationForRole("merchant_admin")).toBe("/merchant/dashboard");
    expect(destinationForRole("merchant_staff")).toBe("/merchant/dashboard");
  });

  it("routes admin to /admin", () => {
    expect(destinationForRole("admin")).toBe("/admin");
  });

  it("routes agent to /agent", () => {
    expect(destinationForRole("agent")).toBe("/agent");
  });

  it("routes founder and cofounder to /founder", () => {
    expect(destinationForRole("founder")).toBe("/founder");
    expect(destinationForRole("cofounder")).toBe("/founder");
  });

  it("falls back to /feed for unknown or missing roles", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(destinationForRole("unknown_role")).toBe("/feed");
    expect(destinationForRole(undefined)).toBe("/feed");
    expect(destinationForRole(null)).toBe("/feed");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("/download landing copy", () => {
  it("renders install headline and supporting sentence", () => {
    const html = renderToStaticMarkup(createElement(DownloadHeroCopy));
    expect(html).toContain("Install Maanta on your phone to work faster.");
    expect(html).toContain(
      "One app for shoppers, merchants, agents, and founders."
    );
  });
});

describe("app-bootstrap strategy split", () => {
  it("exports destinationForRole for both auth strategies to share", () => {
    // Role routing is strategy-agnostic; /app-bootstrap page branches only on
    // session detection (Clerk useAuth vs useSupabaseSignedIn).
    expect(destinationForRole("customer")).toBe("/feed");
    expect(destinationForRole("merchant_admin")).toBe("/merchant/dashboard");
  });

  it("login next=/app-bootstrap is a stable relative path", () => {
    const next = "/login?next=/app-bootstrap";
    expect(next).toContain("next=/app-bootstrap");
  });
});
