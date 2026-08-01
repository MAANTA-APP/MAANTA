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
 * ## Two passes, because prerendered HTML is not all of the output
 *
 * Scanning `.next/server/app` alone covers only what was **prerendered**. Most
 * of this app's routes build as `ƒ` (dynamic, server-rendered on demand) and
 * emit no HTML at build time, and a token inside a client component ships in a
 * JS chunk rather than in any HTML at all. Either would have walked past a
 * gate that only reads prerendered files — the check would keep printing
 * "clean" while a `{{TOKEN}}` reached a visitor. Raised in review of PR #153.
 *
 * So the second pass reads the compiled chunks, with a narrower pattern:
 *
 *  - **Rendered output** (`.html`, `.rsc`, `.body`) — any `{{…}}` fails. A
 *    token of any shape in a served document is wrong.
 *  - **Compiled chunks** (`.js`) — only `{{SCREAMING_SNAKE}}` fails. MAANTA's
 *    tokens are uppercase by convention (`{{ENFORCEMENT_COMMITMENT}}`,
 *    `{{CLERK_REGION}}`, `{{SET_A_DATE}}`); vendor libraries bundle lowercase
 *    template placeholders of their own — `{{url}}`, `{{key}}`, `{{auto}}`,
 *    `{{source}}` are all present today from third-party code. Failing on those
 *    would make the gate noise, and a gate that cries wolf gets deleted.
 *
 * Source maps are skipped: they carry original comments, and `facts.ts`
 * discusses tokens in prose that is stripped from the emitted `.js`.
 *
 * Usage: node scripts/check-tokens.mjs [buildDir]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const BUILD_DIR = process.argv[2] ?? ".next/server/app";
const SCANNED_EXTENSIONS = [".html", ".rsc", ".body"];

/** Any token at all. Applied to served documents. */
const TOKEN = /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g;
/** MAANTA-shaped tokens only. Applied to compiled JS, which vendors share. */
const MAANTA_TOKEN = /\{\{\s*[A-Z][A-Z0-9_]{2,}\s*\}\}/g;

/**
 * Compiled JS to scan with the narrower pattern.
 *
 * `.next/server/app` is in this list as well as in the rendered-output pass,
 * and the two read different files from it: the first reads `.html`/`.rsc`, the
 * second reads the `page.js` that a dynamic route renders from. A token in a
 * **server** component on a dynamic route appears only in that `page.js` — it
 * reaches no chunk directory and no prerendered HTML, so without this entry it
 * is invisible to the gate in both passes.
 */
const CHUNK_DIRS = [".next/server/app", ".next/server/chunks", ".next/static/chunks"];

if (!existsSync(BUILD_DIR)) {
  console.error(
    `check-tokens: ${BUILD_DIR} not found. Run \`next build\` first — this check ` +
      `scans build output, not source.`
  );
  process.exit(1);
}

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.includes(path.extname(full))) out.push(full);
  }
  return out;
}

const files = walk(BUILD_DIR, SCANNED_EXTENSIONS);
const chunkFiles = CHUNK_DIRS.flatMap((d) => walk(d, [".js"]));
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const matches = [...new Set(text.match(TOKEN) ?? [])];
  if (matches.length) {
    failures.push({ file: path.relative(process.cwd(), file), matches });
  }
}

for (const file of chunkFiles) {
  const text = readFileSync(file, "utf8");
  const matches = [...new Set(text.match(MAANTA_TOKEN) ?? [])];
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

console.log(
  `check-tokens: clean — scanned ${files.length} rendered files and ` +
    `${chunkFiles.length} compiled chunks, no {{TOKEN}} found.`
);
