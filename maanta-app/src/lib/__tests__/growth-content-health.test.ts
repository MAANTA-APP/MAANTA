import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CLAIMS_GUARDS,
  contentHealthSummary,
  routeHealth,
  ROUTES_WITH_OG_IMAGE,
  LEGAL_ROUTES,
} from "@/lib/growth/content-health";
import { NON_INDEXABLE_PREFIXES, SITEMAP_ROUTES } from "@/lib/marketing/nav";

const MARKETING_DIR = path.resolve(__dirname, "../../app/(marketing)");
// `/waitlist` and `/merchants/join` render in their own chrome-free shell since
// board 2 (2026-09-05). Still public routes with OG cards, so still walked.
const FUNNEL_DIR = path.resolve(__dirname, "../../app/(funnel)");

/** Every marketing route that ships its own `opengraph-image.tsx`, from disk. */
function ogRoutesOnDisk(dir = MARKETING_DIR, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "opengraph-image.tsx") {
      found.push(prefix === "" ? "/" : prefix);
      continue;
    }
    // Route groups like `(marketing)` are URL-invisible, and `[slug]` segments
    // are dynamic — neither contributes a literal path segment here.
    if (!statSync(full).isDirectory() || entry.startsWith("(") || entry.startsWith("[")) continue;
    found.push(...ogRoutesOnDisk(full, `${prefix}/${entry}`));
  }
  return found;
}

/**
 * The anti-drift guard for `ROUTES_WITH_OG_IMAGE`.
 *
 * That list is declared rather than discovered, because a deployed Next build
 * has no source tree to walk at request time. Declared lists rot, so this walks
 * the tree at test time and fails in **both** directions — a new OG image that
 * nobody added to the list, and a listed route whose image was deleted. The
 * second is the dangerous one: it would render a green "Yes" on the Growth
 * console for a page that shares bare.
 */
describe("content health — the OG list cannot drift from the filesystem", () => {
  it("matches every opengraph-image.tsx under (marketing)", () => {
    expect([...ROUTES_WITH_OG_IMAGE].sort()).toEqual(
      [...ogRoutesOnDisk(MARKETING_DIR), ...ogRoutesOnDisk(FUNNEL_DIR)].sort()
    );
  });

  it("only claims OG coverage for routes that are actually indexable", () => {
    const sitemapPaths = SITEMAP_ROUTES.map((r) => r.path);
    for (const route of ROUTES_WITH_OG_IMAGE) {
      expect(sitemapPaths).toContain(route);
    }
  });
});

describe("content health — the summary is derived, never typed", () => {
  it("counts the sitemap, the legal drafts and the disallow list from nav.ts", () => {
    const summary = contentHealthSummary();
    expect(summary.indexableRoutes).toBe(SITEMAP_ROUTES.length);
    expect(summary.legalDraftsNoindex).toBe(LEGAL_ROUTES.length);
    expect(summary.disallowedPrefixes).toBe(NON_INDEXABLE_PREFIXES.length);
    expect(summary.ogCovered + summary.missingOg.length).toBe(summary.ogExpected);
  });

  it("names the routes missing an OG card rather than only counting them", () => {
    const summary = contentHealthSummary();
    for (const missing of summary.missingOg) {
      expect(ROUTES_WITH_OG_IMAGE).not.toContain(missing);
    }
  });
});

describe("content health — the route table covers all three policies", () => {
  const routes = routeHealth();

  it("marks legal routes noindex, not disallowed", () => {
    // Founder ruling 2026-08-01: a disallow stops the crawl that would read the
    // noindex, so the two work against each other. This guards the ruling.
    for (const legal of LEGAL_ROUTES) {
      const row = routes.find((r) => r.path === legal);
      expect(row?.policy).toBe("noindex");
    }
  });

  it("gives an OG verdict only where one is meaningful", () => {
    for (const row of routes) {
      if (row.policy === "index") expect(typeof row.hasOgImage).toBe("boolean");
      // A noindex draft and a disallowed prefix have no card to be missing.
      else expect(row.hasOgImage).toBeNull();
    }
  });
});

describe("content health — the claims panel is an inventory, not a live scan", () => {
  it("names a real guard and where it runs for every claim it lists", () => {
    expect(CLAIMS_GUARDS.length).toBeGreaterThan(0);
    for (const guard of CLAIMS_GUARDS) {
      expect(guard.forbids.length).toBeGreaterThan(10);
      expect(["vitest", "build"]).toContain(guard.runsIn);
    }
  });

  it("covers the guards that hold the pre-launch claims discipline", () => {
    const named = CLAIMS_GUARDS.map((g) => g.guard);
    expect(named).toContain("held-claims.test.ts");
    expect(named).toContain("pricing-copy.test.ts");
    expect(named).toContain("marketing-crawl-policy.test.ts");
  });
});
