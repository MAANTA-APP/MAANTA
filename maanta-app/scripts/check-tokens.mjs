#!/usr/bin/env node
/**
 * Fail the production build if any `{{TOKEN}}` survives into rendered output.
 *
 * Hard rule from `docs/ops/website-handoff.md` §8: "render tokens as visibly
 * styled placeholders in preview, and fail the production build if any `{{`
 * survives in rendered output. That way an unfilled token cannot reach
 * www.maanta.app."
 *
 * Scans the **build output**, not the source. That distinction is the whole point:
 * `lib/marketing/facts.ts` legitimately contains `{{SET_A_DATE}}` as an unfilled
 * offer expiry, and `isOfferLive()` gates it so it never reaches a page. A source
 * scan would fail on a token that is correctly handled; an output scan fails only
 * when a token actually reached a visitor.
 *
 * Run after `next build`, over the prerendered HTML and the RSC payloads that
 * carry streamed content.
 *
 * Usage: node scripts/check-tokens.mjs [buildDir]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const BUILD_DIR = process.argv[2] ?? ".next/server/app";
const SCANNED_EXTENSIONS = [".html", ".rsc", ".body"];
const TOKEN = /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g;

if (!existsSync(BUILD_DIR)) {
  console.error(
    `check-tokens: ${BUILD_DIR} not found. Run \`next build\` first — this check ` +
      `scans build output, not source.`
  );
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCANNED_EXTENSIONS.includes(path.extname(full))) out.push(full);
  }
  return out;
}

const files = walk(BUILD_DIR);
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const matches = [...new Set(text.match(TOKEN) ?? [])];
  if (matches.length) {
    failures.push({ file: path.relative(process.cwd(), file), matches });
  }
}

if (failures.length) {
  console.error("\ncheck-tokens: unfilled tokens reached rendered output.\n");
  for (const f of failures) {
    console.error(`  ${f.file}`);
    for (const m of f.matches) console.error(`      ${m}`);
  }
  console.error(
    `\nFill the value, or gate the block so it does not render while the token is\n` +
      `unset — see isOfferLive() in src/lib/marketing/facts.ts for the pattern.\n` +
      `Token owners are listed in docs/ops/website-handoff.md §8.\n`
  );
  process.exit(1);
}

console.log(`check-tokens: clean — scanned ${files.length} rendered files, no {{TOKEN}} found.`);
