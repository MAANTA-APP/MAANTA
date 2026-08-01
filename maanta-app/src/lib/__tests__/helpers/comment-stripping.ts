/**
 * Comment stripping for the copy guards — the single implementation.
 *
 * ## Why this file exists
 *
 * Several guards in this suite check what a page *says*. A comment says nothing
 * to a visitor, so it has to come out before the scan — otherwise documenting why
 * a banned phrase was removed reintroduces the failure, and the guard teaches the
 * next author to delete the explanation rather than keep the guard. The first run
 * of `marketing-shell.test.ts` flagged three of its own explanatory comments for
 * exactly that reason.
 *
 * Stripping comments from JSX has one non-obvious trap, and this repo has now hit
 * it twice:
 *
 * ```ts
 * src.replace(/\/\/.*$/gm, "")   // ← wrong
 * ```
 *
 * That truncates every line from its first `//`, and marketing JSX is full of
 * `https://` links. Any claim sharing a line with a URL is deleted *before* the
 * scan, so the guard reports green for the half of the line it threw away — a
 * guard reading a document it has already censored. `038e3bc0` found this in
 * `marketing-shell.test.ts` and `pricing-copy.test.ts` and fixed both; the third
 * copy in `held-claims.test.ts` survived untouched and was found later, as drift
 * **D38**.
 *
 * Three files carrying the same subtle helper is how a fourth copy gets written
 * with the bug back in it. Hence one implementation, imported.
 *
 * ## Scope
 *
 * This is a deliberately small lexer, not a JS/TSX parser. It understands `//`
 * and block comments and nothing else — in particular it does **not** track
 * string or template literals, so a `//` inside a quoted string is still treated
 * as a comment start. That is acceptable here and load-bearing nowhere: these
 * guards scan for prose, and a false *strip* can only ever make a guard miss
 * something, which the mutation tests in each consumer are there to catch. If a
 * guard ever needs literal-aware stripping, parse properly rather than growing
 * this.
 *
 * Not under a `*.test.ts` name on purpose: `vitest.config.ts` collects
 * `src/**​/*.test.ts`, so a helper named like a suite would be run as an empty one.
 */

/**
 * Index of the `//` that starts a line comment at or after `start`, or `-1`.
 *
 * Skips a `//` preceded by `:` so the `//` in `https://` is not mistaken for a
 * comment. This is the whole fix — see the file docblock.
 */
export function lineCommentAt(line: string, start: number): number {
  let pos = start;
  while (pos < line.length) {
    const idx = line.indexOf("//", pos);
    if (idx === -1) return -1;
    if (idx > 0 && line[idx - 1] === ":") {
      pos = idx + 2;
      continue;
    }
    return idx;
  }
  return -1;
}

/**
 * Source with comments removed, as one entry per original line.
 *
 * Block comments are blanked line-by-line rather than collapsed, so a line index
 * into the result still points at the same source line — which is what lets a
 * failing guard report a line number the reader can open.
 */
export function stripCommentLines(src: string): string[] {
  let inBlock = false;
  return src.split("\n").map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) return out;
        inBlock = false;
        i = end + 2;
        continue;
      }
      const lineComment = lineCommentAt(line, i);
      const blockStart = line.indexOf("/*", i);
      if (blockStart !== -1 && (lineComment === -1 || blockStart < lineComment)) {
        out += line.slice(i, blockStart);
        inBlock = true;
        i = blockStart + 2;
        continue;
      }
      if (lineComment !== -1) {
        out += line.slice(i, lineComment);
        return out;
      }
      out += line.slice(i);
      break;
    }
    return out;
  });
}

/** `stripCommentLines`, rejoined — for guards that scan whole-file text. */
export function stripComments(src: string): string {
  return stripCommentLines(src).join("\n");
}
