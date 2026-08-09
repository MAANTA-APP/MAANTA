import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * The feed rail names are frozen copy — founder ruling R2, design brief v1.4
 * (decisions log 2026-08-09; closes drift D66).
 *
 * The ruling: the shopper-facing rail titles shipped in the feed are the names,
 * everywhere the rails are named to a user. Notion's locked-structure labels
 * ("Flash / Priority Placements / All Active Deals") survive only as the
 * `flash` / `boosted` / `standard` rail identifiers, never as UI copy. D66's
 * bite was the merchant side: a merchant paid KES 500/24h for placement on a
 * rail the boost surfaces still called "Priority Placements" — a name no
 * shopper ever sees.
 *
 * Two directions, per the D66 close condition:
 *
 *  - the feed must keep rendering the ruled titles, so a rename needs a new
 *    ruling rather than a quiet edit;
 *  - the retired name must not return anywhere in app source. Comments are
 *    stripped first (shared lexer — D38), so explaining a rename in a comment
 *    stays legal; only copy a build could ship trips this.
 *
 * The rail *orders* are D1's, pinned by `locked-feed-order.test.ts` — R2 is
 * names only. That includes rail 3: titled "Deals near me", ordered by all-time
 * verified redemptions. That label/order pairing is a recorded open question
 * (drift D77) awaiting a founder ruling; this guard deliberately pins the
 * ruled title and says nothing about what the ordering should be.
 */

const SRC = path.resolve(__dirname, "..", "..");

/** The ruled titles, exactly as the feed renders them (sentence case). */
const RAIL_TITLES = [
  "Top picks near you",
  "Neighbourhood favourites",
  "Deals near me",
] as const;

/** The retired rail name. Singular form so a rewording cannot slip past. */
const RETIRED = /Priority Placement/i;

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);

const read = (...segments: string[]) =>
  readFileSync(path.join(SRC, ...segments), "utf8");

describe("feed rail names are the ruled titles (R2, closes D66)", () => {
  it("renders all three ruled titles on the shopper feed", () => {
    const feed = read("app", "(shopper)", "feed", "page.tsx");
    for (const title of RAIL_TITLES) {
      expect(
        feed,
        `feed rail title "${title}" is frozen by founder ruling R2 — renaming it needs a new ruling`
      ).toContain(`title="${title}"`);
    }
  });

  it("names the boosted rail to the merchant the way the shopper sees it", () => {
    // The boost purchase sheet and the active-boost banner are where a merchant
    // is told what they are paying for; both must use the shopper-visible name.
    const sheet = read(
      "app",
      "merchant",
      "(app)",
      "deals",
      "[id]",
      "deal-actions.tsx"
    );
    const detail = read("app", "merchant", "(app)", "deals", "[id]", "page.tsx");
    expect(sheet, "boost purchase sheet (frame 10e)").toContain(
      "Neighbourhood favourites"
    );
    expect(detail, "active-boost banner on merchant deal detail").toContain(
      "Neighbourhood favourites"
    );
  });

  it('keeps the retired name "Priority Placements" out of app source', () => {
    const files = walk(SRC, [".ts", ".tsx"]);
    const offenders = files.filter((f) => RETIRED.test(stripComments(readFileSync(f, "utf8"))));
    expect(
      offenders.map(rel),
      'the rail was renamed to "Neighbourhood favourites" (founder ruling R2) — the retired name must not reach a user again'
    ).toEqual([]);
  });
});
