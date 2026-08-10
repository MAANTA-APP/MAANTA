#!/usr/bin/env node
/**
 * Fail the production build if two public routes ship the same `<title>` or the
 * same meta description, or if a description is outside the snippet window.
 *
 * ## Why this exists
 *
 * `marketing-a11y.test.ts` already asserts that every marketing page exports its
 * own `metadata` with a `title` and a `description`. That is a **presence**
 * check, and the launch-readiness audit (2026-08-10, items 11 and 12) recorded
 * the gap plainly: "the guard checks presence, not uniqueness or length, so a
 * future duplicate would pass". The site's 17 routes are unique today by care,
 * not by enforcement.
 *
 * That distinction is not academic in this repo. Drift **D52** was a metadata
 * guard reading a hand-maintained list, so `/pricing` and `/merchants/join`
 * shipped with no metadata at all while the assertion above them claimed to
 * cover every page. And the defect the 404 rebuild fixed was precisely a
 * duplicate: `not-found.tsx` inherited the root layout's metadata, so every 404
 * on the site served the home page's title and description. A uniqueness gate
 * catches that class directly — `_not-found` is therefore in the scan, not
 * excluded from it.
 *
 * ## Why it reads built output rather than source
 *
 * Descriptions are template literals: `/merchants` interpolates
 * `FACTS.successFeeKes`, `/shoppers` interpolates `FACTS.graceMinutes`. Their
 * rendered length — the thing a search snippet actually truncates — cannot be
 * computed from the JSX, and a source-level guess would be wrong in both
 * directions. `CLAUDE.md` states the rule this follows: a guard that needs
 * rendered output belongs in a build script, not in vitest, because CI runs
 * `test` before `build` and `.next/` does not exist at test time.
 *
 * ## It must not pass vacuously
 *
 * Same contract as its two siblings, for the same reason — this repo has
 * produced three guards that reported green while looking at nothing:
 *
 *  - missing build directory or sitemap → exit 1;
 *  - fewer than `MIN_CHECKED` routes inspected → exit 1;
 *  - routes that could not be inspected are named, never silently dropped.
 *
 * ## The length window
 *
 * `MAX_DESCRIPTION` is 160 — the point past which Google truncates a snippet.
 * The audit found `/about` at 171 and `/waitlist` at 170, both cutting the
 * sentence doing the persuading; both were trimmed. This keeps them trimmed.
 *
 * `MIN_DESCRIPTION` is deliberately low. Seven descriptions sit under 120 and
 * leave snippet space unused, which is a copy opportunity rather than a defect —
 * failing a build over it would be this gate overreaching. The floor only
 * catches a description that is effectively empty.
 *
 * Usage: node scripts/check-metadata.mjs [buildDir]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const BUILD_DIR = process.argv[2] ?? ".next/server/app";
const LEGAL_ROUTES = ["/privacy", "/terms", "/merchant-terms", "/cookies"];
/** Floor on routes actually inspected, so a build that stops prerendering fails. */
const MIN_CHECKED = 14;
const MAX_DESCRIPTION = 160;
const MIN_DESCRIPTION = 50;

function die(msg) {
  console.error(`check-metadata: ${msg}`);
  process.exit(1);
}

if (!existsSync(BUILD_DIR)) {
  die(
    `${BUILD_DIR} not found. Run \`next build\` first — this check scans build output, not source.`
  );
}

const sitemapFile = path.join(BUILD_DIR, "sitemap.xml.body");
if (!existsSync(sitemapFile)) die(`${sitemapFile} not found — cannot derive the route list.`);

const locs = [...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1]
);
if (locs.length < 10) die(`sitemap has only ${locs.length} URLs — refusing to check a truncated list.`);

/** Every route whose rendered `<head>` this gate reads. */
const routes = [
  ...locs.map((loc) => new URL(loc).pathname.replace(/\/$/, "")),
  ...LEGAL_ROUTES,
];

const htmlFor = (route) =>
  path.join(BUILD_DIR, (route === "" ? "index" : route.replace(/^\//, "")) + ".html");

/**
 * Entity-decode the few forms Next emits in metadata, so a description
 * containing an apostrophe is not measured as six characters longer than it
 * renders — and so two descriptions differing only in encoding do not read as
 * unique.
 */
const decode = (s) =>
  s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;|&#38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#x2014;|&mdash;/g, "—")
    .replace(/&#x2013;|&ndash;/g, "–");

const problems = [];
const skipped = [];
/** normalised value → the routes carrying it. */
const titles = new Map();
const descriptions = new Map();
let checked = 0;

// The 404 is included on purpose: it is where the duplicate-metadata defect
// actually shipped. It has no entry in the sitemap, so it is added by hand.
const notFound = path.join(BUILD_DIR, "_not-found.html");
const inspect = routes.map((r) => [r, htmlFor(r)]);
if (existsSync(notFound)) inspect.push(["/404", notFound]);

for (const [route, file] of inspect) {
  const label = route || "/";
  if (!existsSync(file)) {
    skipped.push(label);
    continue;
  }
  checked++;
  const html = readFileSync(file, "utf8");

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title || !title.trim()) {
    problems.push(`${label}: no <title>`);
  } else {
    const key = decode(title).trim();
    titles.set(key, [...(titles.get(key) ?? []), label]);
  }

  const description = html.match(
    /<meta name="description" content="([^"]*)"/
  )?.[1];
  if (!description || !description.trim()) {
    problems.push(`${label}: no meta description`);
    continue;
  }

  const text = decode(description).trim();
  descriptions.set(text, [...(descriptions.get(text) ?? []), label]);

  if (text.length > MAX_DESCRIPTION) {
    problems.push(
      `${label}: description is ${text.length} chars, over the ${MAX_DESCRIPTION} ` +
        `snippet window — it will truncate mid-sentence`
    );
  } else if (text.length < MIN_DESCRIPTION) {
    problems.push(
      `${label}: description is only ${text.length} chars — too short to be a real snippet`
    );
  }
}

for (const [value, routesWith] of titles) {
  if (routesWith.length > 1)
    problems.push(`duplicate <title> on ${routesWith.join(", ")} — "${value}"`);
}
for (const [value, routesWith] of descriptions) {
  if (routesWith.length > 1)
    problems.push(`duplicate meta description on ${routesWith.join(", ")} — "${value}"`);
}

if (checked < MIN_CHECKED) {
  die(
    `only ${checked} routes inspected, expected at least ${MIN_CHECKED}. ` +
      `Refusing to report success on a partial scan. Skipped: ${skipped.join(", ") || "none"}`
  );
}

if (skipped.length) {
  console.log(
    `check-metadata: ${skipped.length} route(s) not prerendered, so not inspected here — ` +
      `${skipped.join(", ")}. These render per request; verify them against a live response.`
  );
}

if (problems.length) {
  console.error(`check-metadata: ${problems.length} problem(s)\n  ` + problems.join("\n  "));
  process.exit(1);
}

console.log(
  `check-metadata: clean — ${checked} routes carry a unique title and a unique ` +
    `description inside the snippet window.`
);
