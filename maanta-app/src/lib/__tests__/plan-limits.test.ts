import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_DEAL_LIMITS,
  activeDealLimit,
  activeDealLimitCopy,
  normaliseTier,
  planLabel,
} from "../plan-limits";
import { stripComments } from "./helpers/comment-stripping";

/**
 * The locked cap, guarded on the application side.
 *
 * Enforcement itself lives in the database — `enforce_deal_limit()`, asserted
 * by supabase/tests/deal_limit_cap_test.sql. These cases guard the OTHER
 * failure mode: merchant surfaces stating the rule for themselves and drifting
 * away from it (five independent copies existed before this file).
 */

describe("the locked active-deal limits", () => {
  it("is Standard = 1 and Elite = 2", () => {
    expect(ACTIVE_DEAL_LIMITS.standard).toBe(1);
    expect(ACTIVE_DEAL_LIMITS.elite).toBe(2);
    expect(Object.keys(ACTIVE_DEAL_LIMITS).sort()).toEqual(["elite", "standard"]);
  });

  it("resolves a tier to its limit", () => {
    expect(activeDealLimit("standard")).toBe(1);
    expect(activeDealLimit("elite")).toBe(2);
  });

  it("treats an unknown, null or empty tier as Standard — never as extra capacity", () => {
    for (const weird of [null, undefined, "", "ELITE", "Elite", "premium", "cofounder"]) {
      expect(normaliseTier(weird)).toBe("standard");
      expect(activeDealLimit(weird)).toBe(1);
    }
  });

  it("renders the founder-approved sentence for each plan", () => {
    expect(activeDealLimitCopy("standard")).toBe("Standard includes 1 active deal.");
    expect(activeDealLimitCopy("elite")).toBe("Elite includes up to 2 active deals.");
  });

  it("never puts a price or an upgrade promise in the limit copy", () => {
    for (const tier of ["standard", "elite"]) {
      const copy = activeDealLimitCopy(tier);
      expect(copy).not.toMatch(/KES|\bksh\b|\$|month|price|pricing/i);
      expect(copy).not.toMatch(/upgrade|unlock/i);
    }
  });

  it("labels plans as merchants see them written", () => {
    expect(planLabel("standard")).toBe("Standard");
    expect(planLabel("elite")).toBe("Elite");
  });
});

/**
 * The duplication ratchet.
 *
 * Scope is deliberately narrow (founder ruling, §9): merchant application
 * surfaces only. SQL migrations, SQL tests, docs and this suite's own
 * fixtures legitimately carry the numerals and are never scanned — the
 * migration is the authority and must state 1 and 2 literally.
 */
const MERCHANT_APP_DIRS = ["src/app/merchant", "src/components/merchant"];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(full)) return [];
    if (full.includes("__tests__")) return [];
    return [full];
  });
}

describe("merchant surfaces do not restate the cap for themselves", () => {
  const files = MERCHANT_APP_DIRS.flatMap((d) => sourceFiles(join(process.cwd(), d)));

  it("finds merchant surfaces to scan", () => {
    // A guard that silently scans nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no tier-conditional that hardcodes the two limits", () => {
    // Catches `tier === "elite" ? 2 : 1` and its spacing/quote variants —
    // the exact shape that existed in the dashboard and the deals list.
    const conditional = /\?\s*2\s*:\s*1\b/;
    const offenders = files.filter((f) => conditional.test(stripComments(readFileSync(f, "utf8"))));
    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, "")),
      "a merchant surface hardcodes the plan limits — import from @/lib/plan-limits instead"
    ).toEqual([]);
  });

  it("has no bare numeral stated as an active-deal allowance", () => {
    // "1 active deal", "2 active deals at a time", "up to 2 active deals".
    const bareAllowance = /\b\d+\s+active\s+deal/i;
    const offenders = files.filter((f) =>
      bareAllowance.test(stripComments(readFileSync(f, "utf8")))
    );
    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, "")),
      "a merchant surface writes the limit as a literal — use ACTIVE_DEAL_LIMITS / activeDealLimitCopy"
    ).toEqual([]);
  });

  it("keeps the limit copy sourced from the helper where it is displayed", () => {
    // The deals list is where a merchant reads their allowance; if it stops
    // importing the helper the numbers have gone somewhere private again.
    const dealsList = readFileSync(
      join(process.cwd(), "src/app/merchant/(app)/deals/page.tsx"),
      "utf8"
    );
    expect(dealsList).toContain("@/lib/plan-limits");
    expect(dealsList).toContain("activeDealLimitCopy");
  });
});

/**
 * The application must not become the authority. The cap is enforced by the
 * database trigger; the app attempts the write and translates the refusal.
 */
describe("the application defers to the database", () => {
  it("does not pre-check the cap in the deal write paths", () => {
    for (const route of ["src/app/api/deals/route.ts", "src/app/api/deals/repost/route.ts"]) {
      const src = stripComments(readFileSync(join(process.cwd(), route), "utf8"));
      expect(src, `${route} must not gate writes on the UI-side limit helper`).not.toMatch(
        /activeDealLimit|ACTIVE_DEAL_LIMITS/
      );
      // It must still translate the trigger's refusal.
      expect(src).toContain("Deal limit reached");
    }
  });
});
