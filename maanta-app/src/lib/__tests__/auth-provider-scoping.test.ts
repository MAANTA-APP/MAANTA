import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Clerk is scoped to the routes that authenticate.
 *
 * The root layout used to wrap the whole app in `ClerkProvider`, so a visitor
 * reading `/shoppers` downloaded and initialised the auth SDK for a page with no
 * login on it — first-load JS of 248–262 kB against 1.3–3.4 kB of page code, and
 * the single largest drag on the marketing Lighthouse scores.
 *
 * Two failure modes, opposite directions, both silent:
 *
 *  - Clerk creeps back into the root layout or onto a marketing route, and the
 *    bundle regresses without anything breaking;
 *  - an authenticated shell loses `AppProviders`, and a Clerk client hook throws
 *    at runtime for a signed-in user — which no build or type check catches.
 *
 * Both are asserted here.
 */

const SRC = path.resolve(__dirname, "..", "..");
const APP = path.join(SRC, "app");

const read = (...p: string[]) => readFileSync(path.join(...p), "utf8");

/**
 * Strip comments before scanning.
 *
 * These assertions check what the code *does*. The root layout and the analytics
 * provider both carry comments explaining why Clerk is not there — naming
 * `AppProviders` and `ClerkPostHogUserSync` in the course of explaining their
 * absence — and a scanner that cannot tell code from commentary fails on exactly
 * the files it is meant to pass, teaching the next author to delete the
 * explanation instead of keeping the guard.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...filesUnder(full));
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);

describe("Clerk provider scoping", () => {
  it("keeps the auth provider out of the root layout", () => {
    const root = codeOnly(read(APP, "layout.tsx"));
    expect(
      /AuthProviders|AppProviders|ClerkProvider/.test(root),
      "src/app/layout.tsx must not mount an auth provider — it would ship Clerk to every marketing page"
    ).toBe(false);
  });

  it("keeps anonymous analytics in the root layout", () => {
    // Scoping Clerk must not become "marketing loses analytics".
    expect(read(APP, "layout.tsx")).toContain("PostHogClientProvider");
  });

  it("keeps the Clerk-dependent identity sync out of the root analytics provider", () => {
    const provider = codeOnly(read(SRC, "components", "posthog-provider.tsx"));
    // Bound the slice to this one function. Running to end-of-file swept in
    // PostHogIdentitySync below it, which legitimately *does* reference Clerk —
    // the assertion would have failed on the very split it exists to enforce.
    const start = provider.indexOf("export function PostHogClientProvider");
    const next = provider.indexOf("export function", start + 1);
    const body = provider.slice(start, next === -1 ? undefined : next);
    expect(
      /ClerkPostHogUserSync|isClerkAuthClient/.test(body),
      "PostHogClientProvider renders on marketing routes, so it must not depend on Clerk"
    ).toBe(false);
  });

  it("mounts AppProviders on every authenticated shell", () => {
    // Each of these either renders a Clerk client component itself or contains a
    // route that does. A missing provider here is a runtime throw, not a build error.
    const shells = [
      ["(shopper)", "layout.tsx"],
      ["merchant", "layout.tsx"],
      ["admin", "layout.tsx"],
      ["agent", "layout.tsx"],
      ["founder", "layout.tsx"],
      ["login", "layout.tsx"],
      ["sign-up", "layout.tsx"],
      ["verify-phone", "layout.tsx"],
      ["app-bootstrap", "layout.tsx"],
      ["onboarding", "layout.tsx"],
      ["otp", "layout.tsx"],
      ["select-mall", "layout.tsx"],
      ["demo", "layout.tsx"],
      ["auth", "layout.tsx"],
    ];
    const missing = shells.filter((s) => !codeOnly(read(APP, ...s)).includes("AppProviders"));
    expect(
      missing.map((s) => s.join("/")),
      "these shells authenticate and must mount <AppProviders>"
    ).toEqual([]);
  });

  // The backstop: whatever the layout list says, no file under (marketing) may
  // import Clerk. If one ever needs to, it needs its own provider — and a
  // deliberate decision about the bundle cost.
  it("never imports Clerk from a marketing route or component", () => {
    const offenders = filesUnder(path.join(APP, "(marketing)"))
      .concat(filesUnder(path.join(SRC, "components", "marketing")))
      .filter((f) => /@clerk\//.test(codeOnly(readFileSync(f, "utf8"))))
      .map(rel);
    expect(
      offenders,
      `Marketing must not import Clerk — it puts the auth SDK back on every page:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
