import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { stripCommentLines } from "./helpers/comment-stripping";
import { NON_INDEXABLE_PREFIXES, SITEMAP_ROUTES, HEADER_CTA, FOOTER_COLUMNS } from "../marketing/nav";

/**
 * The demo-mode boundary — founder ruling on **D14**, 2026-08-10.
 *
 * The ruling: the primary signed-out shopper CTA must lead to the **real**
 * public discovery route, and demo mode may remain only as an explicitly
 * labelled internal/sales/QA surface excluded from the public conversion path.
 *
 * **What this suite can and cannot prove.** It proves the *code* half: that no
 * public marketing CTA routes to a demo surface, that `/demo` is neither
 * crawlable nor indexable, and that synthetic rows are opt-in at every call
 * site. It cannot prove the *live* half — whether `app_config.demo_mode_enabled`
 * is `false` on production — because that is a row in a database, not a fact
 * about this repository. That is why D14 stays open on a production read-back
 * rather than on this file going green. Recording the distinction here so the
 * next reader does not mistake a green suite for a launched product.
 */

const SRC = path.resolve(__dirname, "..", "..");
const MARKETING = path.join(SRC, "app", "(marketing)");

function tsxUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...tsxUnder(full));
    } else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);
const codeText = (f: string) => stripCommentLines(readFileSync(f, "utf8")).join("\n");

/** The canonical public shopper-discovery route the CTAs must resolve to. */
const CANONICAL_DISCOVERY = "/feed";

describe("D14 — public shopper CTAs lead to real discovery", () => {
  it("the header CTA points at the canonical discovery route", () => {
    expect(HEADER_CTA.href).toBe(CANONICAL_DISCOVERY);
  });

  // The footer "Browse deals" entry is the other persistent shopper door.
  it("the footer shopper link points at the canonical discovery route", () => {
    const links = FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href));
    expect(links).toContain(CANONICAL_DISCOVERY);
  });

  /**
   * No marketing surface may link into a demo surface.
   *
   * Written as a scan over every marketing file rather than a list of the CTAs
   * known today, because the failure this guards against is a *new* CTA added
   * later pointing somewhere convenient for a demo.
   */
  it("no marketing page or component links to a demo surface", () => {
    const files = [...tsxUnder(MARKETING), ...tsxUnder(path.join(SRC, "components", "marketing"))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = codeText(f);
      // href="/demo", href="/demo/…", or a query flag turning demo data on.
      if (/href=\{?["'`]\/demo(?:["'`/?]|$)/m.test(src)) offenders.push(`${rel(f)} — links to /demo`);
      if (/[?&]demo=(?:true|1)/.test(src)) offenders.push(`${rel(f)} — links with a demo query flag`);
    }
    expect(
      offenders,
      `The public conversion path must not reach demo mode (D14 ruling):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("D14 — the demo surface stays internal", () => {
  const demoPage = path.join(SRC, "app", "demo", "page.tsx");

  it("/demo is disallowed from crawling", () => {
    expect(NON_INDEXABLE_PREFIXES as readonly string[]).toContain("/demo");
  });

  /**
   * Disallow is not enough on its own. `robots.ts` documents why for the legal
   * routes: a disallowed URL linked from anywhere can still be indexed as a bare
   * URL, because the crawler never read the page that says `noindex`.
   */
  it("/demo is also noindex, so a disallowed-but-linked URL cannot be listed", () => {
    const src = readFileSync(demoPage, "utf8");
    expect(src, "/demo needs robots metadata, not only a robots.txt disallow").toMatch(
      /robots:\s*\{\s*index:\s*false/
    );
  });

  it("/demo is absent from the sitemap", () => {
    expect(SITEMAP_ROUTES.map((r) => r.path)).not.toContain("/demo");
  });

  it("/demo identifies itself as a rehearsal surface in visible copy", () => {
    const src = readFileSync(demoPage, "utf8");
    expect(src).toMatch(/Demo &amp; rehearsal logins|Demo & rehearsal logins/);
  });
});

describe("D14 — synthetic rows stay opt-in", () => {
  /**
   * `withPublicMerchant` excludes `is_demo` rows unless a caller passes
   * `includeDemo`. That default is the actual safety property: it means a new
   * shopper surface added tomorrow shows real data unless its author opts in,
   * rather than showing synthetic data unless its author opts out.
   */
  it("public visibility helpers exclude demo rows by default", () => {
    const data = codeText(path.join(SRC, "lib", "data.ts"));
    expect(data, "the default branch must filter is_demo").toMatch(
      /opts\.includeDemo[\s\S]{0,120}\.eq\("is_demo",\s*false\)/
    );
  });

  /**
   * The flag is read from the database, never from an env var, and anything
   * other than the exact string "true" resolves to OFF. Both halves matter:
   * an env var could drift from the database the synthetic rows sit in, and a
   * fail-open default would show synthetic data at launch.
   */
  it("demo mode fails closed and reads the database, not the environment", () => {
    const mode = codeText(path.join(SRC, "lib", "demo-mode.ts"));
    expect(mode).toContain("demo_mode_enabled");
    expect(mode, "must not be env-driven").not.toMatch(/process\.env\.\w*DEMO/);
    expect(mode, 'anything but "true" must resolve to off').toMatch(
      /===\s*"true"/
    );
  });

  /**
   * The discovery route filters paused, expired and inactive deals in the same
   * query that filters demo rows. Asserted here because the D14 ruling sends
   * real shoppers down this path — a CTA that lands on a deal the backend will
   * refuse to claim is the failure `claim_deal`'s pause gate exists to prevent
   * (D25, `docs/skills/paused-deal-semantics.md`).
   */
  it("discovery excludes paused, expired and inactive deals", () => {
    const data = codeText(path.join(SRC, "lib", "data.ts"));
    expect(data).toContain('.eq("is_paused", false)');
    expect(data).toContain('.eq("is_active", true)');
    expect(data).toContain('.gt("expires_at", nowIso)');
  });
});
