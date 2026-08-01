#!/usr/bin/env node
/**
 * Fail the production build if a marketing page promises a form that is not in
 * its server HTML.
 *
 * ## Why this reads built output
 *
 * `/contact` shipped with **zero `<form>` elements and zero inputs** while its
 * JSX contained a complete, correctly-wired form (drift D41). `EnquiryRouter`
 * called `useSearchParams()`, which opts its subtree out of static rendering, and
 * the page's `Suspense` boundary contained that exactly as designed — by
 * server-rendering the fallback, a grey pulsing rectangle, in place of the form.
 * Directly above it the page promised "This form and email — We reply within 1
 * business day".
 *
 * No guard in this repo could have caught it. Every marketing guard reads `.tsx`
 * source, and in source the form is right there. Only the rendered HTML shows the
 * absence. That is the same lesson as D40 and the reason this is a sibling of
 * `check-canonicals.mjs` rather than a vitest suite: CI runs `test` before
 * `build`, so a test asserting on `.next/` would fail there. It is chained into
 * `build` and guarded in turn by `src/lib/__tests__/build-gates.test.ts`.
 *
 * ## What it asserts
 *
 * For each route below: the prerendered HTML contains a `<form>`, contains at
 * least one input control, and carries **no** `BAILOUT_TO_CLIENT_SIDE_RENDERING`
 * marker. The last one is the mechanism rather than the symptom — a bailout means
 * some subtree was skipped at build time, and on a page whose whole point is a
 * form, that is the defect regardless of which subtree it was.
 *
 * `/waitlist` is deliberately **not** in the list. Its page accepts a
 * `searchParams` prop, which opts the route into dynamic rendering, so it has no
 * build artefact to read at all. It is named in the output rather than dropped —
 * see drift D55 for why the finish documents describe it incorrectly.
 *
 * ## It must not pass vacuously
 *
 * This repo has produced guards that reported green while looking at nothing —
 * two comment strippers that deleted the line before scanning it, and a CI poller
 * that read a 403 body as "no failures". So a missing build directory, or a
 * missing artefact for a route listed here as prerendered, is an error rather
 * than a skip.
 *
 * Usage: node scripts/check-server-forms.mjs [buildDir]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const BUILD_DIR = process.argv[2] ?? ".next/server/app";

/**
 * Routes that must ship a working form in prerendered HTML.
 *
 * `needle` is a distinctive string from the form's own copy. A `<form>` tag alone
 * would be satisfied by any form on the page — the site header could grow a
 * search box and mask the real regression — so each route also names something
 * only its form renders.
 */
const MUST_PRERENDER_A_FORM = [
  { route: "/contact", file: "contact.html", needle: "What is this about?" },
  { route: "/merchants/join", file: "merchants/join.html", needle: "Shop name" },
];

/** Known-dynamic routes with forms: no build artefact exists, so they are named. */
const DYNAMIC_WITH_FORMS = ["/waitlist"];

function die(msg) {
  console.error(`check-server-forms: ${msg}`);
  process.exit(1);
}

if (!existsSync(BUILD_DIR)) {
  die(
    `${BUILD_DIR} not found. Run \`next build\` first — this check scans build output, not source.`
  );
}

const problems = [];
let checked = 0;

for (const { route, file, needle } of MUST_PRERENDER_A_FORM) {
  const full = path.join(BUILD_DIR, file);
  if (!existsSync(full)) {
    // Not a skip. This route is declared prerendered; if it no longer is, either
    // the route went dynamic (a real change to how it renders, and to whether the
    // canonical guard can see it) or the path moved. Both need a human.
    problems.push(
      `${route}: no prerendered HTML at ${file} — the route is no longer static, or the artefact moved`
    );
    continue;
  }
  checked++;
  const html = readFileSync(full, "utf8");

  if (!/<form[\s>]/.test(html)) problems.push(`${route}: no <form> in server HTML`);
  if (!/<input[\s>]|<textarea[\s>]|<select[\s>]/.test(html)) {
    problems.push(`${route}: a <form> with no input, textarea or select`);
  }
  if (!html.includes(needle)) {
    problems.push(`${route}: the form's own copy ("${needle}") is not in server HTML`);
  }
  if (html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING")) {
    problems.push(
      `${route}: BAILOUT_TO_CLIENT_SIDE_RENDERING — a subtree was skipped at build time. ` +
        `Something on this page calls useSearchParams (or another dynamic hook) again.`
    );
  }
}

if (checked !== MUST_PRERENDER_A_FORM.length) {
  die(
    `inspected ${checked} of ${MUST_PRERENDER_A_FORM.length} routes. ` +
      `Refusing to report success on a partial scan.\n  ` +
      problems.join("\n  ")
  );
}

console.log(
  `check-server-forms: ${DYNAMIC_WITH_FORMS.join(", ")} render per request and have no build ` +
    `artefact, so are not inspected here. Verify against a live response.`
);

if (problems.length) {
  console.error(`check-server-forms: ${problems.length} problem(s)\n  ` + problems.join("\n  "));
  process.exit(1);
}

console.log(
  `check-server-forms: clean — ${checked} route(s) ship a complete form in server HTML.`
);
