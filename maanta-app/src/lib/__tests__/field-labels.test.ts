import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every field a person can type into has an accessible name.
 *
 * A `placeholder` is not one. It is announced inconsistently across screen
 * readers, it fails WCAG 3.3.2 on its own, and it disappears the moment someone
 * starts typing — so the one moment a person most needs to be reminded what a
 * box is for is the moment the answer is gone.
 *
 * This exists because four fields shipped without a name and the two most
 * visible were shared components, so the defect multiplied: `SearchField` is
 * rendered by five admin screens and shopper search, and every one of them
 * passed a placeholder and no name. `PhoneField` rendered its label as a
 * `<span>` rather than a `<label>`, so the tel input had no name at all — the
 * same defect `Toggle` in the same file already carried a note about.
 *
 * A name may come from any of the four things that actually give one:
 * `aria-label`, `aria-labelledby`, an `id` (paired with a `<label htmlFor>`),
 * or a wrapping `<label>`.
 */

const SRC = path.resolve(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...tsxFiles(full));
    } else if (name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** The opening tag starting at `start`, brace-aware so `{...}` props do not end it early. */
function openingTag(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/**
 * A wrapping `<label>` is an accessible name only while it is still open at the
 * field. Looking back a fixed window and asking "was there a `<label>`?" says
 * yes for a field that follows a *closed* one, so the last `<label` must also
 * come after the last `</label>`.
 */
function insideOpenLabel(before: string): boolean {
  return before.lastIndexOf("<label") > before.lastIndexOf("</label>");
}

/**
 * Controls whose `<label>` is real but not lexically adjacent.
 *
 * `new-ticket-form.tsx` builds its rows through a local
 * `field(label, control)` helper that returns `<label><span>{label}</span>{control}</label>`,
 * so the association holds at runtime while the `<label>` never appears before
 * the control in source. A lexical scan cannot see through that indirection.
 *
 * Named individually rather than skipping the file, so a genuinely unnamed
 * field added to the same file still fails. `aria-label` is deliberately NOT
 * the fix here: it would override the wrapping `<label>`, leaving two names to
 * keep in step and the visible one losing.
 */
const WRAPPED_BY_A_HELPER = new Set([
  "app/admin/support/new/new-ticket-form.tsx:153",
]);

describe("form fields carry an accessible name", () => {
  it("never leaves a placeholder as a field's only name", () => {
    const unnamed: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      const re = /<(input|textarea|select)\b/g;
      let m: RegExpExecArray | null;

      while ((m = re.exec(src))) {
        const tag = openingTag(src, m.index);
        if (!/placeholder[=\s]/.test(tag)) continue;
        if (/type=["']hidden["']/.test(tag)) continue;
        if (/aria-label|aria-labelledby|\bid=/.test(tag)) continue;
        if (insideOpenLabel(src.slice(0, m.index))) continue;

        const line = src.slice(0, m.index).split("\n").length;
        const where = `${path.relative(SRC, file)}:${line}`;
        if (WRAPPED_BY_A_HELPER.has(where)) continue;
        const ph = (tag.match(/placeholder=\{?["']([^"']*)/) || [])[1] ?? "";
        unnamed.push(`  ${where}  placeholder="${ph}"`);
      }
    }

    expect(
      unnamed,
      "Field with a placeholder and no accessible name. Add aria-label, " +
        "aria-labelledby, or an id paired with a <label htmlFor>:\n" + unnamed.join("\n")
    ).toEqual([]);
  });
});
