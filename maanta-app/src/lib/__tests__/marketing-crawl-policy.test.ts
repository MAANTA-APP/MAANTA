import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  LEGAL_ROUTES,
  NON_INDEXABLE_PREFIXES,
  SITEMAP_ROUTES,
} from "@/lib/marketing/nav";

/**
 * Crawl policy: every route is accounted for, in exactly one way.
 *
 * The defect this exists to prevent is not "a missing `Disallow` line" — it is
 * the gap between two files that each believed the other had it covered.
 * `sitemap.ts` excluded the shopper surfaces on the stated grounds that they are
 * "authenticated or shopper-session surfaces, not indexable content", and
 * `robots.ts` disallowed only the merchant, admin, agent and founder surfaces.
 * So `/feed`, `/browse`, `/map`, `/my-deals`, `/tickets`, `/you` and the rest
 * were absent from discovery and open to crawling simultaneously — and `/feed`
 * is the target of the header CTA and the home hero CTA, so it is the most
 * linked page on the site. Measured on production 2026-08-10: HTTP 200 to an
 * anonymous client, 156 rendered KES prices from demo data, no `noindex`, and
 * the home page's own title and description.
 *
 * A test that just asserted "`/feed` is disallowed" would have closed that one
 * hole and left the shape of it open. The invariant below is the general form:
 * **every route in the app is either in the sitemap, or a `noindex` legal route,
 * or covered by a disallow prefix.** A new route lands in one of the three or
 * fails here.
 */

const APP = path.join(process.cwd(), "src", "app");

/** Route groups are URL-invisible; parallel/intercepting segments are not routes. */
const isGroup = (seg: string) => seg.startsWith("(") && seg.endsWith(")");
const isPrivate = (seg: string) => seg.startsWith("_") || seg.startsWith("@");

/**
 * Every URL path in the app that renders a page, derived from the filesystem
 * rather than from a list — a hand-maintained list of routes is the thing that
 * goes stale and lets a new route through unchecked.
 */
function routePaths(dir = APP, url = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const seg = entry.name;
    if (isPrivate(seg)) continue;
    const next = isGroup(seg) ? url : `${url}/${seg}`;
    const child = path.join(dir, seg);
    const files = readdirSync(child).filter((f) => /^page\.(tsx|ts|jsx|js)$/.test(f));
    if (files.length > 0) out.push(next);
    out.push(...routePaths(child, next));
  }
  return out;
}

/** A dynamic segment is covered by whatever covers its parent. */
const isDynamic = (p: string) => p.includes("[");

/**
 * Does robots.txt disallow this path?
 *
 * Deliberately stricter than real robots.txt matching, which is pure prefix: a
 * bare `/admin` rule really would also block `/administrator`. Modelling that
 * here would let a rule cover a route by accident and call the policy complete,
 * so a rule only covers a path it plausibly meant to. `$` is Google's
 * end-of-path anchor and is treated as an exact match.
 */
const covered = (p: string) =>
  NON_INDEXABLE_PREFIXES.some((rule) => {
    if (rule.endsWith("$")) return p === rule.slice(0, -1);
    if (rule.endsWith("/")) return p.startsWith(rule);
    return p === rule || p.startsWith(`${rule}/`);
  });

describe("crawl policy", () => {
  const sitemapPaths = new Set(SITEMAP_ROUTES.map((r) => r.path));
  const legalPaths = new Set<string>(LEGAL_ROUTES);

  it("finds the app's routes", () => {
    const paths = routePaths();
    expect(paths.length, "no routes discovered — did src/app move?").toBeGreaterThan(20);
    expect(paths, "the home page must be discovered").toContain("");
  });

  it("accounts for every route: sitemap, noindex legal, or disallowed", () => {
    const unaccounted = routePaths()
      .filter((p) => !isDynamic(p))
      .map((p) => (p === "" ? "/" : p))
      .filter((p) => !sitemapPaths.has(p) && !legalPaths.has(p) && !covered(p));

    expect(
      unaccounted,
      "these routes are neither advertised in sitemap.xml, nor noindex legal routes,\n" +
        "nor disallowed in robots.txt — so they are silently crawlable. Add each to\n" +
        "SITEMAP_ROUTES if it is public content, or to NON_INDEXABLE_PREFIXES if it is\n" +
        "not:\n"
    ).toEqual([]);
  });

  it("never advertises a route it also disallows", () => {
    const contradictory = SITEMAP_ROUTES.map((r) => r.path).filter(covered);
    expect(
      contradictory,
      "robots.txt disallows a route sitemap.xml advertises. That is the two files\n" +
        "disagreeing again, in the opposite direction:\n"
    ).toEqual([]);
  });

  it("keeps the legal routes out of the disallow list, so noindex can be read", () => {
    // A disallowed page cannot be crawled, so its `noindex` is never seen — the
    // exact reasoning recorded in robots.ts when the legal routes were removed
    // from this list by founder ruling on 2026-08-01.
    const wrong = LEGAL_ROUTES.filter(covered);
    expect(wrong, "a disallowed legal route hides its own noindex:\n").toEqual([]);
  });

  it("only claims a large social card on a route that has an image", () => {
    // `opengraph-image` files do not cascade: `/merchants` having one did
    // nothing for `/merchants/join`, and the group-root image applies to `/`
    // alone. So the check is per-directory, and the failure it caught was 11 of
    // 17 routes declaring `summary_large_image` over an empty card.
    const MARKETING = path.join(APP, "(marketing)");
    const offenders: string[] = [];

    const walk = (dir: string, url: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || isPrivate(entry.name)) continue;
        const next = isGroup(entry.name) ? url : `${url}/${entry.name}`;
        const child = path.join(dir, entry.name);
        const files = readdirSync(child);
        if (files.some((f) => /^page\.tsx$/.test(f))) {
          const hasImage = files.some((f) => /^opengraph-image\./.test(f));
          const src = readFileSync(path.join(child, "page.tsx"), "utf8");
          const optsOut = /twitterCard:\s*"summary"/.test(src);
          if (!hasImage && !optsOut) offenders.push(next || "/");
        }
        walk(child, next);
      }
    };
    walk(MARKETING, "");

    expect(
      offenders,
      "these marketing routes inherit `twitter:card=summary_large_image` from the root\n" +
        "layout but have no `opengraph-image.tsx`, so they unfurl as an empty card.\n" +
        'Add an image, or pass `twitterCard: "summary"` to pageMetadata():\n'
    ).toEqual([]);
  });

  it("disallows the shopper surfaces that demo data renders on", () => {
    // The specific regression, pinned by name as well as by shape.
    for (const p of ["/feed", "/browse", "/map", "/my-deals", "/tickets", "/you", "/deals"]) {
      expect(covered(p), `${p} must be disallowed while it can render demo deals`).toBe(true);
    }
  });
});
