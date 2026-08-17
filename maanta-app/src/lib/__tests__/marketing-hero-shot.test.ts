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

/**
 * Guard for the second illustrated surface — the `/shoppers` walkthrough.
 *
 * The hero guard above asserts `HeroShot` is Home-only, with the note that
 * adding it elsewhere "needs its own decision rather than inherited silently".
 * That decision was taken on 2026-08-16: a *separate* component, illustrated
 * rather than screenshotted, shopper flow, `/shoppers` only. So the exception
 * D50 records now covers two surfaces, and the disclosure that keeps the first
 * honest has to keep the second honest too — by the same one line of JSX that
 * nothing else would miss if it vanished.
 */
describe("shopper walkthrough illustrations (D50, second surface)", () => {
  const WALKTHROUGH = path.join(SRC, "components", "marketing", "ShopperWalkthrough.tsx");
  const SHOPPERS = path.join(SRC, "app", "(marketing)", "shoppers", "page.tsx");

  it("renders a visible illustration disclosure", () => {
    expect(
      /Illustration\s*·\s*example shops and prices/.test(code(WALKTHROUGH)),
      "The walkthrough shows invented shops and prices and must say so visibly."
    ).toBe(true);
  });

  it("describes the flow, and its invented content, to assistive tech", () => {
    const src = code(WALKTHROUGH);
    expect(src, "the mockups should be aria-hidden").toContain('aria-hidden="true"');
    expect(
      /sr-only/.test(src) && /invented examples, not real offers/.test(src),
      "an sr-only sentence must state the shops and prices are invented"
    ).toBe(true);
  });

  it("never renders the sample prices in amber", () => {
    // Frozen rule 3, same as the hero: this depicts money.
    const offenders = code(WALKTHROUGH)
      .split("\n")
      .filter((l) => l.includes("text-brand") && /formatKes|tnum/.test(l));
    expect(offenders, `Money is ink, never amber:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps money out of the code card — frozen rule 6", () => {
    // "The 6-digit code is the only bare numeral; no price inside the code card."
    // The real card has no price and the illustration must not invent one, or it
    // teaches a screen the product does not have.
    const src = code(WALKTHROUGH);
    const cardStart = src.indexOf("function CodePanel");
    const cardEnd = src.indexOf("function VerifiedPanel");
    expect(cardStart, "CodePanel should exist").toBeGreaterThan(-1);
    expect(cardEnd, "VerifiedPanel should follow it").toBeGreaterThan(cardStart);
    const card = src.slice(cardStart, cardEnd);
    expect(card).not.toContain("formatKes");
    expect(card).not.toContain("KES");
  });

  it("adds no amber action to the page", () => {
    // Frozen rule 1: the page's single amber action is its CTA. The only amber
    // here is the code card's border and the mall dot — both the real UI.
    const src = code(WALKTHROUGH);
    expect(src).not.toContain("bg-brand text-black");
    expect(src.includes("bg-brand"), "bg-brand is allowed only for the mall status dot").toBe(
      true
    );
    const brandFills = src
      .split("\n")
      .filter((l) => l.includes("bg-brand") && !l.includes("rounded-full"));
    expect(brandFills, `amber fill outside the status dot:\n${brandFills.join("\n")}`).toEqual([]);
  });

  it("invents no names of its own — one shared list, one place to check", () => {
    // A second hardcoded shop name is a second place for an invented name to
    // collide with a real BBS Mall tenant unnoticed.
    const src = code(WALKTHROUGH);
    expect(src).toContain("SAMPLE_DEALS");
    for (const invented of ["Riverside Fabrics", "Junction Shoes", "Amana Electronics"]) {
      expect(src, `${invented} should come from the shared list, not be retyped`).not.toContain(
        invented
      );
    }
  });

  it("is mounted on /shoppers, and HeroShot still is not", () => {
    const shoppers = code(SHOPPERS);
    expect(shoppers).toContain("<ShopperWalkthrough />");
    expect(shoppers, "HeroShot stays Home-only").not.toContain("HeroShot");
  });
});
