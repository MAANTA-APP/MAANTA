import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { stripCommentLines } from "./helpers/comment-stripping";

/**
 * Static guards for the marketing shell.
 *
 * These exist because the failures they catch are all silent: a banner that
 * contradicts the page it sits on, a price typed instead of imported, a footer
 * link to a page that does not exist. None of them break a build or throw at
 * runtime — they just quietly make the site wrong, which is exactly the class of
 * drift `docs/maanta-drift-register.md` was created to stop being rediscovered.
 *
 * Guard for drift rows D33 (demo banner on marketing shell) and D34 (boost
 * availability claim vs the Elite-only gate).
 */

const SRC = path.resolve(__dirname, "..", "..");
const MARKETING_APP = path.join(SRC, "app", "(marketing)");
const MARKETING_COMPONENTS = path.join(SRC, "components", "marketing");

function filesUnder(dir: string, ext = ".tsx"): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...filesUnder(full, ext));
    } else if (name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);

/**
 * Strip comments before scanning.
 *
 * These guards check what the page *says*, and a comment says nothing to a
 * visitor. Without this, documenting why a banned phrase was removed reintroduces
 * the failure — the first run of this suite flagged three of its own explanatory
 * comments, which would have taught the next author to delete the explanation
 * rather than keep the guard.
 *
 * Block comments are blanked line-by-line rather than collapsed, so reported line
 * numbers still point at the right source line.
 *
 * Shared with `pricing-copy.test.ts` and `held-claims.test.ts` — three private
 * copies of this is how drift D38 happened. See the helper's docblock.
 */
const codeOnly = stripCommentLines;

const codeText = (f: string) => codeOnly(readFileSync(f, "utf8")).join("\n");

describe("marketing shell", () => {
  // D33. The banner says the deals are not real. On a page arguing the product
  // works, that is not a disclosure — it is a contradiction. It belongs on app
  // routes, where synthetic rows actually render.
  it("never mounts the demo-data banner on a marketing route", () => {
    const hits = filesUnder(MARKETING_APP)
      .concat(filesUnder(MARKETING_COMPONENTS))
      .filter((f) => /DemoModeBanner|demo-mode-banner/.test(codeText(f)))
      .map(rel);

    expect(
      hits,
      `The demo-data banner must not appear on marketing routes (risk R1, drift D33).\n` +
        `Found in:\n${hits.map((h) => `  ${h}`).join("\n")}\n` +
        `It stays mounted on (shopper)/layout.tsx and merchant/(app)/layout.tsx only.`
    ).toEqual([]);
  });

  // The banner must not be silently deleted either — scoping it means moving it
  // off marketing, not removing the disclosure from the surfaces that need it.
  it("keeps the demo-data banner mounted on both app shells", () => {
    for (const layout of [
      path.join(SRC, "app", "(shopper)", "layout.tsx"),
      path.join(SRC, "app", "merchant", "(app)", "layout.tsx"),
    ]) {
      expect(
        readFileSync(layout, "utf8"),
        `${rel(layout)} must still mount <DemoModeBanner /> — synthetic deal rows render here.`
      ).toContain("DemoModeBanner");
    }
  });

  // Hard rule: every number renders from facts.ts. A price typed into JSX is how
  // /merchants and /pricing came to disagree in the first place.
  //
  // The success fee joined this list on 2026-08-01. It was inlined into
  // `merchants/opengraph-image.tsx` — a file this guard already reached, since OG
  // routes live under MARKETING_APP, but which its pattern did not name. Widening
  // it found three more: both `/merchants` metadata descriptions and the waitlist
  // blurb. Metadata and OG images are rendered output too, and the OG image is
  // arguably the most quoted surface on the site.
  it("does not inline the success fee, boost or Elite price into marketing JSX", () => {
    const offenders: string[] = [];
    for (const f of filesUnder(MARKETING_APP).concat(filesUnder(MARKETING_COMPONENTS))) {
      codeOnly(readFileSync(f, "utf8")).forEach((line, i) => {
        // A currency-shaped literal in copy, rather than a FACTS/formatKes read.
        if (/KES\s*(30|500|3,?500)\b/.test(line)) {
          offenders.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Prices must render from lib/marketing/facts.ts, never inline (drift D34):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  // D34. Boosts raise BOOST_ELITE_ONLY for non-Elite merchants
  // (migration 20260715194145). Public copy promising unqualified boost access
  // sells a feature the default plan cannot use.
  it("never claims boosts are available on any deal without the Elite qualifier", () => {
    const offenders: string[] = [];
    for (const f of filesUnder(MARKETING_APP).concat(filesUnder(MARKETING_COMPONENTS))) {
      codeOnly(readFileSync(f, "utf8")).forEach((line, i) => {
        if (/Boost any deal/i.test(line)) {
          offenders.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `"Boost any deal" overstates availability — boosts are Elite-only (drift D34):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  // D36: both support surfaces linked to wa.me/254700000000, a placeholder that
  // reached nobody. The number is declared once, in lib/marketing/demo.ts, so the
  // footer, the contact page and both app support surfaces cannot disagree.
  it("never hardcodes a WhatsApp number outside the constants module", () => {
    const offenders: string[] = [];
    const roots = [
      path.join(SRC, "app"),
      path.join(SRC, "components"),
    ];
    const scan = (dir: string): string[] => {
      if (!existsSync(dir)) return [];
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          out.push(...scan(full));
        } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
          out.push(full);
        }
      }
      return out;
    };
    for (const f of roots.flatMap(scan)) {
      codeOnly(readFileSync(f, "utf8")).forEach((line, i) => {
        if (/wa\.me\/\d/.test(line)) offenders.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `Use ENTITY.whatsappLink — a hardcoded number goes stale silently (drift D36):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  // D35. The three audience pages each describe the in-mall team. They must all
  // read it from NODE_TEAM, or they drift into describing different models — which
  // is exactly what the vague "our team" phrasing allowed. The cap in particular is
  // a frozen decision (decisions log 2026-07-31), not an estimate to restate.
  it("describes the node staffing model from one source", () => {
    const pages = [
      path.join(MARKETING_APP, "mall-operators", "page.tsx"),
      path.join(MARKETING_APP, "merchants", "page.tsx"),
      path.join(MARKETING_APP, "about", "page.tsx"),
    ];
    const problems: string[] = [];
    for (const f of pages) {
      const code = codeText(f);
      // A page that does not describe the staffing model at all is fine — and
      // `/about` stopped describing it on 2026-09-05, when the founder
      // biography and the staffing paragraph were removed. The rule is that a
      // page describing it must single-source it, not that every page must
      // describe it.
      const describesTeam = /node manager|\bagents\b/i.test(code);
      if (describesTeam && !/NODE_TEAM/.test(code)) {
        problems.push(`${rel(f)} describes the team without reading NODE_TEAM`);
      }
      // A typed agent cap is the drift this guards: "up to four agents" written
      // as prose survives a change to the frozen cap silently.
      if (/up to (four|4|five|5|three|3) agents/i.test(code)) {
        problems.push(`${rel(f)} hardcodes the agent cap — render NODE_TEAM.agentsMax`);
      }
    }
    expect(
      problems,
      `The node staffing model is frozen and single-sourced (drift D35):\n${problems.join("\n")}`
    ).toEqual([]);
  });

  // Risk R8 / footer link hygiene: a five-column footer pointing at "#" is worse
  // than the thin footer it replaced, because the visual promise is higher.
  it("has no placeholder links in the nav module", () => {
    const nav = codeText(path.join(SRC, "lib", "marketing", "nav.ts"));
    expect(/href:\s*["']#/.test(nav), 'nav.ts must not contain a "#" href').toBe(false);
    expect(/coming soon/i.test(nav), 'nav.ts must not contain a "coming soon" entry').toBe(false);
  });
});
