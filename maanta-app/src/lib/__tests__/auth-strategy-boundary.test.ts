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
    // .js/.jsx/.mjs too: a JavaScript client module is just as browser-bound as
    // a TypeScript one, and the sweep must not depend on the file extension.
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/** Files carrying the "use client" directive, excluding tests. */
const clientEntries = files.filter((f) => {
  if (f.includes("__tests__")) return false;
  const head = readFileSync(f, "utf8").slice(0, 400);
  return /^\s*["']use client["']/m.test(head);
});

/**
 * Everything the browser can reach, not just the files that say so.
 *
 * `"use client"` marks a boundary, not a file: every module a client module
 * imports is bundled for the browser too, with or without its own directive. A
 * helper without the directive that calls `phoneOtpEnabled()` ships the same
 * broken predicate to the browser as the page that imports it — so the sweep has
 * to follow imports, or it only guards the entry files.
 *
 * Resolution is deliberately simple: `@/` → src, relative specifiers, and the
 * extension/index probing Next itself does. `import type` lines are skipped —
 * types never bundle. External packages are out of scope. Anything the resolver
 * cannot place is ignored rather than guessed, which under-scans; the
 * classification test below keeps the predicate list honest, and the entry-level
 * scan already catches the direct case regardless.
 */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // external package
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

function importsOf(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  const out: string[] = [];
  // Array.from, not for...of over the iterator — tsconfig's target predates
  // downlevelIteration, same as the drift-register test's matchAll calls.
  const importMatches = Array.from(
    src.matchAll(
      /import\s+(type\s+)?[^'"]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']|export\s+(type\s+)?[^'"]*?from\s+["']([^"']+)["']/g
    )
  );
  for (const m of importMatches) {
    const isTypeOnly = Boolean(m[1] ?? m[4]);
    if (isTypeOnly) continue;
    const spec = m[2] ?? m[3] ?? m[5];
    if (!spec) continue;
    const resolved = resolveImport(file, spec);
    if (resolved) out.push(resolved);
  }
  return out;
}

/** BFS over the import graph from every client entry. */
const clientModules: string[] = (() => {
  const seen = new Set<string>(clientEntries);
  const queue = [...clientEntries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const dep of importsOf(file)) {
      if (dep.includes("__tests__")) continue;
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return Array.from(seen);
})();

const SERVER_MODULE = path.join(SRC, "lib", "auth", "strategy.ts");
const CLIENT_MODULE = path.join(SRC, "lib", "auth", "strategy-client.ts");

describe("server-only auth predicates never reach the browser", () => {
  it("found client modules to check, so the sweep is not vacuous", () => {
    expect(clientEntries.length).toBeGreaterThan(5);
    // The graph must be bigger than its entries, or the transitive walk is
    // silently resolving nothing and this suite degrades to the entry-only scan.
    expect(clientModules.length).toBeGreaterThan(clientEntries.length);
  });

  it("lib/auth/strategy.ts is unreachable from every client entry", () => {
    // The structural boundary, and the strongest assertion here: if the server
    // module never enters a client bundle, no code path in that bundle can call
    // a server-only predicate — including through helpers, re-exports, or files
    // the name-based sweep below might mis-lex. The import direction is
    // one-way by design: strategy.ts imports strategy-client.ts, never the
    // reverse.
    expect(
      clientModules.includes(SERVER_MODULE),
      "lib/auth/strategy.ts is imported (possibly transitively) by a \"use client\" module — " +
        "client code must import @/lib/auth/strategy-client instead"
    ).toBe(false);
    // And the client-safe module must not quietly grow a dependency on it.
    expect(
      importsOf(CLIENT_MODULE).includes(SERVER_MODULE),
      "strategy-client.ts imports strategy.ts — the dependency must point the other way"
    ).toBe(false);
  });

  it("no browser-reachable module references a server-only strategy predicate", () => {
    // Belt to the structural braces above: catches a server-only predicate
    // re-implemented or re-declared outside strategy.ts.
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
    const clientSrc = readFileSync(CLIENT_MODULE, "utf8");
    for (const name of CLIENT_SAFE) {
      expect(
        new RegExp(`export function ${name}\\b`).test(clientSrc),
        `${name} is listed as client-safe but is not exported from strategy-client.ts`
      ).toBe(true);
    }
  });

  it("the classification still matches what both modules export", () => {
    // If a new function appears in either module and is not classified, the
    // sweep above would skip it. Catch that here. Re-export lines
    // (`export { ... } from`) are not `export function` and so do not count —
    // only declarations matter.
    const declared = (file: string) =>
      Array.from(
        readFileSync(file, "utf8").matchAll(/export function (\w+)\s*\(/g),
        (m) => m[1]
      );
    const known = new Set<string>([
      ...SERVER_ONLY,
      ...CLIENT_SAFE,
      // Client-module internals that are neither predicate kind: pure helpers
      // over explicit inputs, no env reads.
      "readStrategy",
      "loginHintFor",
    ]);
    const unclassified = [...declared(SERVER_MODULE), ...declared(CLIENT_MODULE)].filter(
      (n) => !known.has(n)
    );
    expect(
      unclassified,
      `unclassified strategy exports: ${unclassified.join(", ")} — classify each as ` +
        `server-only or client-safe in auth-strategy-boundary.test.ts, or the sweep skips it`
    ).toEqual([]);
  });
});
