import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { stripCommentLines } from "./helpers/comment-stripping";

/**
 * The app has one motion system, and it is wired in two halves.
 *
 * `globals.css` declares `--ease-standard` — a calm decelerating curve — and
 * instructs authors to "keep new transitions on this so overlays, presses, and
 * fades feel like one system". `tailwind.config.ts` makes it the DEFAULT timing
 * function, so a bare `transition` gets it without anyone remembering to ask.
 *
 * Both halves are load-bearing and neither fails loudly. Drop the config entry
 * and every transition silently reverts to Tailwind's `cubic-bezier(0.4, 0, 0.2, 1)`
 * — an ease-in-out that starts slow, which on a press reads as lag. Drop the
 * custom property and the `var()` falls to its literal, which is correct but
 * leaves the declared token dead. Neither shows up in a screenshot, a type
 * error, or a render test; it just makes the product feel a little cheaper.
 *
 * That is exactly what happened before this guard: the token was declared, the
 * instruction was written, and 42 of 44 transitions ignored both.
 */

const SRC = path.resolve(__dirname, "..", "..");
const APP = path.resolve(SRC, "..");

describe("motion system", () => {
  it("declares the house easing token", () => {
    const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    expect(css, "globals.css must declare --ease-standard").toMatch(
      /--ease-standard:\s*cubic-bezier\(/
    );
  });

  it("wires the house easing as Tailwind's default timing function", () => {
    const config = readFileSync(path.join(APP, "tailwind.config.ts"), "utf8");
    const block = config.slice(config.indexOf("transitionTimingFunction"));
    expect(
      config.includes("transitionTimingFunction"),
      "tailwind.config.ts must set transitionTimingFunction so a bare `transition` " +
        "uses the house curve rather than Tailwind's ease-in-out default"
    ).toBe(true);
    expect(
      /DEFAULT:\s*["'`]var\(--ease-standard/.test(block),
      "transitionTimingFunction.DEFAULT must resolve to var(--ease-standard, …)"
    ).toBe(true);
    expect(
      /var\(--ease-standard,\s*cubic-bezier\(/.test(block),
      "var(--ease-standard) needs a literal fallback — an undefined custom property " +
        "makes the declaration invalid, which silently reverts to `ease`"
    ).toBe(true);
  });

  /**
   * `transition-all` animates every animatable property, including the layout
   * ones — `width`, `height`, `top`, `left` — which re-run layout each frame.
   * The Toggle knob did exactly this, sliding on `left`. Naming the properties
   * is also documentation: the reader can see what is meant to move.
   */
  it("never uses transition-all", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          walk(full);
        } else if (name.endsWith(".tsx")) {
          stripCommentLines(readFileSync(full, "utf8")).forEach((line, i) => {
            if (/\btransition-all\b/.test(line)) {
              hits.push(`  ${path.relative(SRC, full)}:${i + 1}  ${line.trim()}`);
            }
          });
        }
      }
    };
    walk(SRC);
    expect(
      hits,
      "transition-all animates layout properties too. Name what actually " +
        "moves, e.g. transition-[transform,background-color]:\n" + hits.join("\n")
    ).toEqual([]);
  });
});
