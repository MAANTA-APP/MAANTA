import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Phase 5 invariants — accessibility, metadata and mobile.
 *
 * Static checks only. They cannot replace a real audit (contrast on rendered
 * pixels, screen-reader traversal, Lighthouse), but they catch the regressions
 * that are invisible in review: a second `<main>`, a page shipped without a
 * title, an amber focus ring, a table that forces the body to scroll sideways
 * on a 360px screen.
 */

const SRC = path.resolve(__dirname, "..", "..");
const MARKETING = path.join(SRC, "app", "(marketing)");
// The funnel routes (`/waitlist`, `/merchants/join`) moved to their own shell on
// 2026-09-05 (board 2). Same rules apply: they are public marketing surfaces.
const FUNNEL = path.join(SRC, "app", "(funnel)");

function pages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pages(full));
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);
const PAGES = [...pages(MARKETING), ...pages(FUNNEL)];
const read = (f: string) => readFileSync(f, "utf8");

describe("marketing accessibility and metadata", () => {
  it("finds the marketing pages", () => {
    expect(PAGES.length).toBeGreaterThan(8);
  });

  // The shell owns the single `main` landmark. A page declaring its own nests
  // them, which is invalid HTML and gives assistive tech two "main" regions.
  it("declares exactly one main landmark, in the shell", () => {
    const offenders = PAGES.filter((f) => /<main[\s>]/.test(read(f))).map(rel);
    expect(
      offenders,
      `Pages must not declare <main> — (marketing)/layout.tsx already does:\n${offenders.join("\n")}`
    ).toEqual([]);

    const layout = read(path.join(MARKETING, "layout.tsx"));
    expect(layout).toContain('<main id="main"');
    expect(layout, "the shell needs a skip link").toContain('href="#main"');
  });

  /**
   * Every marketing page needs its own title and description, or it inherits the
   * root's and every page shares one snippet in search results.
   *
   * **This walks `PAGES` rather than an enumerated list, and that is the fix, not
   * a tidy-up.** It was a hand-maintained array of ten paths, which is a guard
   * that only checks what someone remembered to add to it. Two pages were missing
   * from it and shipped with no metadata at all — `/pricing`, the commercial
   * page, and `/merchants/join`, the merchant lead form — while the assertion
   * above them claimed to cover "every top-level page" (drift D52). The list was
   * the defect; a page added tomorrow is now covered without anyone touching this
   * file.
   *
   * `generateMetadata` counts. No marketing route uses it today — every one of
   * them exports a static `metadata` — but a dynamic route legitimately would,
   * and a guard that failed such a page would push the next author to delete the
   * check rather than satisfy it.
   *
   * **Comments are stripped first, and that is load-bearing.** The first version
   * of this walk matched raw source, and `merchants/join/page.tsx` — added in the
   * same change — carries the literal phrase `export const metadata` inside its
   * JSDoc explaining why the route was split. It passed only because a real
   * export also existed below. A page whose *only* occurrence was in a comment
   * would have satisfied the guard while shipping no metadata at all, which is
   * precisely the drift (D52) this exists to catch. Raised by CodeRabbit on #161.
   *
   * It uses the shared lexer rather than a local regex. The obvious one-liner —
   * `src.replace(/\/\/.*$/gm, "")` — is drift **D38**: it truncates every line at
   * its first `//`, including the one inside `https://`, so a real export sharing
   * a line with a URL would be deleted before the scan and the guard would report
   * a page as missing metadata it actually has. That bug has already been written
   * three times in this suite; the helper exists so it is not written a fourth.
   */
  it("gives every marketing page its own metadata", () => {
    const missing: string[] = [];
    for (const f of PAGES) {
      const src = stripComments(read(f));
      const hasStatic = /export const metadata/.test(src);
      const hasDynamic = /export\s+(?:async\s+)?function\s+generateMetadata/.test(src);
      if (!hasStatic && !hasDynamic) {
        missing.push(`${rel(f)} — no metadata or generateMetadata export`);
        continue;
      }
      // Only the static form can be checked field-by-field from source.
      if (hasStatic) {
        if (!/title:/.test(src)) missing.push(`${rel(f)} — no title`);
        else if (!/description:/.test(src)) missing.push(`${rel(f)} — no description`);
      }
    }
    expect(
      missing,
      `Missing per-page metadata — without it the page inherits the root's title\n` +
        `and description, and shares one snippet in search results (drift D52):\n${missing.join("\n")}`
    ).toEqual([]);
  });

  // A draft legal document indexed by Google outlives the draft.
  it("noindexes every legal route while DEMO_MODE", () => {
    for (const route of ["privacy", "terms", "merchant-terms", "cookies"]) {
      const src = read(path.join(MARKETING, route, "page.tsx"));
      expect(src, `${route} must noindex while DEMO_MODE`).toMatch(
        /robots:\s*DEMO_MODE\s*\?\s*\{\s*index:\s*false/
      );
    }
  });

  // #FDBF2D on white is ~1.7:1 — below the 3:1 required for a focus indicator.
  // The ring is ink; the accent stays on CTAs and live status.
  //
  // This half reads the stylesheet only. For most of this file's life that was
  // the whole guard, and the stylesheet was already compliant — so nine
  // components sat on `focus:ring-brand` underneath a passing test named for
  // exactly the rule they broke. The component half now lives in
  // `frozen-ui-rules.test.ts` ("never uses the amber accent as a focus
  // indicator"); the two together are the rule. Do not read this one as
  // covering the app.
  it("does not use the amber accent as a focus ring", () => {
    const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    expect(css, "a global :focus-visible style must exist").toContain(":focus-visible");
    const focusBlock = css.slice(css.indexOf(":focus-visible"));
    expect(/outline:[^;]*(brand|FDBF2D)/i.test(focusBlock)).toBe(false);
  });

  // Exactly one block, not merely "at least one". Two identical
  // `prefers-reduced-motion` rules shipped here with different durations
  // (0.001ms unlayered, 0.01ms inside `@layer base`), so the rule had two homes
  // and nothing would have surfaced the day they diverged — both collapse
  // motion to nothing, so which one won was invisible either way.
  it("respects prefers-reduced-motion, in exactly one place", () => {
    const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    const blocks = css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? [];
    expect(
      blocks.length,
      `globals.css should carry one reduced-motion block, found ${blocks.length}`
    ).toBe(1);
  });

  // Mobile first at 360px: the body must never scroll sideways. Wide content
  // (the legal tables) has to scroll inside its own container instead.
  it("keeps wide tables inside a horizontally scrollable container", () => {
    const doc = readFileSync(
      path.join(SRC, "components", "marketing", "LegalDoc.tsx"),
      "utf8"
    );
    const tableIdx = doc.indexOf("<table");
    expect(tableIdx).toBeGreaterThan(-1);
    // The wrapper immediately preceding the table carries the overflow.
    expect(doc.slice(Math.max(0, tableIdx - 400), tableIdx)).toContain("overflow-x-auto");
  });

  // The mobile sheet is the only disclosure widget in the shell; it has to
  // announce its state and be closable from the keyboard.
  it("wires the mobile nav toggle for assistive tech and keyboard", () => {
    const header = readFileSync(
      path.join(SRC, "components", "marketing", "SiteHeader.tsx"),
      "utf8"
    );
    expect(header).toContain("aria-expanded");
    expect(header).toContain("aria-controls");
    expect(header, "Escape must close the sheet").toContain('e.key === "Escape"');
  });
});
