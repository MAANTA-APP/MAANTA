import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Held claims must not ship — `docs/ops/website-handoff.md` §9.
 *
 * These are lines that outrun what is true or agreed. Each is blocked on a
 * specific decision (the CBK licensing question, an enforcement process that
 * does not exist, a response time nobody has committed to), and each would be
 * easy to reintroduce by copying a sentence out of a deck without reading its
 * claims register.
 *
 * Scanned across page source **and** the legal content files. The second half
 * matters: two of these claims reached the build not through marketing copy but
 * through "Copy alignment required" tables inside the legal drafts — sections
 * written to tell MAANTA which marketing lines to pull, which then rendered on
 * the public legal page telling visitors the same thing.
 */

const SRC = path.resolve(__dirname, "..", "..");

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

/** Comments explain why a claim was withheld; they are not published copy. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const TSX = walk(path.join(SRC, "app", "(marketing)"), [".tsx"]).concat(
  walk(path.join(SRC, "components", "marketing"), [".tsx"])
);
const MD = walk(path.join(SRC, "content", "legal"), [".md"]);

const HELD: { pattern: RegExp; claim: string; blockedOn: string }[] = [
  {
    pattern: /balance stays yours/i,
    claim: '"Anything left in your balance stays yours"',
    blockedOn: "the CBK licensing question — needs a real refund mechanism and Merchant Terms 7.6",
  },
  {
    pattern: /does not stay on MAANTA/i,
    claim: '"A shop that does not honour its own deals does not stay on MAANTA"',
    blockedOn: "an enforcement process (ToS 6.3) that does not exist yet",
  },
  {
    pattern: /within 24 hours|reply within \d|respond within \d/i,
    claim: "A stated response time",
    blockedOn: "nobody having committed to a window — publish only what can be met",
  },
  {
    pattern: /CBK[-/]\s*(DEMO|PSP)/i,
    claim: "A CBK licence identifier, real or placeholder",
    blockedOn: "the decision of 2026-07-31 — render the regulatory-status block instead",
  },
];

describe("held claims are absent from shippable content", () => {
  it("has content to scan", () => {
    expect(TSX.length).toBeGreaterThan(8);
    expect(MD.length).toBe(4);
  });

  for (const { pattern, claim, blockedOn } of HELD) {
    it(`does not publish ${claim}`, () => {
      const hits: string[] = [];
      for (const f of TSX) {
        if (pattern.test(codeOnly(readFileSync(f, "utf8")))) hits.push(rel(f));
      }
      for (const f of MD) {
        if (pattern.test(readFileSync(f, "utf8"))) hits.push(rel(f));
      }
      expect(
        hits,
        `${claim} is held pending ${blockedOn}.\nFound in:\n${hits.map((h) => `  ${h}`).join("\n")}`
      ).toEqual([]);
    });
  }

  // The legal drafts carry trailing sections addressed to counsel and to
  // MAANTA, not to a visitor. A public legal page must not contain a table
  // telling the reader which marketing lines to remove.
  it("keeps drafting sections out of the published legal documents", () => {
    const offenders: string[] = [];
    for (const f of MD) {
      const text = readFileSync(f, "utf8");
      for (const marker of [
        "Questions for counsel",
        "Copy alignment required",
        "Build dependencies",
        "Counsel note",
      ]) {
        if (text.includes(marker)) offenders.push(`${rel(f)} — "${marker}"`);
      }
      // Deck paths are a reliable tell that a section is coordination material.
      if (/copy\/[a-z-]+\.md/.test(text)) offenders.push(`${rel(f)} — references a copy deck`);
    }
    expect(
      offenders,
      `Drafting material must be stripped from published legal content:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
