import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Guard for the hero device mockup — drift row **D50**.
 *
 * `HeroShot` is the one place on the marketing site where synthetic deal rows
 * render. Every other marketing surface is held to "no invented content",
 * and the demo-data banner is deliberately kept *off* marketing routes on the
 * premise that no synthetic rows appear there. This component is the founder-
 * approved exception (2026-08-01), and the thing that keeps it honest is a
 * visible disclosure sitting next to it.
 *
 * That disclosure is one line of JSX. Nothing about the build, the type system
 * or the other guards notices if it is deleted while the invented shops stay —
 * and the result is fabricated merchant offers presented as real, in the hero of
 * the page that argues the product works. That is the regression this file
 * exists to catch, and it is why the row could be opened with a guard named
 * rather than `no guard:`.
 *
 * ## What this does not check, stated rather than left to be found
 *
 * **This reads source, not rendered HTML.** CLAUDE.md asks new marketing guards
 * to assert against `.next/server/app/**`, because a source-only guard is how
 * D41 shipped — a `/contact` form present in JSX and absent from server HTML.
 * That is the right rule and it cannot be followed here: `.github/workflows/ci.yml`
 * runs `npm run test` *before* `npm run build`, so `.next/` does not exist when
 * this file executes in CI. A guard that skipped when the directory is missing
 * would pass vacuously on every CI run, which is worse than a source guard that
 * is honest about its scope.
 *
 * The exposure is narrow and worth naming: `HeroShot` is a server component with
 * no `useSearchParams`, no `Suspense` boundary and no client hook, so it has no
 * mechanism to render in the browser but not on the server — which is precisely
 * the mechanism that produced D41. If it ever gains one, this guard stops being
 * sufficient and the assertion has to move to built output.
 *
 * Comments are stripped before scanning through the shared lexer (D38): a
 * disclosure that exists only inside a `/* … *\/` block is not a disclosure, and
 * this file's own docblock quotes the string it looks for.
 */

const SRC = path.resolve(__dirname, "..", "..");
const HERO_SHOT = path.join(SRC, "components", "marketing", "HeroShot.tsx");
const HOME = path.join(SRC, "app", "(marketing)", "page.tsx");

const code = (f: string) => stripComments(readFileSync(f, "utf8"));

describe("hero device mockup (D50)", () => {
  // The visible caption under the mockup. Not the sr-only text — a sighted
  // visitor is the one being shown invented prices.
  it("renders a visible illustration disclosure next to the mockup", () => {
    expect(
      /Illustration\s*·\s*example shops and prices/.test(code(HERO_SHOT)),
      "HeroShot must render a visible caption marking the mockup as an illustration. " +
        "Without it the hero shows invented shops and prices as though they were real offers."
    ).toBe(true);
  });

  // The screen-reader equivalent. The mockup is aria-hidden, so this sentence is
  // the only thing assistive tech gets — if it goes, the disclosure is sighted-only.
  it("describes the mockup, and its invented content, to assistive tech", () => {
    const src = code(HERO_SHOT);
    expect(src, "the mockup body should be aria-hidden").toContain('aria-hidden="true"');
    expect(
      /sr-only/.test(src) && /invented examples, not real offers/.test(src),
      "HeroShot needs an sr-only description stating the shops and prices are invented"
    ).toBe(true);
  });

  // Frozen rule 3 applies here as everywhere: this depicts money.
  it("never renders the sample prices in amber", () => {
    const offenders = code(HERO_SHOT)
      .split("\n")
      .filter((l) => l.includes("text-brand") && /formatKes|tnum/.test(l));
    expect(
      offenders,
      `Money is ink, never amber (frozen rule 3):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  // The mockup is Home-only by decision. If it spreads to the audience pages,
  // the disclosure and this row have to be reconsidered for each of them rather
  // than inherited silently.
  it("is mounted on Home and nowhere else on the marketing site", () => {
    expect(code(HOME)).toContain("<HeroShot />");

    const others = ["shoppers", "merchants", "mall-operators"].filter((p) =>
      /HeroShot/.test(code(path.join(SRC, "app", "(marketing)", p, "page.tsx")))
    );
    expect(
      others,
      `HeroShot is Home-only (D50). Adding it to another page needs its own decision:\n${others.join(
        "\n"
      )}`
    ).toEqual([]);
  });
});
