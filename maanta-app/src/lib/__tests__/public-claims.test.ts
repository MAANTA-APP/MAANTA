import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walk, relToSrc } from "./helpers/source-files";
import { stripComments } from "./helpers/comment-stripping";
import { ENTITY } from "@/lib/marketing/demo";

/**
 * Public claims — founder ruling 2026-09-04 (`10_PUBLIC_CLAIMS_AND_FORM_SAFETY`).
 *
 * Every pattern here is a sentence the site once published about something that
 * does not exist: a desk in a mall MAANTA has not yet introduced itself to, a
 * top-up mechanism with no payment behind it, a staffed node with nobody on the
 * floor, a support team with a reply time, a "live" feed of demo rows. Each was
 * written as a literal at its point of use, which is why the same defect showed
 * up on three pages, and each is now either deleted or resolved through one
 * gated constant so it flips in one place when it becomes true.
 *
 * The ruling's acceptance criterion is a banned-string sweep that returns zero
 * matches in user-facing copy and metadata (§7.1). This is that sweep, run over
 * source rather than built output because CI runs `test` before `build` (same
 * constraint as every other marketing guard — D41). Copy is static, so a string
 * absent from source is absent from output; the two deliberate exceptions the
 * ruling names are encoded as `allow` patterns rather than left to memory.
 *
 * Whole-file, whitespace-collapsed matching, for the reason
 * `prelaunch-consistency.test.ts` gives: JSX wraps prose at the print width, and
 * a line-by-line guard is a guard whose verdict depends on Prettier.
 */

const SRC = path.resolve(__dirname, "..", "..");

const MARKETING_TSX = walk(path.join(SRC, "app", "(marketing)"), [".tsx"])
  .concat(walk(path.join(SRC, "components", "marketing"), [".tsx"]))
  .concat(walk(path.join(SRC, "lib", "marketing"), [".ts", ".tsx"]));
const LEGAL_MD = walk(path.join(SRC, "content", "legal"), [".md"]);

/** One sweep row: the pattern, where it applies, and what the ruling says. */
type Banned = {
  pattern: RegExp;
  claim: string;
  ruling: string;
  /** Matches to ignore — the ruling's explicit survivors. */
  allow?: RegExp[];
  /** Whether the legal drafts are in scope. Defaults to true. */
  legal?: boolean;
};

const BANNED: Banned[] = [
  // X1 — premises. "BBS Mall, Eastleigh" as prose ("preparing to open at BBS
  // Mall, Eastleigh") is permitted and must survive; the address block is not.
  {
    pattern: /BBS Mall,? Eastleigh,? Nairobi,? Kenya/i,
    claim: "the mall as a postal address block",
    ruling: "X1 — no address at BBS until the mall authorises the relationship (D261)",
  },
  {
    pattern: /\b(?:desk|office) (?:at|in|inside) (?:BBS|the mall)\b|\bin-mall desk\b|\bMAANTA desk\b|\bthe desk\b/i,
    claim: "a MAANTA desk or office in the mall",
    ruling: "X1 — MAANTA has no premises in BBS Mall (D261)",
    allow: [/do not have a desk or an office in the mall/i],
  },
  {
    pattern: /\bMAANTA operates at\b|\boperates from\b|\bbased at BBS\b/i,
    claim: "MAANTA operating from the mall",
    ruling: "X1 — intent only: \"preparing to open at\" (D261)",
  },
];

const flatten = (text: string) => text.replace(/\s+/g, " ");

function offendersFor(row: Banned): string[] {
  const out: string[] = [];
  const files = row.legal === false ? MARKETING_TSX : MARKETING_TSX.concat(LEGAL_MD);
  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    const text = flatten(f.endsWith(".md") ? raw : stripComments(raw));
    for (const m of Array.from(text.matchAll(new RegExp(row.pattern.source, row.pattern.flags + "g")))) {
      const around = text.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 60);
      if (row.allow?.some((a) => a.test(around))) continue;
      out.push(`${relToSrc(SRC, f)}  →  "${m[0]}"`);
    }
  }
  return out;
}

describe("public claims (founder ruling 2026-09-04)", () => {
  it("has content to scan", () => {
    expect(MARKETING_TSX.length).toBeGreaterThan(20);
    expect(LEGAL_MD.length).toBe(4);
  });

  for (const row of BANNED) {
    it(`does not publish ${row.claim}`, () => {
      expect(
        offendersFor(row),
        `${row.ruling}. Found:\n${offendersFor(row).join("\n")}`
      ).toEqual([]);
    });
  }

  it("carries no address in the entity record, so no surface can render one", () => {
    // `ENTITY.address` is what every address block read from. Its absence is the
    // ratchet: a surface that wants an address fails to type-check.
    expect("address" in ENTITY).toBe(false);
  });
});
