/**
 * Rewrites the committed SVG icons from `src/lib/brand/mark.ts`.
 *
 * Run after changing the mark: `npm run brand:icons`.
 *
 * The two outputs are static files because the web manifest has to reference
 * them by stable URL, which a generated Next route cannot give. They are
 * therefore derived artefacts that live in git, and the thing that keeps them
 * honest is `brand-icons.test.ts` — it rebuilds both from the module and fails
 * if what is committed differs. Editing the mark without running this script
 * fails CI rather than shipping a header logo that disagrees with the app icon.
 *
 * Deliberately dependency-free: it parses the constants out of the TypeScript
 * source rather than importing it, so it runs with plain `node` and needs no
 * build step or loader. The parse is strict — anything unexpected throws instead
 * of writing a wrong file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const src = readFileSync(path.join(root, "src", "lib", "brand", "mark.ts"), "utf8");

function must(re, label) {
  const m = src.match(re);
  if (!m) throw new Error(`write-brand-icons: could not read ${label} from mark.ts`);
  return m;
}

const badge = must(/badge:\s*"([^"]+)"/, "badge colour")[1];
const radius = Number(must(/MARK_RADIUS\s*=\s*([\d.]+)/, "radius")[1]);
const viewBox = Number(must(/MARK_VIEWBOX\s*=\s*([\d.]+)/, "viewBox")[1]);

const block = must(
  /export const MARK_PATHS[^=]*=\s*\[([\s\S]*?)\]\s*as const;/,
  "MARK_PATHS"
)[1];

const paths = [];
for (const entry of block.split(/\},\s*\{/)) {
  const d = entry.match(/d:\s*"([^"]+)"/);
  if (!d) continue;
  const fill = entry.match(/fill:\s*(?:MARK_COLORS\.(\w+)|"([^"]+)")/);
  const stroke = entry.match(/stroke:\s*(?:MARK_COLORS\.(\w+)|"([^"]+)")/);
  const width = entry.match(/strokeWidth:\s*([\d.]+)/);
  const resolve = (m) => {
    if (!m) return undefined;
    if (m[2]) return m[2];
    const named = must(new RegExp(`${m[1]}:\\s*"([^"]+)"`), `colour ${m[1]}`)[1];
    return named;
  };
  paths.push({
    d: d[1],
    fill: resolve(fill),
    stroke: resolve(stroke),
    strokeWidth: width ? Number(width[1]) : undefined,
  });
}

if (paths.length === 0) throw new Error("write-brand-icons: parsed zero paths");

/** Rounded so a committed asset never carries float noise like `4.799999999999999`. */
function inset(scale, v) {
  return Math.round((((1 - scale) * v) / 2) * 1000) / 1000;
}

function pathAttrs(p) {
  const bits = [`d="${p.d}"`];
  if (p.fill) bits.push(`fill="${p.fill}"`);
  if (p.stroke) {
    bits.push(
      `stroke="${p.stroke}"`,
      `stroke-width="${p.strokeWidth ?? 1}"`,
      'fill="none"',
      'stroke-linecap="round"',
      'stroke-linejoin="round"'
    );
  }
  return bits.join(" ");
}

export function buildSvg(safeAreaScale = 1) {
  const v = viewBox;
  const drawn = paths.map((p) => `  <path ${pathAttrs(p)}/>`).join("\n");
  const inner =
    safeAreaScale === 1
      ? drawn
      : `  <g transform="translate(${inset(safeAreaScale, v)} ${inset(
          safeAreaScale,
          v
        )}) scale(${safeAreaScale})">\n  ${drawn.split("\n").join("\n  ")}\n  </g>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}">`,
    `  <rect x="0" y="0" width="${v}" height="${v}" rx="${radius}" fill="${badge}"/>`,
    inner,
    "</svg>",
    "",
  ].join("\n");
}

const outputs = [
  ["public/icon.svg", buildSvg(1)],
  // 0.8 is the maskable safe area: Android crops to roughly the middle 80%, so a
  // mark that bleeds to the edge loses its corners. The badge still fills the
  // square; only the drawing inside it is inset.
  ["public/icon-maskable.svg", buildSvg(0.8)],
];

if (process.argv.includes("--check")) {
  let bad = 0;
  for (const [rel, want] of outputs) {
    const got = readFileSync(path.join(root, rel), "utf8");
    if (got !== want) {
      console.error(`brand:icons — ${rel} is stale. Run: npm run brand:icons`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`brand:icons: clean — ${outputs.length} icon(s) match src/lib/brand/mark.ts`);
} else {
  for (const [rel, svg] of outputs) {
    writeFileSync(path.join(root, rel), svg);
    console.log(`brand:icons: wrote ${rel}`);
  }
}
