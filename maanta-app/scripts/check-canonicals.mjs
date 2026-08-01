#!/usr/bin/env node
/**
 * Fail the production build if a marketing route ships without a self-referencing
 * canonical and Open Graph URL.
 *
 * ## Why this reads built output
 *
 * The defect it guards against was invisible in source. In the App Router a
 * page-level `openGraph` object **replaces** the parent's rather than merging, so
 * the five pages that declared their own social title silently dropped `og:url`,
 * `og:site_name`, `og:locale` and `og:type` — while the pages that declared none
 * inherited the root's `og:url`, which was the bare origin. Every page's JSX
 * looked fine. Only the rendered `<head>` showed it, and no guard in this repo
 * read rendered output except `check-tokens.mjs`.
 *
 * So this is a sibling of that script, not a vitest suite: `npm run test` runs
 * before `npm run build` in CI, so a test asserting on `.next/` would fail there.
 * It is chained into `build` for the same reason `check:tokens` is — a check you
 * can skip by building is not a check.
 *
 * ## It must not pass vacuously
 *
 * This repo has now produced three guards that reported green while looking at
 * nothing: two comment strippers that deleted the line before scanning it, and a
 * CI poller that parsed a 403 body as "no failures". So this script fails when it
 * cannot do its job, rather than reporting success:
 *
 *  - missing build directory or sitemap → exit 1;
 *  - fewer than `MIN_CHECKED` routes actually inspected → exit 1;
 *  - routes it could not inspect are **named in the output**, never silently
 *    dropped. A dynamically-rendered route has no prerendered HTML to read, which
 *    is a real limitation and is reported as one.
 *
 * ## Where the expectations come from
 *
 * The route list and the expected URLs are read from the **generated**
 * `sitemap.xml`, not hardcoded here. That makes "the sitemap and the page's own
 * canonical agree" an enforced invariant rather than a coincidence — a sitemap
 * advertising a URL whose page canonicalises elsewhere is itself an SEO defect —
 * and it means adding a route to `lib/marketing/nav.ts` extends this check with
 * no edit here.
 *
 * The four legal routes are appended explicitly: they are deliberately absent
 * from the sitemap while they are `noindex` drafts, but they still render
 * canonicals.
 *
 * Usage: node scripts/check-canonicals.mjs [buildDir]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const BUILD_DIR = process.argv[2] ?? ".next/server/app";
const LEGAL_ROUTES = ["/privacy", "/terms", "/merchant-terms", "/cookies"];
/** Floor on routes actually inspected, so a build that stops prerendering fails. */
const MIN_CHECKED = 14;

function die(msg) {
  console.error(`check-canonicals: ${msg}`);
  process.exit(1);
}

if (!existsSync(BUILD_DIR)) {
  die(`${BUILD_DIR} not found. Run \`next build\` first — this check scans build output, not source.`);
}

const sitemapFile = path.join(BUILD_DIR, "sitemap.xml.body");
if (!existsSync(sitemapFile)) die(`${sitemapFile} not found — cannot derive the route list.`);

const locs = [...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1]
);
if (locs.length < 10) die(`sitemap has only ${locs.length} URLs — refusing to check a truncated list.`);

const origin = new URL(locs[0]).origin;

/** route path ("" for home) → the absolute URL both canonical and og:url must carry. */
const expected = new Map();
for (const loc of locs) expected.set(new URL(loc).pathname.replace(/\/$/, ""), loc);
for (const r of LEGAL_ROUTES) expected.set(r, origin + r);

const htmlFor = (route) =>
  path.join(BUILD_DIR, (route === "" ? "index" : route.replace(/^\//, "")) + ".html");

const problems = [];
const skipped = [];
let checked = 0;

for (const [route, want] of expected) {
  const file = htmlFor(route);
  if (!existsSync(file)) {
    skipped.push(route || "/");
    continue;
  }
  checked++;
  const html = readFileSync(file, "utf8");
  const label = route || "/";

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonical) problems.push(`${label}: no <link rel="canonical">`);
  else if (canonical !== want) problems.push(`${label}: canonical is ${canonical}, expected ${want}`);

  const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (!ogUrl) problems.push(`${label}: no og:url`);
  else if (ogUrl === origin && route !== "")
    problems.push(`${label}: og:url is the bare origin — the page inherited the root's`);
  else if (ogUrl !== want) problems.push(`${label}: og:url is ${ogUrl}, expected ${want}`);

  for (const field of ["og:site_name", "og:locale", "og:type"]) {
    if (!html.includes(`property="${field}"`))
      problems.push(`${label}: missing ${field} — a page-level openGraph replaced the root's`);
  }
}

// The 404 must NOT carry a canonical: it would tell crawlers a mistyped URL is
// the canonical version of itself. Asserted in the inverse direction so that
// "everything has a canonical" can never be satisfied by blanket-adding one.
const notFound = path.join(BUILD_DIR, "_not-found.html");
if (existsSync(notFound) && readFileSync(notFound, "utf8").includes('rel="canonical"')) {
  problems.push("_not-found: has a canonical, which it must not");
}

if (checked < MIN_CHECKED) {
  die(
    `only ${checked} routes inspected, expected at least ${MIN_CHECKED}. ` +
      `Refusing to report success on a partial scan. Skipped: ${skipped.join(", ") || "none"}`
  );
}

if (skipped.length) {
  console.log(
    `check-canonicals: ${skipped.length} route(s) not prerendered, so not inspected here — ` +
      `${skipped.join(", ")}. These render per request; verify them against a live response.`
  );
}

if (problems.length) {
  console.error(`check-canonicals: ${problems.length} problem(s)\n  ` + problems.join("\n  "));
  process.exit(1);
}

console.log(`check-canonicals: clean — ${checked} marketing routes carry a self-referencing canonical and og:url.`);
