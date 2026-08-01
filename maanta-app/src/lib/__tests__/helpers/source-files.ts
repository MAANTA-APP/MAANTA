import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Directory walking for the static guard suites.
 *
 * Split from the comment stripper (`comment-stripping.ts`) so each helper has one
 * job: this one decides *which files* a guard reads, that one decides *which
 * bytes* of them count as code. Six suites had grown private copies of the same
 * recursive walk, which is the same duplication that let one stripper bug live in
 * three files at once.
 */

/** Recursively list files under `dir` matching any of `exts`. */
export function walk(dir: string, exts: string[] = [".tsx", ".ts"]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** Path relative to `src/`, for readable assertion messages. */
export const relToSrc = (srcRoot: string, f: string): string =>
  path.relative(srcRoot, f);
