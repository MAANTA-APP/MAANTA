import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { stripCommentLines } from "./helpers/comment-stripping";

/**
 * Guards for the mobile sticky CTA (launch-readiness audit 2026-08-10, item 9).
 *
 * The component's correctness is almost entirely in constraints that are easy to
 * relax later without noticing, because relaxing them makes the bar *more*
 * prominent rather than broken:
 *
 *  - it must be mobile-only, or it doubles the header CTA above 640px;
 *  - it must yield to in-flow amber actions, or it is a permanent second amber
 *    action on every screen — frozen UI rule 1;
 *  - it must clear the iOS home indicator, or the tap target sits under it;
 *  - it must stay on the two marketing conversion pages and nowhere near the
 *    shopper claim, verification or merchant surfaces, where a fixed bar would
 *    overlay a money action.
 *
 * All four are static properties of the source, so they are checked here rather
 * than left to review. Comments are stripped first for the reason
 * `marketing-shell.test.ts` documents: a guard that matches its own docblock
 * teaches the next author to delete the explanation.
 */

const SRC = path.resolve(__dirname, "..", "..");
const COMPONENT = path.join(SRC, "components", "marketing", "StickyCta.tsx");
const APP = path.join(SRC, "app");

const codeText = (f: string) => stripCommentLines(readFileSync(f, "utf8")).join("\n");

function tsxUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...tsxUnder(full));
    } else if (name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);

describe("marketing sticky CTA", () => {
  const src = codeText(COMPONENT);

  it("exists as a client component", () => {
    expect(existsSync(COMPONENT), "StickyCta.tsx must exist").toBe(true);
    expect(src).toContain('"use client"');
  });

  // Above 640px the header CTA is visible (`hidden … sm:inline-flex`), so a
  // sticky bar there is a second amber action by construction.
  it("renders on mobile only", () => {
    expect(src, "the bar must be sm:hidden — above 640px the header CTA is visible").toContain(
      "sm:hidden"
    );
  });

  // The whole one-amber-action argument rests on this. Without the observer the
  // bar is simply always on screen.
  it("yields to in-flow amber actions", () => {
    expect(src).toContain("[data-amber-cta]");
    expect(src).toContain("IntersectionObserver");
    expect(
      src,
      "the bar must unmount while an amber action is on screen, not merely dim"
    ).toMatch(/if\s*\(amberOnScreen\s*\|\|\s*menuOpen\)\s*return null/);
  });

  // Starting "true" is what makes the failure mode "no bar" rather than "two
  // amber actions" when IntersectionObserver is unavailable or finds nothing.
  it("fails closed when it cannot see the other amber actions", () => {
    expect(src).toMatch(/useState\(true\)/);
  });

  // The sheet's own amber CTA mounts after the observer is wired, so
  // intersection alone would miss it.
  it("hides while the mobile nav sheet is open", () => {
    expect(src).toContain('aria-controls="marketing-mobile-nav"');
    expect(src).toContain("aria-expanded");
  });

  it("clears the iOS home indicator", () => {
    expect(src, "a fixed bottom bar must pad for the safe-area inset").toContain(
      "env(safe-area-inset-bottom)"
    );
  });

  // Frozen UI rule 2: CTA is amber fill with a black label, and the sticky bar
  // is the same action as the hero, so it must not read as a different one.
  it("uses the same amber fill and dark label as CtaPrimary", () => {
    expect(src).toContain("bg-brand");
    expect(src).toContain("text-ink-soft");
  });

  it("is measurable separately from the hero and the closing band", () => {
    expect(src).toContain('location="sticky-mobile"');
  });
});

describe("amber action markers", () => {
  // If CtaPrimary loses the marker, every page's hero and closing band become
  // invisible to the bar and it renders over the whole page.
  it("CtaPrimary publishes data-amber-cta", () => {
    const sections = codeText(path.join(SRC, "components", "marketing", "sections.tsx"));
    const idx = sections.indexOf("function CtaPrimary");
    expect(idx, "CtaPrimary must exist in sections.tsx").toBeGreaterThan(-1);
    // Word-anchored on purpose. `toContain("amberCta")` passes against
    // `amberCtaX`, which is a prop TrackedLink ignores — so the marker would
    // silently stop rendering and the bar would cover every page. Caught by
    // renaming the prop and watching this assertion stay green.
    expect(
      sections.slice(idx, idx + 900),
      "CtaPrimary must pass amberCta so StickyCta can yield to it"
    ).toMatch(/\bamberCta\b/);
  });

  it("TrackedLink accepts the prop and renders the attribute", () => {
    const tracked = codeText(path.join(SRC, "components", "marketing", "tracked.tsx"));
    expect(tracked, "the prop CtaPrimary passes must exist").toMatch(/\bamberCta\b/);
    expect(tracked, "and must reach the DOM as an attribute").toContain("data-amber-cta=");
  });

  // Both header CTAs: the desktop one (so the bar cannot appear beside it if the
  // breakpoint ever moves) and the sheet one.
  it("both SiteHeader amber CTAs carry the marker", () => {
    const header = codeText(path.join(SRC, "components", "marketing", "SiteHeader.tsx"));
    const marked = (header.match(/data-amber-cta/g) ?? []).length;
    const amber = (header.match(/bg-brand/g) ?? []).length;
    expect(
      marked,
      `SiteHeader has ${amber} amber element(s) but ${marked} marker(s) — every amber ` +
        `action in the shell must be visible to StickyCta`
    ).toBe(amber);
  });
});

describe("sticky CTA blast radius", () => {
  const importers = tsxUnder(APP)
    .filter((f) => /from\s+"@\/components\/marketing\/StickyCta"/.test(codeText(f)))
    .map(rel)
    .sort();

  /**
   * Two pages, named explicitly.
   *
   * The audit scoped it to the long conversion pages, and the pages it must
   * never reach are the ones where a fixed bar would sit over a money action:
   * the shopper claim and ticket surfaces, phone verification, and the merchant
   * console's verify screen. `(shopper)` and `merchant/` already have their own
   * bottom navigation at `z-40`, so a second fixed bar there would also stack.
   *
   * An enumerated list is normally the weaker guard — it only checks what
   * someone remembered to add (drift D52). Here it is the right shape, because
   * the assertion is exact equality in both directions: a page that starts
   * importing StickyCta fails this test until it is added deliberately.
   */
  it("is mounted on /merchants and /shoppers only", () => {
    expect(importers).toEqual([
      path.join("app", "(marketing)", "merchants", "page.tsx"),
      path.join("app", "(marketing)", "shoppers", "page.tsx"),
    ]);
  });

  it("never reaches an app surface", () => {
    const offenders = importers.filter((f) => !f.includes("(marketing)"));
    expect(
      offenders,
      `StickyCta is a marketing primitive. A fixed bar on a claim, ticket, ` +
        `verification or merchant surface overlays a money action:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
