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
 * ## Scope, and why the `://` rule was not enough
 *
 * The first consolidation of this helper skipped a `//` **preceded by a colon**,
 * which fixes `https://` and nothing else. Its docblock argued the limit was safe
 * because "a false *strip* can only ever make a guard miss something".
 *
 * That is the failure mode, not a mitigation. A guard that misses is exactly what
 * D36 was: green while the file contained the string it forbids. And the `://`
 * rule still mis-strips any other literal containing a double slash — a bare
 * protocol-relative `"//cdn.example.com"`, a doubled path segment, a regex source
 * in a string. Each silently truncates the line before the scan reads it.
 *
 * So this now tracks string state — `'`, `"` and `` ` `` with escape handling — and
 * a `//` inside a literal is left alone regardless of what precedes it. It is
 * still a small lexer rather than a parser, and its remaining limits are stated
 * rather than assumed safe:
 *
 *  - **Regex literals are not tracked.** `/ \/\/ /` reads as a comment. No source
 *    file here contains one, and the residual risk is a banned phrase written
 *    inside a regex, which is not how copy gets published.
 *  - **`${…}` interpolations are treated as string interior**, so a comment inside
 *    one is not stripped. Scanning slightly too much is the safe direction.
 *
 * Both are exercised by `comment-stripping.test.ts`, whose first assertion is the
 * `wa.me` line that started all of this.
 *
 * Not under a `*.test.ts` name on purpose: `vitest.config.ts` collects
 * `src/**​/*.test.ts`, so a helper named like a suite would be run as an empty one.
 */

/**
 * Source with comments removed, as one entry per original line.
 *
 * Block comments are blanked line-by-line rather than collapsed, so a line index
 * into the result still points at the same source line — which is what lets a
 * failing guard report a line number the reader can open.
 */
export function stripCommentLines(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  /** The quote character of the string literal currently open, if any. */
  let quote: '"' | "'" | "`" | null = null;

  for (const line of src.split("\n")) {
    let kept = "";
    let i = 0;

    while (i < line.length) {
      const ch = line[i];

      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) {
          i = line.length;
          break;
        }
        inBlock = false;
        i = end + 2;
        continue;
      }

      if (quote) {
        kept += ch;
        if (ch === "\\") {
          // Escape: consume the next character verbatim so `\"` does not close
          // the literal. A trailing backslash continues onto the next line.
          if (i + 1 < line.length) kept += line[i + 1];
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        kept += ch;
        i += 1;
        continue;
      }

      if (ch === "/" && line[i + 1] === "/") {
        // A genuine line comment: nothing further on this line is code.
        i = line.length;
        break;
      }

      if (ch === "/" && line[i + 1] === "*") {
        inBlock = true;
        i += 2;
        continue;
      }

      kept += ch;
      i += 1;
    }

    // Only a template literal may span a newline. Reset the other two so one
    // stray apostrophe — in prose inside a comment we just stripped, say —
    // cannot swallow the remainder of the file.
    if (quote === '"' || quote === "'") quote = null;

    out.push(kept);
  }

  return out;
}

/** `stripCommentLines`, rejoined — for guards that scan whole-file text. */
export function stripComments(src: string): string {
  return stripCommentLines(src).join("\n");
}
