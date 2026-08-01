import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * The build-output gates must stay wired into `npm run build`.
 *
 * Two checks in this repo read **rendered output** rather than source — the only
 * two, and therefore the only ones that can catch the class of defect that has
 * repeatedly reached production here: correct in JSX, wrong in the HTML.
 *
 *  - `scripts/check-tokens.mjs` — no `{{TOKEN}}` survives into a rendered page.
 *  - `scripts/check-canonicals.mjs` — every marketing route carries a
 *    self-referencing canonical and `og:url`.
 *
 * Neither can live in this suite: CI runs `npm run test` **before**
 * `npm run build`, so a test asserting on `.next/` would fail there. They run as
 * post-build steps instead.
 *
 * Which leaves one gap, and it is what this file closes. A post-build gate is only
 * as durable as the `build` script that invokes it: deleting ` && npm run
 * check:canonicals` from `package.json` disables it silently, with a green suite
 * and a green build. Nothing asserted that wiring until now — the token gate had
 * shipped unguarded in exactly that way since it was written.
 *
 * So this is deliberately a test about configuration, not behaviour. It cannot
 * tell you the gates *work* — the gates' own mutation tests do that. It tells you
 * they still *run*.
 */

const APP = path.resolve(__dirname, "..", "..", "..");
const pkg = JSON.parse(readFileSync(path.join(APP, "package.json"), "utf8"));

/** Gate script → the npm script name that must appear in `build`. */
const GATES: Record<string, string> = {
  "scripts/check-tokens.mjs": "check:tokens",
  "scripts/check-canonicals.mjs": "check:canonicals",
};

describe("build-output gates stay wired into the build", () => {
  it("has a build script to inspect", () => {
    // Guards against every assertion below passing because the field moved.
    expect(typeof pkg.scripts?.build, "package.json has no build script").toBe("string");
  });

  for (const [file, script] of Object.entries(GATES)) {
    it(`runs ${script} as part of \`npm run build\``, () => {
      expect(existsSync(path.join(APP, file)), `${file} is missing`).toBe(true);
      expect(
        typeof pkg.scripts?.[script],
        `package.json has no "${script}" script`
      ).toBe("string");
      expect(
        pkg.scripts.build.includes(script),
        `\`npm run build\` must run ${script} — a gate that only runs when someone ` +
          `remembers to invoke it is not a gate. Got: ${pkg.scripts.build}`
      ).toBe(true);
    });
  }

  it("keeps the gates running after next build, not instead of it", () => {
    const build: string = pkg.scripts.build;
    expect(build.startsWith("next build"), `build must start with next build: ${build}`).toBe(
      true
    );
    for (const script of Object.values(GATES)) {
      expect(
        build.indexOf(script) > build.indexOf("next build"),
        `${script} must run after next build — it scans that build's output`
      ).toBe(true);
    }
    // `&&` and not `;` or `||`: a gate joined with `;` cannot fail the build.
    expect(
      /&&\s*npm run check:tokens/.test(build) && /&&\s*npm run check:canonicals/.test(build),
      `gates must be joined with && so a failure fails the build. Got: ${build}`
    ).toBe(true);
  });
});
