import { readFileSync } from "node:fs";
import path from "node:path";
import { contractSchema, type Contract, type Frame } from "./schema";

/**
 * Reads and parses `design/current-reality/frames.json` once.
 *
 * Node-only (it touches the filesystem): this module is for the contract test
 * and the Playwright smoke generator, never for application code. Failures
 * throw with the offending frame `id` in the message, because "invalid at
 * frames[7].stateCoverage" costs a reviewer a counting exercise.
 */

/** Repo-relative location of the contract, from `maanta-app/`. */
export const CONTRACT_PATH = "design/current-reality/frames.json";

/** `maanta-app/` — the app root every contract path is relative to. */
export const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

let cached: Contract | null = null;

export function loadContract(): Contract {
  if (cached) return cached;

  const file = path.join(APP_ROOT, CONTRACT_PATH);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `design-truth: cannot read the contract at ${CONTRACT_PATH}. The mirror must be committed (drift D-08).`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`design-truth: ${CONTRACT_PATH} is not valid JSON — ${(err as Error).message}`);
  }

  const parsed = contractSchema.safeParse(json);
  if (!parsed.success) {
    // Name the frame, not the array index. Issues raised by frameSchema already
    // carry the frame id; top-level issues get their path instead.
    const lines = parsed.error.issues.map((issue) => {
      const at = issue.path.join(".");
      const frameId = frameIdAt(json, issue.path);
      const where = frameId ? `frame ${frameId}` : at || "<root>";
      return `  ${where}: ${issue.message}`;
    });
    throw new Error(
      `design-truth: ${CONTRACT_PATH} does not satisfy the contract schema:\n${lines.join("\n")}`
    );
  }

  cached = parsed.data;
  return cached;
}

/** Resolve `frames[3].x` style issue paths back to the frame's id. */
function frameIdAt(json: unknown, issuePath: readonly (string | number | symbol)[]): string | null {
  if (issuePath[0] !== "frames" || typeof issuePath[1] !== "number") return null;
  const frames = (json as { frames?: unknown[] } | null)?.frames;
  const frame = Array.isArray(frames) ? frames[issuePath[1]] : undefined;
  const id = (frame as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}

export function loadFrames(): Frame[] {
  return loadContract().frames;
}

/** The frames that opt into behavioural smoke coverage. */
export function smokeFrames(): Frame[] {
  return loadFrames().filter((f) => f.smoke);
}

export type { Contract, Frame } from "./schema";
