import { describe, it, expect, beforeAll } from "vitest";

/**
 * Guard for drift **D62** — the app shipped no response security headers.
 *
 * Asserts against `next.config.mjs`'s real `headers()` output rather than a
 * copy of the expected values, so this cannot pass while the config says
 * something else. It is the config's own function, invoked.
 *
 * Deliberately not asserted here: that a *served response* carries them. That
 * needs a running server, and CI runs `test` before `build`. The nearest honest
 * proxy is what this does — the config is the only thing that produces them,
 * and Next.js applies `headers()` to every matched route.
 */

type Header = { key: string; value: string };
let headers: Header[];
let byKey: Map<string, string>;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testref.supabase.co";
  // next.config.mjs is untyped JS; `headers` is optional on NextConfig, and its
  // absence is exactly the regression this suite exists to catch — so assert it
  // is there rather than reaching through with a non-null assertion.
  const config = (await import("../../../next.config.mjs")).default as {
    headers?: () => Promise<{ source: string; headers: Header[] }[]>;
  };
  expect(config.headers, "next.config.mjs must declare a headers() block (D62)").toBeTypeOf(
    "function"
  );
  const rules = await config.headers!();

  const all = rules.find((r) => r.source === "/:path*");
  expect(all, "headers() must cover every path, not a subset").toBeDefined();
  headers = all!.headers;
  byKey = new Map(headers.map((h) => [h.key, h.value]));
});

describe("every response carries the baseline hardening headers (D62)", () => {
  it("denies framing in both the modern and legacy mechanisms", () => {
    // /merchant/redeem is a money surface on a phone at a counter. Both are
    // sent because older browsers ignore frame-ancestors.
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("Content-Security-Policy-Report-Only")).toContain(
      "frame-ancestors 'none'"
    );
  });

  it("sets nosniff, a referrer policy and HSTS", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

    const hsts = byKey.get("Strict-Transport-Security") ?? "";
    expect(hsts).toMatch(/max-age=\d+/);
    const maxAge = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(maxAge, "HSTS max-age must be at least a year to be meaningful").toBeGreaterThanOrEqual(
      31536000
    );
    expect(hsts).toContain("includeSubDomains");
  });

  it("denies camera and microphone but keeps geolocation, which the product uses", () => {
    const pp = byKey.get("Permissions-Policy") ?? "";
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    // Claim geofencing and the browse map need this. A guard that only checked
    // "is it restrictive" would happily pass a policy that breaks both.
    expect(pp).toContain("geolocation=(self)");
  });
});

describe("the CSP is honest about what it is", () => {
  it("ships Report-Only, and does not claim to be enforcing", () => {
    // Report-Only never blocks. Promoting it needs a real browser pass across
    // auth, top-up and the map — until then an enforcing header here would be
    // a sign-in outage waiting for the next deploy.
    expect(byKey.has("Content-Security-Policy-Report-Only")).toBe(true);
    expect(
      byKey.has("Content-Security-Policy"),
      "Promoting the CSP to enforcing is a separate, browser-verified change (D62).\n" +
        "If that work is done, update this assertion deliberately rather than deleting it."
    ).toBe(false);
  });

  it("allows the origins the app actually loads", () => {
    const csp = byKey.get("Content-Security-Policy-Report-Only") ?? "";
    // Each of these is a real dependency in src/. A CSP missing one is exactly
    // the breakage that makes teams abandon CSP, so they are named here.
    expect(csp, "Clerk auth widgets").toContain("clerk.accounts.dev");
    expect(csp, "Sentry error ingest").toContain("ingest.sentry.io");
    expect(csp, "OpenStreetMap tiles — src/components/browse/browse-map.tsx").toContain(
      "tile.openstreetmap.org"
    );
    expect(csp, "Leaflet marker sprites — same file").toContain("unpkg.com");
    // Supabase is read from env so previews and production each allow their own
    // project rather than a hardcoded ref.
    expect(csp, "Supabase REST + storage").toContain("https://testref.supabase.co");
  });

  it("does not need a PostHog origin, because ingest is proxied same-origin", () => {
    // Stated so a future reader does not "fix" a missing posthog origin by
    // adding one — the /ingest/* rewrites in next.config.mjs make it 'self'.
    const csp = byKey.get("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).not.toContain("posthog.com");
    expect(csp).toContain("default-src 'self'");
  });

  it("locks down the directives that have no legitimate use here", () => {
    const csp = byKey.get("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});
