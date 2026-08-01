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

/**
 * Line comment start, but not the `//` in `https://…` URLs.
 *
 * Ported from `038e3bc0`, which fixed exactly this in `marketing-shell.test.ts`
 * and `pricing-copy.test.ts` and left this file carrying the bug — three files
 * had the defect, two were patched. Drift **D38**.
 *
 * The old stripper here was `.replace(/\/\/.*$/gm, "")`, which truncates every
 * line from its first `//`. Marketing JSX is full of `https://` links, so any
 * held claim sharing a line with one was deleted before the scan ever saw it —
 * and the guard reported green for the half of the line it had thrown away. That
 * is the failure mode this whole file exists to prevent, reproduced in the file's
 * own machinery.
 */
function lineCommentAt(line: string, start: number): number {
  let pos = start;
  while (pos < line.length) {
    const idx = line.indexOf("//", pos);
    if (idx === -1) return -1;
    if (idx > 0 && line[idx - 1] === ":") {
      pos = idx + 2;
      continue;
    }
    return idx;
  }
  return -1;
}

/** Comments explain why a claim was withheld; they are not published copy. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const idx = lineCommentAt(line, 0);
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const TSX = walk(path.join(SRC, "app", "(marketing)"), [".tsx"]).concat(
  walk(path.join(SRC, "components", "marketing"), [".tsx"])
);
const MD = walk(path.join(SRC, "content", "legal"), [".md"]);

/**
 * Three §9 claims were released on 2026-07-31 once the thing they were waiting on
 * actually existed, and each release is now guarded from the other direction —
 * the claim may be published, but only while its backing clause is present:
 *
 *  - the shop-enforcement claim, released against Terms of Service 6.3;
 *  - the wallet-balance claim, released against Merchant Terms 7.6 — and narrowed
 *    to credit the merchant topped up, since promotional credit is excluded by 7.8;
 *  - response times, released against RESPONSE_TIMES in facts.ts.
 *
 * A claim whose clause is later deleted is a claim with nothing behind it, so the
 * pairing is asserted below rather than left to memory.
 */
const HELD: { pattern: RegExp; claim: string; blockedOn: string }[] = [
  {
    // The *unqualified* form stays held: 7.8 excludes promotional credit, so
    // "anything left" over-promises even now.
    pattern: /anything left in your balance/i,
    claim: '"Anything left in your balance stays yours" (unqualified)',
    blockedOn:
      "Merchant Terms 7.8 excluding promotional credit — say \"credit you topped up yourself\"",
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

  // Released claims must keep their backing clause. Deleting the clause without
  // deleting the claim is how a promise becomes unbacked without anyone noticing.
  it("keeps each released claim paired with the clause that backs it", () => {
    const tos = readFileSync(path.join(SRC, "content", "legal", "terms-of-service.md"), "utf8");
    const merchantTerms = readFileSync(
      path.join(SRC, "content", "legal", "merchant-terms.md"),
      "utf8"
    );
    const shoppers = readFileSync(
      path.join(SRC, "app", "(marketing)", "shoppers", "page.tsx"),
      "utf8"
    );
    const merchants = readFileSync(
      path.join(SRC, "app", "(marketing)", "merchants", "page.tsx"),
      "utf8"
    );

    if (/does not stay on MAANTA/i.test(codeOnly(shoppers))) {
      expect(
        /\*\*6\.3\*\*\s+Where a shop refuses/.test(tos),
        "/shoppers publishes the enforcement claim, so ToS 6.3 must still define the process"
      ).toBe(true);
    }
    if (/refundable on request/i.test(codeOnly(merchants))) {
      expect(
        /\*\*7\.6 Refunds\.\*\*\s+Credit you have topped up/.test(merchantTerms),
        "/merchants publishes the refund claim, so Merchant Terms 7.6 must still grant it"
      ).toBe(true);
    }
  });

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
