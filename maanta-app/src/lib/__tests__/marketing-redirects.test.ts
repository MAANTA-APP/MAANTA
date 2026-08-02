import { describe, it, expect, beforeAll } from "vitest";

/**
 * The three legacy marketing URLs must keep redirecting, permanently.
 *
 * `/for-shoppers`, `/for-merchants` and `/how-it-works` are printed on flyers,
 * pasted into WhatsApp groups and used on in-mall signage — risk R6 in
 * `website-handoff.md`. They are inbound links nobody can edit after the fact,
 * so the redirect is the only thing keeping them working. Nothing asserted that
 * until now: deleting a row from `redirects()` would have broken every printed
 * link with a green suite and a green build.
 *
 * ## Why this exists at all — drift D39
 *
 * `docs/ops/marketing-site-gap-audit.md` GAP-03 reported `/how-it-works` as a
 * live **rewrite** serving `/shoppers` at a second URL, on the evidence of an
 * HTTP 200 with `x-matched-path: /shoppers` and a body identical to `/shoppers`.
 * That is also, exactly, what a **followed** 308 looks like — and it was:
 * fetching `/for-shoppers` and `/for-merchants`, which are undisputed redirects,
 * produced the identical observation, with `x-matched-path` tracking each one's
 * own destination. The finding was a measurement artifact.
 *
 * So the assertions here are pointed at both halves of that confusion: the
 * redirect must exist and be permanent, **and** the path must not appear in
 * `rewrites()`. The second is the inverse direction, and it is the one that
 * would have settled GAP-03 in a second rather than a day.
 *
 * ## Why it reads the config rather than the build
 *
 * `next.config.mjs` imports cleanly through the Sentry wrapper and `redirects()`
 * is callable, so this tests the values Next will compile rather than source text
 * matched with a regex. It deliberately does **not** read
 * `.next/routes-manifest.json`, where the literal `statusCode: 308` lives: CI
 * runs `npm run test` before `npm run build`, so a test reading `.next/` would
 * fail there, and one that skipped on a missing directory would pass vacuously on
 * every CI run. `permanent: true` → 308 is Next's documented mapping, and the
 * manifest was checked by hand when D39 closed.
 */

type Redirect = { source: string; destination: string; permanent: boolean };
type Rewrite = { source: string; destination: string };

/** source → destination. Changing one of these breaks links we cannot reach. */
const LEGACY_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ["/for-shoppers", "/shoppers"],
  ["/for-merchants", "/merchants"],
  ["/how-it-works", "/shoppers"],
];

let redirects: Redirect[];
let rewrites: Rewrite[];

beforeAll(async () => {
  const mod = await import("../../../next.config.mjs");
  const config = mod.default as {
    redirects: () => Promise<Redirect[]>;
    rewrites: () => Promise<Rewrite[] | Record<string, Rewrite[]>>;
  };
  redirects = await config.redirects();
  const raw = await config.rewrites();
  // Next allows either a flat array or {beforeFiles,afterFiles,fallback}.
  rewrites = Array.isArray(raw) ? raw : Object.values(raw).flat();
});

describe("legacy marketing URLs keep redirecting", () => {
  it("loaded the real config, so the assertions below are not vacuous", () => {
    expect(Array.isArray(redirects), "redirects() did not return an array").toBe(true);
    expect(redirects.length).toBeGreaterThanOrEqual(LEGACY_REDIRECTS.length);
  });

  for (const [source, destination] of LEGACY_REDIRECTS) {
    it(`${source} → ${destination}, permanently`, () => {
      const rule = redirects.find((r) => r.source === source);
      expect(
        rule,
        `${source} has no redirect. It is printed on off-platform assets nobody can edit — ` +
          `removing the rule breaks every one of them silently.`
      ).toBeDefined();
      expect(rule!.destination).toBe(destination);
      // permanent:true is 308, permanent:false is 307. A temporary redirect on a
      // printed URL tells crawlers and caches the old path is coming back.
      expect(
        rule!.permanent,
        `${source} must be permanent: true (308), not ${rule!.permanent} (307)`
      ).toBe(true);
    });
  }
});

describe("none of them is a rewrite", () => {
  // The inverse direction, and the assertion that settles D39/GAP-03. A rewrite
  // would serve the destination's content at the old URL — two live URLs for one
  // page, which is the duplicate-content problem the redirect exists to avoid.
  for (const [source] of LEGACY_REDIRECTS) {
    it(`${source} appears in no rewrite rule`, () => {
      const match = rewrites.find((r) => r.source === source || r.source.startsWith(`${source}/`));
      expect(
        match,
        `${source} is rewritten to ${match?.destination} — it must redirect, not rewrite`
      ).toBeUndefined();
    });
  }

  it("rewrites contain only the PostHog ingest proxy", () => {
    expect(rewrites.length).toBeGreaterThan(0);
    for (const r of rewrites) {
      expect(
        r.source.startsWith("/ingest/"),
        `unexpected rewrite ${r.source} → ${r.destination}. Rewrites serve foreign content at ` +
          `our own paths; every addition here needs to be a deliberate decision, not a drive-by.`
      ).toBe(true);
    }
  });
});
