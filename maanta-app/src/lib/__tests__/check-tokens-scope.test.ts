import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The token gate's **scan scope**, guarded.
 *
 * `scripts/check-tokens.mjs` is the enforcement behind the hard rule "no
 * `{{TOKEN}}` may reach rendered output". Its correctness is entirely a
 * question of what it reads, and for the life of PR #153 it read too little:
 * only `.html`/`.rsc`/`.body` under `.next/server/app`. Most routes here build
 * as `ƒ` and emit no HTML at build time, and a token in a client component
 * ships in a JS chunk — so two classes of token could reach a visitor while the
 * script printed "clean" (drift D39).
 *
 * The script itself runs in `npm run build`, so a token that *is* in scope
 * fails CI without help from this file. What this file protects is the scope:
 * narrowing `CHUNK_DIRS` or loosening the pattern would silently restore the
 * blind spot, and nothing else would notice.
 */

const SCRIPT = path.resolve(__dirname, "..", "..", "..", "scripts", "check-tokens.mjs");
const src = readFileSync(SCRIPT, "utf8");

describe("check-tokens scan scope", () => {
  it("scans prerendered output, server routes and both chunk trees", () => {
    for (const dir of [
      // Dynamic server components compile to page.js here and are prerendered
      // nowhere — the case that reached no other directory.
      ".next/server/app",
      ".next/server/chunks",
      // Client components ship here.
      ".next/static/chunks",
    ]) {
      expect(src, `check-tokens must scan ${dir} — see drift D39`).toContain(dir);
    }
  });

  it("still fails on any token shape in a served document", () => {
    expect(src).toMatch(/const TOKEN = .*A-Za-z/);
    expect(src).toContain('".html"');
    expect(src).toContain('".rsc"');
  });

  it("uses the narrower uppercase pattern for compiled JS", () => {
    // Vendor bundles carry lowercase {{url}} / {{key}} / {{auto}} / {{source}}
    // placeholders. Applying the broad pattern to chunks would fail every
    // build on third-party code, and a gate that cries wolf gets deleted.
    expect(src).toMatch(/const MAANTA_TOKEN = .*A-Z/);
  });

  it("does not scan source maps, which retain stripped comments", () => {
    // facts.ts discusses token names in prose; those survive in .map only.
    expect(src).not.toContain('".map"');
  });
});
