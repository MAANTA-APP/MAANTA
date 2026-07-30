import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./load";

/**
 * Maps the app-router tree to the URL paths it actually serves, so the contract
 * test can assert that every frame `route` resolves to a real page.
 *
 * This is the check that catches a stale route name in the mirror — the failure
 * mode where a frame keeps pointing at `/tickets` for a year after the route was
 * renamed to `/my-deals`, and every reviewer trusts it.
 */

const APP_DIR = path.join(APP_ROOT, "src", "app");

/** A `[id]` / `[...slug]` / `[[...sign-in]]` segment — matched positionally. */
const DYNAMIC = /^\[.*\]$/;

/** Route groups `(shopper)` and parallel slots `@modal` do not appear in URLs. */
function isUrlInvisible(segment: string): boolean {
  return /^\(.*\)$/.test(segment) || segment.startsWith("@");
}

/** Every URL path served by a `page.tsx` under `src/app`, e.g. `/deals/[id]`. */
export function appRoutes(dir = APP_DIR, prefix: string[] = []): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "api") continue;
      out.push(...appRoutes(full, isUrlInvisible(name) ? prefix : [...prefix, name]));
    } else if (name === "page.tsx" || name === "page.jsx") {
      out.push(`/${prefix.join("/")}`.replace(/\/+$/, "") || "/");
    }
  }
  return out;
}

/** Compare two route paths, treating any dynamic segment as equivalent. */
function routesMatch(a: string, b: string): boolean {
  const as = a.split("/").filter(Boolean);
  const bs = b.split("/").filter(Boolean);
  if (as.length !== bs.length) return false;
  return as.every((seg, i) => {
    const other = bs[i];
    if (DYNAMIC.test(seg) && DYNAMIC.test(other)) return true;
    return seg === other;
  });
}

/**
 * Resolve a contract route to the app route that serves it, or null.
 * Dynamic segment *names* are free to differ (`[id]` vs `[dealId]`); their
 * positions are not.
 */
export function resolveContractRoute(route: string, routes = appRoutes()): string | null {
  return routes.find((r) => routesMatch(route, r)) ?? null;
}
