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
 * `formNeedle` is a string rendered **inside** the route's own `<form>` — a field
 * label, not a section heading. Every assertion about controls is made against
 * the form that contains it, never against the document.
 *
 * That binding is the point, and the first version of this file got it wrong: it
 * tested for a `<form>` anywhere, a control anywhere, and the copy anywhere, as
 * three independent document-wide searches. A header search box would have
 * satisfied the first two while the route's form was missing entirely — a gate
 * that passes while the thing it guards is gone, which is the exact vacuity this
 * repo keeps producing and this script's docblock claims to avoid.
 *
 * `alsoOnPage` covers markup the same failure removes but which lives outside the
 * `<form>`: on `/contact` the whole topic router went with it. Verified non-vacuous
 * rather than assumed — on a real build of the pre-fix source these strings are
 * absent from the HTML entirely, RSC flight payload included, because the bailed-out
 * subtree is not serialised.
 *
 * ## The closed state (founder ruling 2026-09-04, form safety)
 *
 * `lib/marketing/forms.ts` can take a form out of service. A closed form is a
 * different honest state, not a missing one, so each route also names
 * `closedNeedle` — the ruling's closed-state heading — and `closedAlternative`,
 * the working channel that copy must offer. When the heading is in the HTML the
 * assertion flips: **no** `<form>` may contain `formNeedle` and no input control
 * may sit beside the heading (a form that renders inputs it will not send is the
 * silent failure D28 was), and the alternative must be present. When it is not,
 * the original assertions apply unchanged. Either way the route is inspected —
 * a page that shows neither a form nor the closed block fails.
 */
const MUST_PRERENDER_A_FORM = [
  {
    route: "/contact",
    file: "contact.html",
    formNeedle: "Your message",
    alsoOnPage: ["What is this about?", "I am a mall operator"],
    closedNeedle: "The contact form is temporarily unavailable",
    closedAlternative: "admin@maanta.app",
  },
  {
    route: "/merchants/join",
    file: "merchants/join.html",
    formNeedle: "Shop name",
    alsoOnPage: ["Get started"],
    closedNeedle: "Shop sign-up is closed for now",
    closedAlternative: "admin@maanta.app",
  },
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

for (const {
  route,
  file,
  formNeedle,
  alsoOnPage,
  closedNeedle,
  closedAlternative,
} of MUST_PRERENDER_A_FORM) {
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

  // HTML forbids nested forms, so a non-greedy match to the first </form> is a
  // whole form and never a fragment of two.
  const forms = html.match(/<form\b[\s\S]*?<\/form\s*>/g) ?? [];

  if (html.includes(closedNeedle)) {
    // Closed, and it must be honestly closed: no route form, no stray inputs
    // next to the notice, and the alternative channel named.
    if (forms.some((f) => f.includes(formNeedle))) {
      problems.push(
        `${route}: says "${closedNeedle}" but still ships its <form> — a closed form must render no inputs`
      );
    }
    if (!html.includes(closedAlternative)) {
      problems.push(
        `${route}: closed without naming the alternative "${closedAlternative}"`
      );
    }
    for (const copy of alsoOnPage) {
      // The surrounding page (the topic router on /contact) must survive the
      // closure; only the inputs go.
      if (route === "/contact" && !html.includes(copy)) {
        problems.push(`${route}: "${copy}" is not in server HTML`);
      }
    }
    if (html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING")) {
      problems.push(`${route}: BAILOUT_TO_CLIENT_SIDE_RENDERING while closed`);
    }
    continue;
  }

  if (forms.length === 0) {
    problems.push(`${route}: no <form> in server HTML`);
  } else {
    const target = forms.filter((f) => f.includes(formNeedle));
    if (target.length === 0) {
      problems.push(
        `${route}: ${forms.length} <form> element(s) in server HTML, none containing ` +
          `"${formNeedle}" — this route's own form is not among them`
      );
    } else if (!target.some((f) => /<(?:input|textarea|select)\b/.test(f))) {
      problems.push(
        `${route}: the <form> containing "${formNeedle}" has no input, textarea or select`
      );
    }
  }

  for (const copy of alsoOnPage) {
    if (!html.includes(copy)) {
      problems.push(`${route}: "${copy}" is not in server HTML`);
    }
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
  `check-server-forms: clean — ${checked} route(s) ship a complete form, or an honest closed state, in server HTML.`
);
