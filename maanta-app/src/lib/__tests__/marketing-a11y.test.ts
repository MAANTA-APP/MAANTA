import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

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
const PAGES = pages(MARKETING);
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

  // Every top-level marketing page needs its own title and description, or it
  // inherits the root's and every page shares one snippet in search results.
  it("gives each top-level page its own metadata", () => {
    // Maintained by hand, which is the weakness: `/pricing` shipped without
    // metadata precisely because it was never added here, and `/merchants/join`
    // still is missing (drift D52). A walk of every `page.tsx` under
    // `(marketing)/` would need no list and would catch the next page added.
    const TOP_LEVEL = [
      "page.tsx",
      path.join("shoppers", "page.tsx"),
      path.join("merchants", "page.tsx"),
      path.join("mall-operators", "page.tsx"),
      path.join("pricing", "page.tsx"),
      path.join("about", "page.tsx"),
      path.join("contact", "page.tsx"),
      path.join("privacy", "page.tsx"),
      path.join("terms", "page.tsx"),
      path.join("merchant-terms", "page.tsx"),
      path.join("cookies", "page.tsx"),
    ];
    const missing: string[] = [];
    for (const p of TOP_LEVEL) {
      const src = read(path.join(MARKETING, p));
      if (!/export const metadata/.test(src)) missing.push(`${p} — no metadata export`);
      else if (!/title:/.test(src)) missing.push(`${p} — no title`);
      else if (!/description:/.test(src)) missing.push(`${p} — no description`);
    }
    expect(missing, `Missing per-page metadata:\n${missing.join("\n")}`).toEqual([]);
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
  it("does not use the amber accent as a focus ring", () => {
    const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    expect(css, "a global :focus-visible style must exist").toContain(":focus-visible");
    const focusBlock = css.slice(css.indexOf(":focus-visible"));
    expect(/outline:[^;]*(brand|FDBF2D)/i.test(focusBlock)).toBe(false);
  });

  it("respects prefers-reduced-motion", () => {
    const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    expect(css).toContain("prefers-reduced-motion");
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
