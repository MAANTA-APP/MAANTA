import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { stripCommentLines } from "./helpers/comment-stripping";

// Static enforcement of the frozen UI hard rules (README §"Hard Rules",
// ENGINEERING_NOTES §8.5) that can be checked from source. These are ratchets:
// they pass today and fail the moment a regression is introduced, so the rules
// are enforced in CI rather than only in a design review.

const SRC = path.resolve(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...tsxFiles(full));
    } else if (name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const FILES = tsxFiles(SRC);
const rel = (f: string) => path.relative(SRC, f);

type Hit = { file: string; line: number; text: string };

function scan(predicate: (line: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const f of FILES) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (predicate(line)) hits.push({ file: rel(f), line: i + 1, text: line.trim() });
    });
  }
  return hits;
}

/**
 * `scan`, but over source with comments removed.
 *
 * A comment renders nothing, so a rule about what ships should not read one.
 * The first run of the focus-ring guard below failed on the docblock in
 * `inputs.tsx` that explains why the amber ring was removed — the trap
 * `helpers/comment-stripping.ts` was written for, where documenting a banned
 * pattern reintroduces the failure and the guard teaches the next author to
 * delete the explanation instead of keeping the rule.
 *
 * The three guards above still read raw lines. That is deliberately left alone:
 * for banned *vocabulary* the stricter reading is arguably right, and changing
 * them is a separate call from adding this one.
 */
function scanCode(predicate: (line: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const f of FILES) {
    stripCommentLines(readFileSync(f, "utf8")).forEach((line, i) => {
      if (predicate(line)) hits.push({ file: rel(f), line: i + 1, text: line.trim() });
    });
  }
  return hits;
}

const fmt = (hits: Hit[]) => hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join("\n");

describe("frozen UI hard rules (static enforcement)", () => {
  // Rule 3: "Money never colored" — all money is text-primary #111 (or white on
  // a dark surface). Amber (text-brand) on a money value is forbidden.
  it("never renders money in amber (text-brand)", () => {
    const money = /KES\s*[\d]|MoneyValue|formatKes/;
    const hits = scan((l) => l.includes("text-brand") && money.test(l));
    expect(hits, `Money rendered in amber (use text-ink / text-white):\n${fmt(hits)}`).toEqual([]);
  });

  // Rule 5: closed product vocabulary — never "voucher", "coupon",
  // "discount code" or "Free plan". (Commission is checked by hand: the only
  // occurrence is a negation in the FAQ — "no listing fees or commissions".)
  it("uses only the frozen vocabulary in user-facing copy", () => {
    const banned = [/\bvouchers?\b/i, /\bcoupons?\b/i, /discount code/i, /free plan/i];
    const hits = scan((l) => {
      // ignore import/identifier noise; this targets human copy well enough.
      return banned.some((re) => re.test(l));
    });
    expect(hits, `Forbidden vocabulary (claim/redeem/deal/wallet/top up/success fee only):\n${fmt(hits)}`).toEqual([]);
  });

  // Rule 4 (token discipline): status-error red (#8C1D18 / text-flame) is for
  // borders and icons only — error MESSAGE text stays #111 (text-ink), so a
  // state is never signalled by colour alone (greyscale-readable). Allowed
  // text-flame: on a border (border-flame), on an icon (Icon*), or the two
  // status-indicator glyph/label cases; anything else is coloured body text.
  it("never renders error body text in red (text-flame is borders/icons/status only)", () => {
    const allowed = (l: string) =>
      l.includes("border-flame") || // border tone: button, chip, inline-alert
      /\bIcon\w*/.test(l) || // icon component: IconBolt, IconX
      l.includes("text-2xl font-black text-flame") || // states.tsx error glyph "!"
      l.includes('? "text-flame"'); // cards.tsx status-label ternary
    const hits = scan((l) => l.includes("text-flame") && !allowed(l));
    expect(
      hits,
      `Error text in red — move body text to text-ink (#111), keep red on the border/icon:\n${fmt(hits)}`
    ).toEqual([]);
  });

  // Rule 1 (amber is rationed) + WCAG 1.4.11: the accent is never a focus
  // indicator. #FDBF2D is 1.66:1 on white and 1.59:1 on paper, under the 3:1 a
  // focus indicator must clear, and a ring on a focused field spends the one
  // amber element a screen is allowed beside its actual CTA.
  //
  // `marketing-a11y.test.ts` has named this rule since the focus styles landed,
  // but it reads `globals.css` alone — the stylesheet that already complied.
  // Nine components carried `focus:ring-brand` underneath that passing test.
  // This is the half that reads the components, so the guard covers what its
  // name claims (cf. D36, D38: a guard green over the thing it forbids).
  it("never uses the amber accent as a focus indicator", () => {
    const hits = scanCode((l) => /(?:focus|focus-within|focus-visible):ring-brand\b/.test(l));
    expect(
      hits,
      `Amber focus ring (#FDBF2D is 1.66:1 on white, under the 3:1 WCAG 1.4.11 floor) — use ring-ink:\n${fmt(hits)}`
    ).toEqual([]);
  });

  // Rule 4: failures are dark (#141414), never red. The merchant verify failure
  // surface must render on bg-ink-900 and never on a red fill.
  it("keeps the merchant failure takeover dark, not red", () => {
    const f = path.join(SRC, "app", "merchant", "(app)", "redeem", "redeem-keypad.tsx");
    const src = readFileSync(f, "utf8");
    expect(src, "failure surface should use bg-ink-900").toContain("bg-ink-900");
    // No red background on the failure takeover.
    expect(/bg-flame|bg-red-/.test(src), "failure takeover must not use a red background").toBe(false);
  });
});
