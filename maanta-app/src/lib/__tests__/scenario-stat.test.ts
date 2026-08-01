import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments as codeOnly } from "./helpers/comment-stripping";

/**
 * Behavioural test for the scenario gate — the one rule on this site that a
 * static scan cannot check.
 *
 * "Modelled figures render only through `<ScenarioStat>` inside
 * `<ScenarioNotice>`" is enforced at runtime by a thrown error, not by a
 * pattern in the source. Whether that throw actually fires used to depend on
 * the env the page was *built* with, and the original implementation got it
 * wrong: the guard was conditioned on `NODE_ENV === "development"`, while the
 * only build that renders modelled figures at all — a preview deployment with
 * `NEXT_PUBLIC_SCENARIO_MODE=true` — runs `NODE_ENV=production`. The guard was
 * off in the one configuration it existed for. Found in review of PR #153.
 *
 * `NODE_ENV` cannot be varied inside a single vitest process: React resolves
 * `react/jsx-dev-runtime` vs `react/jsx-runtime` when the module first loads,
 * so re-importing under a stubbed `NODE_ENV` breaks the renderer rather than
 * the component. The fix for that is not a harness trick — it is that the
 * component must not read `NODE_ENV` at all, which is asserted directly.
 */

const STAT_SRC = path.resolve(__dirname, "..", "..", "components", "marketing", "ScenarioStat.tsx");

async function render(opts: { scenario: boolean; wrapped: boolean }): Promise<string> {
  vi.stubEnv("NEXT_PUBLIC_SCENARIO_MODE", opts.scenario ? "true" : "");
  vi.resetModules();

  const { ScenarioStat } = await import("@/components/marketing/ScenarioStat");
  const { ScenarioNotice } = await import("@/components/marketing/ScenarioNotice");

  const stat = h(ScenarioStat, { value: 121, fallback: "a growing number of shops" });
  return renderToStaticMarkup(opts.wrapped ? h(ScenarioNotice, null, stat) : stat);
}

describe("ScenarioStat", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("does not condition the unlabelled-figure guard on NODE_ENV", () => {
    // The regression, stated as the property that was violated. A build-mode
    // check here means the guard is disabled in preview — the only build where
    // modelled figures exist to be mislabelled.
    expect(
      /NODE_ENV/.test(codeOnly(readFileSync(STAT_SRC, "utf8"))),
      "ScenarioStat must throw on an unwrapped stat in every build that renders " +
        "modelled figures, not only in development. Production is already safe " +
        "because the fallback returns first."
    ).toBe(false);
  });

  it("renders the modelled value with its badge when wrapped in preview", async () => {
    const html = await render({ scenario: true, wrapped: true });
    expect(html).toContain("121");
    expect(html).toContain("Modelled");
    expect(html).toContain("Preview build");
  });

  it("throws for an unwrapped stat while scenario mode is on", async () => {
    await expect(render({ scenario: true, wrapped: false })).rejects.toThrow(
      /without <ScenarioNotice>/
    );
  });

  it("renders the honest fallback when scenario mode is off, wrapped or not", async () => {
    for (const wrapped of [true, false]) {
      const html = await render({ scenario: false, wrapped });
      expect(html).toContain("a growing number of shops");
      expect(html).not.toContain("121");
      expect(html).not.toContain("Modelled");
      expect(html).not.toContain("Preview build");
    }
  });

  it("never throws for a production visitor on a page that forgot the notice", async () => {
    // The guard must be unreachable when the fallback is the right answer —
    // otherwise tightening it would trade a quiet false claim for a 500.
    await expect(render({ scenario: false, wrapped: false })).resolves.toBeTypeOf("string");
  });
});
