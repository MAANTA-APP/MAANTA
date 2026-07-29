import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { contractSchema, isSmokeFrame, type Contract, type Frame, type SmokeFrame } from "./schema";

/**
 * Loads and validates `design/current-reality/frames.json` once.
 *
 * Node-only (fs) — this is the static contract layer, consumed by the Layer 1
 * vitest suite and by the Layer 2 Playwright generator. Nothing in the app
 * runtime imports it.
 */

/** `maanta-app/` — two levels up from src/lib/design-truth. */
export const APP_ROOT = path.resolve(__dirname, "../../..");
export const CONTRACT_PATH = path.join(
  APP_ROOT,
  "design/current-reality/frames.json"
);
const APP_DIR = path.join(APP_ROOT, "src/app");

let cached: Contract | null = null;

/** Parse the contract, throwing with the offending frame id in the message. */
export function loadContract(): Contract {
  if (cached) return cached;

  if (!existsSync(CONTRACT_PATH)) {
    throw new Error(
      `design-truth: contract missing at ${CONTRACT_PATH}. The current-reality mirror must be committed before the contract can be validated (drift D-08).`
    );
  }

  const raw = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) {
    // Report the FIRST failure with its frame id, so a broken mirror names
    // itself rather than dumping the whole tree.
    const issue = parsed.error.issues[0];
    const frameIndex = issue.path[0] === "frames" ? Number(issue.path[1]) : null;
    const frameId =
      frameIndex !== null && Array.isArray(raw.frames)
        ? (raw.frames[frameIndex]?.id ?? `frames[${frameIndex}]`)
        : null;
    const where = frameId ? `frame ${frameId}` : issue.path.join(".") || "contract root";
    throw new Error(
      `design-truth: ${where} failed validation — ${issue.message}` +
        (parsed.error.issues.length > 1
          ? ` (+${parsed.error.issues.length - 1} more issue(s))`
          : "")
    );
  }

  cached = parsed.data;
  return cached;
}

export function loadFrames(): Frame[] {
  return loadContract().frames;
}

/** Frames that opted into behavioural smoke coverage. */
export function loadSmokeFrames(): SmokeFrame[] {
  return loadFrames().filter(isSmokeFrame);
}

/**
 * Route groups in this app. `/feed` lives at `src/app/(shopper)/feed`, and
 * `/merchant/redeem` at `src/app/merchant/(app)/redeem` — a product path never
 * shows the group, so resolution has to try inserting one at each depth.
 */
const ROUTE_GROUPS = ["(public)", "(shopper)", "(app)"];

/**
 * Resolve a contract route to the directory holding its `page.tsx`, or null.
 * A `[id]` segment matches any dynamic segment on disk (`[id]`, `[slug]`,
 * `[[...sign-in]]`), because the contract names the shape, not the param.
 */
export function resolveRouteDir(route: string): string | null {
  const segments = route.split("/").filter(Boolean);

  const candidates: string[][] = [segments];
  for (const group of ROUTE_GROUPS) {
    for (let i = 0; i <= segments.length; i++) {
      candidates.push([...segments.slice(0, i), group, ...segments.slice(i)]);
    }
  }

  for (const parts of candidates) {
    const dir = walk(APP_DIR, parts);
    if (dir && existsSync(path.join(dir, "page.tsx"))) return dir;
  }
  return null;
}

/** Descend `parts` from `base`, letting `[id]` match any dynamic directory. */
function walk(base: string, parts: string[]): string | null {
  let dir = base;
  for (const part of parts) {
    const direct = path.join(dir, part);
    if (existsSync(direct) && statSync(direct).isDirectory()) {
      dir = direct;
      continue;
    }
    if (part.startsWith("[")) {
      const dynamic = readdirSync(dir).find(
        (entry) =>
          entry.startsWith("[") &&
          statSync(path.join(dir, entry)).isDirectory()
      );
      if (dynamic) {
        dir = path.join(dir, dynamic);
        continue;
      }
    }
    return null;
  }
  return dir;
}

export function routeExists(route: string): boolean {
  return resolveRouteDir(route) !== null;
}

/** Absolute path for a contract `sourceFiles` entry (repo-relative to app root). */
export function sourceFilePath(relative: string): string {
  return path.join(APP_ROOT, relative);
}
