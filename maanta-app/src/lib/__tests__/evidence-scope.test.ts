import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { GENUINE_JOIN_SELECT, genuineTagged, atMerchantNode } from "../evidence-scope";

/**
 * D188 has exactly one definition, and this file keeps it that way.
 *
 * The rule — a redemption counts as genuine-tagged only when it, its merchant
 * AND its deal are non-demo — was inlined at three call sites in `/admin`
 * before PR 5 needed it at a dozen more. Every hand-rolled copy is a place the
 * rule can drift, and drift here silently *inflates* field evidence, which is
 * the exact failure D188 was opened for.
 */

/** Chainable stub that records the filters applied to it. */
function fakeQuery() {
  const calls: [string, unknown][] = [];
  const q = {
    calls,
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return q;
    },
  };
  return q;
}

describe("the D188 predicate", () => {
  it("filters the redemption AND both parents", () => {
    const q = fakeQuery();
    genuineTagged(q);
    expect(q.calls).toEqual([
      ["is_demo", false],
      ["merchants.is_demo", false],
      ["deals.is_demo", false],
    ]);
  });

  it("never relies on redemptions.is_demo alone", () => {
    // The measured defect: claim_deal never sets the column, so every claim
    // made through the product is tagged non-demo — including claims against
    // synthetic shops. One filter would have counted 6 where the answer was 1.
    const q = fakeQuery();
    genuineTagged(q);
    expect(q.calls.length).toBeGreaterThan(1);
    expect(q.calls.map(([c]) => c)).toContain("merchants.is_demo");
    expect(q.calls.map(([c]) => c)).toContain("deals.is_demo");
  });

  it("returns the query so windows and scopes compose after it", () => {
    const q = fakeQuery();
    expect(genuineTagged(q)).toBe(q);
    expect(atMerchantNode(q, "BBS Mall")).toBe(q);
  });

  it("scopes a node through the merchant, the only parent that carries one", () => {
    const q = fakeQuery();
    atMerchantNode(q, "BBS Mall");
    expect(q.calls).toEqual([["merchants.node", "BBS Mall"]]);
  });

  it("uses inner joins, so the parent filters cannot fail open", () => {
    // With a LEFT join PostgREST stops excluding rows whose parent fails the
    // filter, and the census silently counts demo activity as genuine.
    expect(GENUINE_JOIN_SELECT).toContain("merchants!inner");
    expect(GENUINE_JOIN_SELECT).toContain("deals!inner");
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no second definition of the rule", () => {
  it("has no hand-rolled parent-demo filter outside evidence-scope.ts", () => {
    const root = join(process.cwd(), "src");
    const offenders = sourceFiles(root)
      .filter((f) => !f.endsWith(join("lib", "evidence-scope.ts")))
      .filter((f) => {
        const code = stripComments(readFileSync(f, "utf8"));
        // `deals.is_demo` as a JOINED-parent filter appears only in the D188
        // redemption rule, so it is the precise signature of a hand-rolled
        // copy. `merchants.is_demo` alone is deliberately NOT flagged: the
        // separate deals-visibility rule (a deal is synthetic if it or its
        // merchant is) legitimately uses it and already has its own single
        // source in lib/data.ts — withPublicVisibility().
        return /\.eq\(\s*["']deals\.is_demo["']/.test(code);
      });

    expect(
      offenders.map((f) => f.replace(process.cwd() + "/", "")),
      "use genuineTagged() from lib/evidence-scope.ts instead of re-writing the D188 filters"
    ).toEqual([]);
  });

  it("has no second copy of the join select string", () => {
    const root = join(process.cwd(), "src");
    const offenders = sourceFiles(root)
      .filter((f) => !f.endsWith(join("lib", "evidence-scope.ts")))
      .filter((f) =>
        /merchants!inner\([^)]*is_demo[^)]*\)\s*,\s*deals!inner/.test(
          stripComments(readFileSync(f, "utf8"))
        )
      );

    expect(
      offenders.map((f) => f.replace(process.cwd() + "/", "")),
      "import GENUINE_JOIN_SELECT rather than repeating the join string"
    ).toEqual([]);
  });
});
