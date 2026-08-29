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
    // D213 moved the tickets empty state into the client collection, because
    // "you have no active deals" is a claim about membership at the CURRENT
    // time and froze when the server decided it. The D202 invariant is
    // unchanged and now holds structurally: the failure branch is rendered
    // INSTEAD of the collection, so a failed read cannot reach the copy that
    // asserts the shopper has claimed nothing.
    expect(src).toMatch(/ticketsState === "failed"/);
    const failIdx = src.indexOf('ticketsState === "failed"');
    const listIdx = src.indexOf("<MyDealsList");
    expect(failIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeLessThan(listIdx);
    // The page must not keep a second, unreachable copy of that copy.
    expect(src).not.toContain("No claimed deals yet");
    // ...and the collection must still carry it.
    const list = read("components/shopper/my-deals-list.tsx");
    expect(list).toContain("No claimed deals yet");
    expect(list).toContain("No past deals");
    // ...and the segment-empty copy, which must not deny a history the other
    // segment holds.
    expect(list).toContain("No active deals");
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
      expect(src).toContain("shopLocationUnavailable(");
      // The copy must be a function of the RECORD, so it can name only the
      // locators that exist. Two versions of this have now been wrong: an
      // unconditional string promising "floor and unit", then a boolean —
      // which collapsed floor-only and unit-only into the same "both" copy,
      // because the predicate behind it is floor OR unit.
      //
      // Asserted as the invariant rather than as a named helper: the previous
      // version required `hasOnScreenLocationDetails(` to appear, which the
      // correct fix removed from this surface entirely. A guard pinned to a
      // mechanism fails the repair and passes the defect.
      expect(src).not.toMatch(/shopLocationUnavailable\(\s*(true|false)\s*\)/);
      expect(src).toMatch(/shopLocationUnavailable\(\s*[A-Za-z_$][\w$]*\s*\)/);
      // The silent branch: `{navigate ? (...) : null}` is what this replaces.
      expect(src).not.toMatch(/\{navigate \? \([\s\S]{0,400}\) : null\}/);
    });
  }
});

describe("the surfaces render the details their fallback points at", () => {
  it("/shops/[id] renders unit_number, which it was already fetching", () => {
    const src = read("app/(shopper)/shops/[id]/page.tsx");
    expect(src).toContain("unit_number");
    expect(src).toMatch(/shop\.unit_number \?/);
  });

  it("/tickets/[id] fetches AND renders unit_number", () => {
    // It fetched neither before, while the fallback told the shopper to use it.
    const src = read("app/(shopper)/tickets/[id]/page.tsx");
    expect(src).toMatch(/merchants\([^)]*unit_number[^)]*\)/);
    expect(src).toContain("[m.floor, m.unit_number]");
  });
});
