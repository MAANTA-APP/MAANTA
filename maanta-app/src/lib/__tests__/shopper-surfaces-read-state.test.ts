import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Wiring guards for the shopper surfaces PR 1 touched.
 *
 * The behaviour lives in `shopper-read-state.test.ts`, which forces the
 * failure directly. These assert the surfaces actually *call* that decision
 * rather than re-deriving it — the gap that let D182 sit green over the very
 * rule it forbade, because the guard checked a shape instead of a behaviour.
 *
 * Both halves are needed: a behavioural test proves the decision is right, a
 * wiring test proves the screen asks it.
 */
const read = (rel: string) =>
  stripComments(readFileSync(path.join(__dirname, "../../", rel), "utf8"));

describe("/my-deals no longer flattens a failed read into an empty list", () => {
  const src = read("app/(shopper)/my-deals/page.tsx");

  it("keeps the error on both reads instead of discarding it", () => {
    // `const { data } = await ...` throws the error away at the point of read,
    // after which no downstream check can tell failure from emptiness.
    expect(src).toContain("listReadState(");
    expect(src).toContain("listReadRows(");
    expect(src).not.toMatch(/const \{ data \} = await service/);
    expect(src).not.toMatch(/const \{ data: favs \} = await service/);
  });

  it("gates the tickets empty state behind the read state", () => {
    expect(src).toMatch(/ticketsState === "failed"/);
    // The failure branch must come first; otherwise `shown.length === 0`
    // matches on a failed read and claims the shopper has no deals.
    const failIdx = src.indexOf('ticketsState === "failed"');
    const emptyIdx = src.indexOf("shown.length === 0");
    expect(failIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeLessThan(emptyIdx);
  });

  it("gates the saved-shops empty state behind its own read state", () => {
    expect(src).toMatch(/favsState === "failed"/);
    const failIdx = src.indexOf('favsState === "failed"');
    const emptyIdx = src.indexOf("rows.length === 0");
    expect(failIdx).toBeLessThan(emptyIdx);
  });

  it("uses the shared failure copy rather than a per-screen wording", () => {
    expect(src).toContain("SHOPPER_LIST_READ_ERROR");
  });

  it("no longer coalesces ANY read result into rows", () => {
    // Written the narrow way first — matching the old variable names `data`
    // and `favs` — and a mutation proved that useless: renaming the read to
    // `ticketsRead` and writing `ticketsRead.data ?? []` reintroduced the
    // exact defect with the guard still green. This is the failure mode the
    // brief names (D182): a guard that checks a spelling instead of a rule.
    // So: no `.data ?? []` anywhere on this page, whatever it is called.
    expect(src).not.toMatch(/\.data\s*\?\?\s*\[\]/);
    expect(src).not.toMatch(/\b(data|favs)\s*\?\?\s*\[\]/);
    // ...and both reads must go through the helper, so rows cannot be derived
    // any other way.
    expect(src.match(/listReadRows\(/g)?.length ?? 0).toBe(2);
    expect(src.match(/listReadState\(/g)?.length ?? 0).toBe(2);
  });
});

describe("absent wayfinding is stated on both shopper surfaces", () => {
  for (const rel of [
    "app/(shopper)/shops/[id]/page.tsx",
    "app/(shopper)/tickets/[id]/page.tsx",
  ]) {
    it(`${rel} explains a missing location instead of rendering nothing`, () => {
      const src = read(rel);
      expect(src).toContain("navigationState(");
      expect(src).toContain("SHOP_LOCATION_UNAVAILABLE");
      // The silent branch: `{navigate ? (...) : null}` is what this replaces.
      expect(src).not.toMatch(/\{navigate \? \([\s\S]{0,400}\) : null\}/);
    });
  }
});
