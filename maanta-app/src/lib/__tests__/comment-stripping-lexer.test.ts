import { describe, it, expect } from "vitest";
import { stripCommentLines, stripComments } from "./helpers/comment-stripping";

/**
 * Tests for the thing the other guards are built on.
 *
 * Every static guard in this suite scans `stripComments` output. If the
 * stripper eats code, the guard reports success on a file that violates it —
 * which is what happened: three separate strippers cut every line at the first
 * `//`, so `href="https://wa.me/254700000000"` became `href="https:` and the
 * D36 WhatsApp guard could not see the string it exists to forbid.
 *
 * That case is the first assertion below. Found in review of PR #153; the case
 * was specifically called out in `docs/ops/CURSOR-AUDIT-BRIEF.md` §B as one to
 * check, and it was already broken when the brief was written.
 */

describe("comment stripping lexer", () => {
  it("keeps a URL inside a string literal — the D36 regression", () => {
    const src = '        href="https://wa.me/254700000000"';
    const [line] = stripCommentLines(src);
    expect(line).toContain("wa.me/254700000000");
    expect(/wa\.me\/\d/.test(line), "the D36 guard regex must still match").toBe(true);
  });

  it("still removes a real line comment", () => {
    expect(stripCommentLines("const a = 1; // KES 500 in a comment")).toEqual([
      "const a = 1; ",
    ]);
  });

  it("removes a line comment that follows a string containing //", () => {
    const [line] = stripCommentLines('const u = "https://x.test"; // KES 500');
    expect(line).toContain("https://x.test");
    expect(line).not.toContain("KES 500");
  });

  it("handles all three quote styles", () => {
    expect(stripComments(`const a = 'a//b'`)).toContain("a//b");
    expect(stripComments('const b = "a//b"')).toContain("a//b");
    expect(stripComments("const c = `a//b`")).toContain("a//b");
  });

  it("does not let an escaped quote close the literal", () => {
    const [line] = stripCommentLines('const s = "he said \\"//\\" loudly"; // gone');
    expect(line).toContain('\\"//\\"');
    expect(line).not.toContain("gone");
  });

  it("strips block comments while preserving line numbers", () => {
    const out = stripCommentLines(["a", "/* KES 500", "still comment */ b", "c"].join("\n"));
    expect(out).toHaveLength(4);
    expect(out[1]).not.toContain("KES 500");
    expect(out[2].trim()).toBe("b");
  });

  it("keeps code on both sides of an inline block comment", () => {
    expect(stripCommentLines("const a = /* KES 500 */ 1;")).toEqual(["const a =  1;"]);
  });

  it("carries an open template literal across lines", () => {
    const out = stripCommentLines(["const t = `line1 // not a comment", "line2`; // yes"].join("\n"));
    expect(out[0]).toContain("// not a comment");
    expect(out[1]).not.toContain("yes");
  });

  it("does not carry a stray apostrophe across lines", () => {
    // An unterminated single quote must not swallow the rest of the file — the
    // next line's banned phrase has to stay visible to the scanner.
    const out = stripCommentLines(["const a = 'unterminated", 'const b = "KES 500"'].join("\n"));
    expect(out[1]).toContain("KES 500");
  });
});
