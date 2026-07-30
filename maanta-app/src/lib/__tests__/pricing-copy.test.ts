import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SUCCESS_FEE_KES } from "@/lib/pricing";

/**
 * Public commercial-copy invariants (truth audit 2026-07-30).
 *
 * `frozen-ui-rules.test.ts` guards the frozen *design* rules; this file guards
 * the frozen *commercial* rules where they leak into public copy. Both are
 * ratchets: they pass today and fail the moment public pricing copy drifts away
 * from the frozen rules in Notion "Frozen Scope & Rules" / CLAUDE.md.
 *
 * The drift these exist to catch is specific and was live before this audit:
 *
 *  - `/pricing` printed "Free" as Standard's price, while a Standard merchant
 *    pays the success fee on every verified redemption. The frozen rule is
 *    "plan names are Standard and Elite (never 'Free')" and the forbidden-terms
 *    list bans "free plan"; a big "Free" where the price goes is the same claim
 *    with the noun removed.
 *  - `/pricing` promised "first month of Elite free" with no qualification. The
 *    frozen rule is capped and node-scoped — "first 100 BBS Mall merchants get
 *    30-day free Elite trial" — and the success fee is still charged throughout.
 *    Nothing in code or `app_config` enforces the cap, so the copy is the only
 *    thing standing between a bounded promo and an unbounded promise.
 *  - the fee appeared as an independent `30` literal in several places, so a
 *    future fee change could update `app_config` and some pages but not others.
 */

const SRC = path.resolve(__dirname, "..", "..");
const PUBLIC_PAGES = path.join(SRC, "app", "(public)");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...tsxFiles(full));
    } else if (name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);

/** Whole-file text with JSX line breaks collapsed, so copy split across lines
 *  by the formatter still reads as one sentence to the patterns below. */
function copyText(file: string): string {
  return readFileSync(file, "utf8").replace(/\s+/g, " ");
}

const PUBLIC_FILES = tsxFiles(PUBLIC_PAGES);

describe("public pricing copy matches the frozen commercial rules", () => {
  it("has public pages to check", () => {
    // Guards against the scan silently passing because the directory moved.
    expect(PUBLIC_FILES.length).toBeGreaterThan(5);
  });

  // The success fee is frozen and lives in app_config; SUCCESS_FEE_KES is the
  // one literal public copy may render. Any *other* number quoted as the
  // per-redemption fee is drift.
  it("quotes only the canonical success fee as the per-redemption fee", () => {
    const feePatterns = [
      /KES\s*([\d,]+)\s*(?:per|\/)\s*(?:[a-z-]+\s+){0,3}redemption/gi,
      /KES\s*([\d,]+)\s+success fee/gi,
      /pay\s+(?:only\s+)?KES\s*([\d,]+)/gi,
      /KES\s*([\d,]+)\s+only/gi,
    ];
    const bad: string[] = [];
    for (const f of PUBLIC_FILES) {
      const text = copyText(f);
      for (const re of feePatterns) {
        for (const m of Array.from(text.matchAll(re))) {
          const value = Number(m[1].replace(/,/g, ""));
          if (value !== SUCCESS_FEE_KES) {
            bad.push(`  ${rel(f)}  "${m[0]}" → ${value}, expected ${SUCCESS_FEE_KES}`);
          }
        }
      }
    }
    expect(
      bad,
      `Public copy quotes a per-redemption fee that is not SUCCESS_FEE_KES (${SUCCESS_FEE_KES}).\n` +
        `Update app_config.success_fee_kes, SUCCESS_FEE_KES and a decisions-log entry together:\n${bad.join("\n")}`
    ).toEqual([]);
  });

  // Exactly one declaration of the fee, so app_config and the UI cannot drift.
  it("declares the success fee in exactly one place", () => {
    const all = tsxFiles(SRC).concat(
      readdirSync(path.join(SRC, "lib"))
        .filter((n) => n.endsWith(".ts"))
        .map((n) => path.join(SRC, "lib", n))
    );
    const redeclared = all.filter((f) => {
      if (path.basename(f) === "pricing.ts") return false;
      return /const\s+SUCCESS_FEE\w*\s*(?::\s*number\s*)?=\s*\d/.test(readFileSync(f, "utf8"));
    });
    expect(
      redeclared.map(rel),
      "Success fee re-declared as a literal — import SUCCESS_FEE_KES from @/lib/pricing instead"
    ).toEqual([]);
  });

  // "Free" where a price goes is the banned "Free plan" claim with the noun
  // dropped. Standard has no *subscription*; it is not free.
  it("never prints a bare \"Free\" as a plan price", () => {
    const hits: string[] = [];
    for (const f of PUBLIC_FILES) {
      const src = readFileSync(f, "utf8");
      src.split("\n").forEach((line, i) => {
        if (/>\s*Free\s*</.test(line)) hits.push(`  ${rel(f)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      hits,
      `"Free" rendered as a plan price. Standard merchants still pay the ${SUCCESS_FEE_KES} success fee —\n` +
        `use "No monthly fee" (frozen rule: plan names are Standard and Elite, never "Free"):\n${hits.join("\n")}`
    ).toEqual([]);
  });

  // The launch offer is capped and node-scoped, and the fee still applies. Any
  // page that mentions it must carry all three qualifications, because none of
  // them is enforced anywhere in code.
  it("states the Elite trial launch offer with its cap, node and fee caveat", () => {
    const problems: string[] = [];
    for (const f of PUBLIC_FILES) {
      const text = copyText(f);
      const mentionsOffer = /launch offer/i.test(text) || /Elite trial/i.test(text);
      if (!mentionsOffer) continue;
      if (!/\b100\b/.test(text)) {
        problems.push(`  ${rel(f)}  mentions the Elite trial but not the first-100 cap`);
      }
      if (!/BBS/i.test(text)) {
        problems.push(`  ${rel(f)}  mentions the Elite trial but not that it is BBS Mall only`);
      }
      if (!/success fee/i.test(text)) {
        problems.push(
          `  ${rel(f)}  mentions the Elite trial but not that the success fee still applies`
        );
      }
    }
    expect(
      problems,
      `The frozen launch offer is "first 100 BBS Mall merchants get a 30-day Elite trial,\n` +
        `success fee still applies". Nothing in code or app_config enforces the cap, so copy\n` +
        `that drops a qualification promises more than the product delivers:\n${problems.join("\n")}`
    ).toEqual([]);
  });

  // The specific unbounded phrasings this audit removed, so they cannot return.
  it("never promises an unqualified free month of Elite", () => {
    const banned = [
      /first month of Elite free/i,
      /month of Elite free/i,
      /Elite free for a month/i,
      /free Elite month/i,
    ];
    const hits: string[] = [];
    for (const f of PUBLIC_FILES) {
      const text = copyText(f);
      for (const re of banned) {
        if (re.test(text)) hits.push(`  ${rel(f)}  matches ${re}`);
      }
    }
    expect(
      hits,
      `Unbounded free-month promise. The offer is capped at the first 100 BBS Mall\n` +
        `merchants and is granted per-approval by an admin:\n${hits.join("\n")}`
    ).toEqual([]);
  });
});
