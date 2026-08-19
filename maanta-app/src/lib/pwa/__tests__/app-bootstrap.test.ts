import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { destinationForRole } from "@/lib/pwa/app-bootstrap";
import { DownloadHeroCopy } from "@/app/(marketing)/download/download-install-panel";
import manifest from "@/app/manifest";

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

/**
 * The manifest contract — drift **D141**.
 *
 * An installed PWA opens at `start_url` in a standalone window with no address
 * bar, so a user who lands on a broken bootstrap has no route back — and
 * `/app-bootstrap` has no UI of its own, only a role lookup and a redirect, so a
 * failure presents as a blank screen rather than an error anyone reports. This
 * suite covered `destinationForRole` and nothing connected the manifest to the
 * route: the `start_url` string could be edited to a typo, or the route
 * directory renamed, and every test here would stay green.
 *
 * The check maps app-router URLs to page files by walking `src/app` and
 * stripping route groups (`(shopper)`, `(app)` — invisible in the URL), which is
 * the same resolution Next itself performs. It covers three classes of route an
 * installed user is sent to with no way to type an address: the `start_url`
 * itself, the signed-out bounce to `/login`, and every `destinationForRole`
 * target.
 *
 * Deliberately NOT covered here: the signed-out *behaviour* of `/app-bootstrap`
 * (needs a route-level render this repo only does for marketing pages) and
 * whether the install prompt ever fires (a device question — drift **D139**).
 */
describe("the manifest start_url contract (D141)", () => {
  const APP_DIR = path.resolve(__dirname, "..", "..", "..", "app");

  /** Every URL path served by a page.tsx under src/app, route groups elided. */
  function routableUrls(dir = APP_DIR, urlSegments: string[] = [], out = new Set<string>()) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        // Route groups are URL-invisible; optional catch-alls match the bare path.
        const isGroup = name.startsWith("(") && name.endsWith(")");
        const isOptionalCatchAll = name.startsWith("[[");
        const next = isGroup || isOptionalCatchAll ? urlSegments : [...urlSegments, name];
        routableUrls(full, next, out);
      } else if (name === "page.tsx" || name === "page.ts") {
        out.add("/" + urlSegments.join("/"));
      }
    }
    return out;
  }

  const urls = routableUrls();

  it("start_url points at a page that exists", () => {
    const startUrl = manifest().start_url;
    expect(startUrl, "the manifest must declare a start_url").toBeTruthy();
    expect(
      urls.has(startUrl as string),
      `start_url "${startUrl}" resolves to no page under src/app. An installed ` +
        "user opens here in a standalone window with no address bar — a broken " +
        "start_url is a blank screen with no route back."
    ).toBe(true);
  });

  it("the signed-out bounce target exists", () => {
    // Both bootstrap variants redirect to /login when unauthenticated, which is
    // most of an install prompt's audience.
    expect(urls.has("/login")).toBe(true);
  });

  it("every role destination points at a page that exists", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const roles = [
      "customer",
      "merchant_admin",
      "merchant_staff",
      "admin",
      "agent",
      "founder",
      "cofounder",
      undefined, // the fallback
    ];
    const broken = roles
      .map((role) => ({ role, dest: destinationForRole(role) }))
      .filter(({ dest }) => !urls.has(dest));
    warn.mockRestore();
    expect(
      broken.map(({ role, dest }) => `${role ?? "(fallback)"} → ${dest}`),
      "a role routes to a page that does not exist — the person lands on a 404 " +
        "immediately after installing or signing in"
    ).toEqual([]);
  });
});
