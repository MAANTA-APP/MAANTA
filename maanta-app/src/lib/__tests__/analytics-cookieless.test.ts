import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripCommentLines } from "./helpers/comment-stripping";

/**
 * The cookieless analytics posture, tied to the claim it makes in public.
 *
 * **This is the guard D88 asked for, aimed one level higher than D88 asked.**
 * The row wanted an assertion tying `analytics-identity.ts`'s documented
 * precondition to the shipped `persistence` value, because those two silently
 * contradicted each other for ten days. That module is gone — the decision
 * (`docs/ops/d88-analytics-attribution-decision.md`, option C) moved
 * `deal_viewed` to the browser instead of restoring the cookie it read.
 *
 * So the thing left worth pinning is not an internal docblock. It is
 * `src/content/legal/cookie-notice.md`, a **live public route** at `/cookies`,
 * which states that MAANTA stores no analytics identifier on an anonymous
 * visitor's device — and which is the stated basis for shipping no consent
 * banner. Changing `persistence` away from `memory` would make a published
 * legal document false without touching it. That is the regression this exists
 * to make impossible to ship quietly.
 *
 * Static source checks. They cannot prove no cookie is written at runtime —
 * only a browser can — but they pin the one line that decides it and the
 * absence of the server-side path that used to read it.
 */

const SRC = path.resolve(__dirname, "..", "..");
const PROVIDER = path.join(SRC, "components", "posthog-provider.tsx");
const COOKIE_NOTICE = path.join(SRC, "content", "legal", "cookie-notice.md");

const codeText = (f: string) => stripCommentLines(readFileSync(f, "utf8")).join("\n");

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...filesUnder(full));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("cookieless analytics (D88)", () => {
  it("posthog-js is configured with memory persistence", () => {
    const src = codeText(PROVIDER);
    expect(
      src,
      "persistence must stay `memory` — /cookies tells the public that nothing " +
        "is stored on an anonymous device, and that is why no consent banner ships"
    ).toMatch(/persistence:\s*"memory"/);
  });

  /**
   * The claim the config above is holding up. Asserted from the rendered legal
   * source so the two cannot drift: if someone softens the notice, this still
   * passes; if someone changes the config, the test above fails. Both halves
   * are needed because the pair is the invariant, not either line alone.
   */
  it("the public cookie notice still makes the claim that config supports", () => {
    const notice = readFileSync(COOKIE_NOTICE, "utf8");
    expect(
      notice,
      "cookie-notice.md must still state that anonymous analytics stores nothing"
    ).toMatch(/in memory only/i);
    expect(notice).toMatch(/None for anonymous visitors/i);
  });

  /**
   * The module D88 was opened about. Its return value was `null` on every
   * production request because posthog-js never wrote the cookie it parsed, so
   * every signed-out `deal_viewed` collapsed onto one person.
   *
   * Asserted as absence rather than deleted-and-forgotten: reintroducing a
   * server-side reader of the posthog cookie is exactly the change that would
   * quietly reverse this decision, and it would look like a bug fix while doing
   * it.
   */
  it("no server module reads a posthog cookie for identity", () => {
    expect(
      existsSync(path.join(SRC, "lib", "analytics-identity.ts")),
      "analytics-identity.ts was removed by the D88 decision; reinstating it " +
        "requires reversing that ruling, not restoring a file"
    ).toBe(false);

    const offenders = filesUnder(path.join(SRC, "lib"))
      .concat(filesUnder(path.join(SRC, "app")))
      .filter((f) => /ph_.*_posthog|posthogCookieName/.test(codeText(f)))
      .map((f) => path.relative(SRC, f));

    expect(
      offenders,
      `A server-side read of the posthog cookie reverses the cookieless ruling ` +
        `of 2026-07-31 and contradicts /cookies:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  /**
   * `deal_viewed` is captured client-side, where the in-memory identity lives.
   * If it moves back to the server it silently loses attribution again, because
   * a server event cannot name an anonymous actor without reading the device.
   */
  it("deal_viewed is captured in the browser", () => {
    const tracker = path.join(
      SRC,
      "app",
      "(shopper)",
      "deals",
      "[id]",
      "deal-viewed-tracker.tsx"
    );
    expect(existsSync(tracker), "the client tracker must exist").toBe(true);

    const src = codeText(tracker);
    expect(src).toContain('"use client"');
    expect(src).toMatch(/posthog\.capture\(\s*"deal_viewed"/);
    // Lets PostHog separate the client era from the pre-2026-08-10 server one,
    // whose absolute counts are higher because they included pre-hydration views.
    expect(src, "events must be distinguishable from the server era").toContain(
      'capture_side: "client"'
    );

    const analytics = codeText(path.join(SRC, "lib", "analytics.ts"));
    expect(
      /captureServerEvent\(\s*"deal_viewed"/.test(analytics),
      "deal_viewed must not be captured server-side again"
    ).toBe(false);
  });
});
