import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D174 / D184 — the two Node 0 evidence counters, kept nameable.
 *
 * `is_demo = false` marks a real *record*, not a real *customer*. Production
 * holds two non-demo merchant records and one non-demo `success` redemption,
 * and every one of them was created by MAANTA testing itself:
 *
 *   * `bf66a041` SKANDI SKAN — a founder registration exercise with a family
 *     member, 2026-08-16.
 *   * `67fe233d` E2E Full Sweep Shop — the full-role E2E sweep, 2026-08-23.
 *   * redemption `72f95ac8` — that sweep's `success`, which D174 ruled is
 *     internal evidence and must never increment the 1 -> 5 -> 10 field ladder.
 *
 * D174 split the redemption counters; the merchant records were left
 * unclassified, so a census running `merchants WHERE is_demo = false` read 2
 * and had nothing in the repo telling it those two are not acquisitions. Three
 * older documents still say "real merchants: 1 - SKANDI SKAN" unqualified.
 *
 * There is no schema signal to assert here and there never will be: an internal
 * test row and a genuine merchant are identical to the database by design, which
 * is exactly why the classification has to live in prose. What CAN be guarded is
 * that the prose keeps naming them — a future edit that tidies an id out of
 * CLAUDE.md is how the distinction quietly disappears and the ladder starts at
 * 2. Deliberately asserts identifiers, not counts: the counts change the moment
 * Merchant 01 onboards, and this test must not have to change with them.
 */
const claudeMd = readFileSync(join(__dirname, "..", "..", "..", "..", "CLAUDE.md"), "utf8");

/** The internal, MAANTA-created production records — none is field evidence. */
const INTERNAL_RECORDS = [
  ["bf66a041", "SKANDI SKAN"],
  ["67fe233d", "E2E Full Sweep Shop"],
  ["72f95ac8", "the internal success redemption"],
] as const;

describe("Node 0 evidence counters — internal records stay identified", () => {
  it("reads a CLAUDE.md that actually has the evidence section", () => {
    // Asserted first: if the file moved or the section was renamed, every
    // assertion below would pass or fail for the wrong reason.
    expect(claudeMd.length).toBeGreaterThan(1000);
    expect(claudeMd, "the two-counter ruling is gone from CLAUDE.md").toContain(
      "Two counters, never one"
    );
  });

  for (const [id, label] of INTERNAL_RECORDS) {
    it(`still names ${id} (${label}) as internal, not field, evidence`, () => {
      expect(
        claudeMd,
        `${id} is no longer named in CLAUDE.md — a census counting non-demo rows ` +
          "would now read it as a genuine Node 0 acquisition"
      ).toContain(id);
    });
  }

  it("keeps the external field counter explicitly at zero", () => {
    // The ladder's starting point. If a session ever edits this to a non-zero
    // number, it must be because a real merchant served a real shopper.
    expect(claudeMd).toMatch(/External field validation: 0 genuine merchant successes/);
    expect(claudeMd).toMatch(/External field validation: 0 genuine merchants/);
  });

  it("says plainly that a non-demo row is not a customer", () => {
    // Whitespace-tolerant: the sentence wraps in CLAUDE.md, and a guard that
    // breaks on a re-wrap teaches the next author to delete it.
    expect(claudeMd.replace(/\s+/g, " ")).toContain(
      "`is_demo = false` marks a real *record*, not a real *customer*"
    );
  });
});
