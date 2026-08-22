import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { walk, relToSrc } from "./helpers/source-files";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Direction A ratchet (decisions log, 2026-08-22): app-surface content cards
 * are borderless white on `shadow-card`. The pre-refresh idiom
 * `rounded-card border border-line bg-white` must not return on shopper,
 * merchant, admin, agent, founder or auth surfaces.
 *
 * Deliberately out of scope, and why:
 * - `(marketing)` routes and `components/marketing` — the marketing site is a
 *   separate Direction A slice with its own accent budget; it flips in its own
 *   change, not silently through this guard.
 * - `ui/claude/controls.tsx` — the one allowed border-line + rounded-card use
 *   is the FilterDropdown popover: a floating layer over white content needs
 *   an edge, unlike a card resting on the stone wash.
 * - Hairline dividers (`border-b border-line`, `divide-line`) and bordered
 *   form inputs are not cards and stay.
 */

const SRC = path.resolve(__dirname, "../..");
const BANNED = "rounded-card border border-line bg-white";

const isExempt = (file: string): boolean =>
  file.includes(`${path.sep}(marketing)${path.sep}`) ||
  file.includes(`${path.sep}marketing${path.sep}`) ||
  file.endsWith(path.join("ui", "claude", "controls.tsx"));

describe("Direction A — borderless shadow cards", () => {
  it("no app surface reintroduces the bordered card idiom", () => {
    const offenders = walk(SRC, [".tsx"])
      .filter((f) => !isExempt(f))
      .filter((f) => stripComments(readFileSync(f, "utf8")).includes(BANNED))
      .map((f) => relToSrc(SRC, f));
    expect(offenders, `cards are borderless on shadow-card (Direction A); found "${BANNED}" in`).toEqual([]);
  });

  it("the shared card components carry shadow-card", () => {
    for (const rel of ["components/ui/claude/deal-card.tsx", "components/ui/cards.tsx"]) {
      const src = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
      expect(src.includes("shadow-card"), `${rel} should keep shadow-card on its cards`).toBe(true);
    }
  });
});
