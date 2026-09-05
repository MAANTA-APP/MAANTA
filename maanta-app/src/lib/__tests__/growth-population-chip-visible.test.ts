import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "@/lib/__tests__/helpers/comment-stripping";

const GROWTH_PAGES = path.resolve(__dirname, "../../app/admin/growth");
const CHIP = path.resolve(__dirname, "../../components/admin/growth/population-controls.tsx");

function pageFiles(dir = GROWTH_PAGES): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...pageFiles(full));
    else if (entry === "page.tsx") found.push(full);
  }
  return found;
}

/**
 * "The population chip is never responsive-hidden."
 *
 * The design board states the rule as: if it cannot fit, the layout is wrong,
 * not the chip. The reason is concrete — a figure whose population is only
 * stated on desktop gets screenshotted on a phone and quoted without the
 * qualifier, which is exactly how an internal test count becomes a traction
 * claim.
 *
 * A rule each author has to remember is a rule that drifts, so it is a test.
 */
describe("growth — the population chip survives every breakpoint", () => {
  it("carries no responsive-hide utility of its own", () => {
    const source = stripComments(readFileSync(CHIP, "utf8"));
    // `hidden` alone, or any `<breakpoint>:hidden`, would drop the chip at some
    // width. `[hidden]`-style attribute usage is not present in this file.
    expect(source).not.toMatch(/\b(?:sm|md|lg|xl|2xl):hidden\b/);
    expect(source).not.toMatch(/className="[^"]*\bhidden\b/);
  });

  it("is rendered by every Growth screen that shows a population-dependent figure", () => {
    const files = pageFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      // Content & SEO counts routes, not people — it has no population to state.
      if (file.includes(`${path.sep}content${path.sep}`)) {
        expect(source).not.toContain("PopulationChip");
        continue;
      }
      expect(source, `${file} must state which population it counted`).toContain(
        "<PopulationChip"
      );
    }
  });
});
