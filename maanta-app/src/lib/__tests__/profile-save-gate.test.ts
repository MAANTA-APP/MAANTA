import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * The until-dirty Save gate on the /you profile editor — drift **D82**'s
 * standalone half (frame 16c). Save must be inert until a field actually
 * differs from the saved profile: a Save that is always live fires no-op
 * PATCHes and lies about there being something to save.
 *
 * Source-level on purpose, and worth saying why rather than leaving it to look
 * like laziness: this suite runs in a node environment with no DOM and no
 * user-event tooling, so "type a character, watch the button enable" is not
 * writable here. What IS assertable is the wiring that makes the behaviour
 * true — the button is disabled on `!dirty`, and `dirty` is computed from all
 * three editable fields against the same values `openEdit` seeds them from.
 * The same trade-off `frozen-ui-rules.test.ts` makes, for the same reason.
 *
 * Deliberately NOT here: anything about phone/email editing. That is D82's
 * founder half and it stays open — this file must not be read as closing it.
 */

const SOURCE = stripComments(
  readFileSync(
    path.resolve(__dirname, "..", "..", "app", "(shopper)", "profile", "profile-card.tsx"),
    "utf8"
  )
);

describe("/you profile editor — until-dirty Save gate (D82)", () => {
  it("disables Save on !dirty, not only while pending", () => {
    // The exact regression: `disabled={pending}` alone was the shipped state.
    expect(SOURCE).toMatch(/disabled=\{pending \|\| !dirty\}/);
  });

  it("computes dirty from every editable field", () => {
    const dirtyExpr = SOURCE.match(/const dirty =([\s\S]*?);/)?.[1] ?? "";
    // First name, last name, and mall are the three things the editor can
    // change; dropping any one of them re-opens a silent no-op path for it.
    expect(dirtyExpr).toContain("firstName");
    expect(dirtyExpr).toContain("lastName");
    expect(dirtyExpr).toContain("mall !== node");
  });

  it("compares against the same parsing openEdit seeds from", () => {
    // Both sides split fullName the same way; if the comparison baseline and
    // the seed diverge, reopening the editor starts dirty and the gate lies in
    // the other direction.
    const splits = SOURCE.match(/\(fullName \?\? ""\)\.trim\(\)\.split\(\/\\s\+\/\)\.filter\(Boolean\)/g);
    expect(splits?.length ?? 0).toBeGreaterThanOrEqual(3); // initial state, openEdit, dirty baseline
  });

  it("Cancel stays enabled by pending only — a clean form must still be closable", () => {
    expect(SOURCE).toMatch(/onClick=\{\(\) => setEditing\(false\)\}\s*disabled=\{pending\}/);
  });
});
