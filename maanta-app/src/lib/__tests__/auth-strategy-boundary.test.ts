import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * A `"use client"` module may never branch on a server-only auth predicate.
 *
 * ## The bug this exists to prevent
 *
 * `MAANTA_AUTH_STRATEGY` has no `NEXT_PUBLIC_` prefix, so Next.js does not inline
 * it into the browser bundle. Any predicate that reads it — `isClerkAuth()`, and
 * everything built on it — therefore evaluates to `false` in the browser
 * *regardless of how production is configured*. It does not throw, it does not
 * warn, it just quietly answers "not Clerk" forever.
 *
 * `/verify-phone` branched on `phoneOtpEnabled()`. Server-side it rendered the
 * Clerk page; client-side the same expression was false, so React replaced it
 * with the Supabase page, which called `supabase.auth.getSession()` on a client
 * built with the Clerk `accessToken` option — and that throws. Sentry
 * JAVASCRIPT-NEXTJS-4, in production, on the screen between a shopper and
 * claiming a deal. `authModeLoginHint()` had the milder version of the same
 * fault: production shoppers were shown the rehearsal copy.
 *
 * Nothing caught it. Types cannot — both predicates return `boolean`. Lint
 * cannot — the import is legal. SSR cannot — the server evaluation is correct and
 * only the client one is wrong, so the page looks right until it hydrates. The
 * only thing that separates the safe predicates from the unsafe ones is the name,
 * so the name is what this asserts.
 */

const SRC = path.resolve(__dirname, "..", "..");

/**
 * Exports of `@/lib/auth/strategy` that read `MAANTA_AUTH_STRATEGY`.
 *
 * Each has a `*Client` counterpart reading only `NEXT_PUBLIC_*`. Adding a new
 * server-only export means adding it here — the completeness check below fails
 * otherwise, so this list cannot silently fall behind the module.
 */
const SERVER_ONLY = [
  "isClerkAuth",
  "isSupabaseAuth",
  "isAuthJsAuth",
  "authStrategy",
  "phoneOtpEnabled",
  "authModeLoginHint",
] as const;

/** Safe in the browser: reads `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` only. */
const CLIENT_SAFE = [
  "isClerkAuthClient",
  "isSupabaseAuthClient",
  "authStrategyClient",
  "phoneOtpEnabledClient",
  "authModeLoginHintClient",
] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/** Files carrying the "use client" directive, excluding tests. */
const clientModules = files.filter((f) => {
  if (f.includes("__tests__")) return false;
  const head = readFileSync(f, "utf8").slice(0, 400);
  return /^\s*["']use client["']/m.test(head);
});

describe("server-only auth predicates never reach the browser", () => {
  it("found client modules to check, so the sweep is not vacuous", () => {
    expect(clientModules.length).toBeGreaterThan(5);
  });

  it("no \"use client\" module references a server-only strategy predicate", () => {
    const offenders: string[] = [];
    for (const file of clientModules) {
      // Comments out first, via the one shared stripper (D38): the fix for this
      // bug documents the unsafe predicates by name in a docblock, and a raw scan
      // flags that explanation — teaching the next author to delete the reason
      // rather than keep the guard.
      const src = stripComments(readFileSync(file, "utf8"));
      for (const name of SERVER_ONLY) {
        // Word-boundary match that will not fire on the `*Client` counterpart:
        // `phoneOtpEnabled` must not match inside `phoneOtpEnabledClient`.
        const used = new RegExp(`\\b${name}\\b(?!Client)`).test(src);
        if (used) {
          offenders.push(
            `${path.relative(SRC, file)} uses ${name}() — use ${name}Client() instead; ` +
              `${name}() reads MAANTA_AUTH_STRATEGY, which is undefined in the browser`
          );
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every client-safe predicate named here is really exported", () => {
    // Without this, a typo in CLIENT_SAFE would silently weaken the
    // classification check below — an unexported name matches nothing, so a
    // genuinely unclassified export could hide behind it.
    const strategy = readFileSync(path.join(SRC, "lib", "auth", "strategy.ts"), "utf8");
    for (const name of CLIENT_SAFE) {
      expect(
        new RegExp(`export function ${name}\\b`).test(strategy),
        `${name} is listed as client-safe but is not exported from strategy.ts`
      ).toBe(true);
    }
  });

  it("the server-only list still matches what strategy.ts exports", () => {
    // If a new export appears that reads the server-only env var and is not in
    // SERVER_ONLY, the sweep above would skip it. Catch that here.
    const strategy = readFileSync(path.join(SRC, "lib", "auth", "strategy.ts"), "utf8");
    const exported = Array.from(
      strategy.matchAll(/export function (\w+)\s*\(/g),
      (m) => m[1]
    );
    const known = new Set<string>([...SERVER_ONLY, ...CLIENT_SAFE]);
    const unclassified = exported.filter((n) => !known.has(n));
    expect(
      unclassified,
      `strategy.ts exports ${unclassified.join(", ")} — classify each as server-only ` +
        `or client-safe in auth-strategy-boundary.test.ts, or the browser sweep skips it`
    ).toEqual([]);
  });
});
