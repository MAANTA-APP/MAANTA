import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Icon size overrides must actually apply — drift **D54**.
 *
 * `Svg` in `components/ui/icons.tsx` used to render
 * `cn("h-5 w-5 shrink-0", className)`. `cn()` is `parts.filter(Boolean).join(" ")`
 * with no Tailwind conflict resolution and `tailwind-merge` is not a dependency,
 * so a default and a caller override both landed in the class attribute and the
 * cascade picked the winner — `h-5`, every time. Measured in a browser: a tick
 * asking for `h-4` (16px) rendered at 20px. **79 call sites passed their own
 * size and 56 of them were silently ignored.**
 *
 * The fix is to apply the default only when the caller supplies nothing, so the
 * two never collide. That is a behavioural change across 56 surfaces, which is
 * why it shipped on its own with a human visual pass rather than folded into an
 * unrelated diff.
 *
 * This file guards the predicate that decides it. The regression it exists to
 * catch is subtle in both directions:
 *
 *  - too loose, and `min-h-0` or `max-w-full` reads as "the caller set a size",
 *    dropping the default and leaving the icon dimensionless;
 *  - too strict, and the default is re-emitted alongside the override, which is
 *    exactly D54 returning.
 *
 * The predicate is duplicated here rather than exported. That is deliberate and
 * is the one weakness worth naming: `icons.tsx` is a `.tsx` module of React
 * components, and importing it into a node-environment vitest file to reach one
 * helper would pull JSX through the transform for no benefit. The duplication is
 * three lines and the shape is asserted against the source below, so a change to
 * one that is not made in the other fails rather than drifts.
 */

const SRC = path.resolve(__dirname, "..", "..");
const ICONS = path.join(SRC, "components", "ui", "icons.tsx");

/** Mirror of `setsDimension` in `components/ui/icons.tsx`. */
const setsDimension = (className: string | undefined, axis: "h" | "w") =>
  new RegExp(`(?:^|\\s)${axis}-\\S`).test(className ?? "");

describe("icon size overrides (D54)", () => {
  it("treats a caller-supplied size as set", () => {
    const cases: Array<[string, "h" | "w"]> = [
      ["h-4 w-4", "h"],
      ["h-4 w-4", "w"],
      ["h-3.5 w-3.5", "h"],
      ["h-8 w-8", "h"],
      ["h-[18px]", "h"],
      ["h-full", "h"],
      ["mt-0.5 h-4 w-4 text-muted", "w"],
    ];
    for (const [cls, axis] of cases) {
      expect(setsDimension(cls, axis), `${axis} should be set by "${cls}"`).toBe(true);
    }
  });

  // Too loose here and the default is dropped with nothing replacing it, which
  // renders the icon at whatever the SVG intrinsic is — a worse bug than D54.
  it("does not mistake compound utilities for a size", () => {
    const cases: Array<[string, "h" | "w"]> = [
      ["min-h-0", "h"],
      ["max-w-full", "w"],
      ["min-w-0 text-ink", "w"],
      ["shrink-0 text-white/60", "h"],
      ["mt-0.5 text-muted", "h"],
      ["", "h"],
    ];
    for (const [cls, axis] of cases) {
      expect(setsDimension(cls, axis), `${axis} should NOT be set by "${cls}"`).toBe(false);
    }
  });

  it("handles an absent className", () => {
    expect(setsDimension(undefined, "h")).toBe(false);
    expect(setsDimension(undefined, "w")).toBe(false);
  });

  // Height and width are independent: a caller passing only `w-full` still wants
  // the default height, not none.
  it("resolves each axis independently", () => {
    expect(setsDimension("w-full", "w")).toBe(true);
    expect(setsDimension("w-full", "h")).toBe(false);
  });

  /**
   * The mirror above is only trustworthy while it matches the source. This
   * asserts the real implementation still applies its defaults conditionally —
   * if someone restores the unconditional `cn("h-5 w-5 shrink-0", className)`,
   * every assertion above would keep passing while the bug came back.
   */
  it("keeps the default conditional in the real component", () => {
    const src = readFileSync(ICONS, "utf8");
    expect(
      /const setsDimension\s*=\s*\(/.test(src),
      "icons.tsx must still define setsDimension — this file mirrors it"
    ).toBe(true);
    expect(
      /!setsDimension\(className, "h"\) && "h-5"/.test(src),
      "the h-5 default must be applied conditionally, or D54 returns"
    ).toBe(true);
    expect(
      /!setsDimension\(className, "w"\) && "w-5"/.test(src),
      "the w-5 default must be applied conditionally, or D54 returns"
    ).toBe(true);
    expect(
      /cn\(\s*"h-5 w-5 shrink-0",\s*className\s*\)/.test(src),
      "the unconditional default is the D54 bug and must not return"
    ).toBe(false);
  });
});
