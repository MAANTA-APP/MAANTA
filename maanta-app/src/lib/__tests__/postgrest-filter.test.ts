import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ilikeAnyFilter, quoteFilterValue } from "@/lib/postgrest-filter";

/**
 * SEC-004. `.or()` is a postgrest-js escape hatch: the string is appended into
 * the query as-is and PostgREST parses it as a grammar, so an interpolated user
 * value is syntax, not data.
 *
 * Two halves here. The unit tests pin the quoting rule; the source scan at the
 * bottom is the ratchet — it fails if any `.or()` in `src/` interpolates a value
 * directly again, which is the only thing that stops this returning somewhere
 * else later (the D38 lesson: a second private copy is how a defect comes back).
 */

describe("quoteFilterValue", () => {
  it("wraps a plain value in double quotes", () => {
    expect(quoteFilterValue("alice")).toBe('"alice"');
  });

  it("neutralises the comma that ends a condition", () => {
    // The injection: unquoted, `role.eq.admin` after the comma becomes a second
    // OR condition. Quoted, it is part of the search term.
    expect(quoteFilterValue("x,role.eq.admin")).toBe('"x,role.eq.admin"');
  });

  it("escapes a double quote so the value cannot be closed early", () => {
    expect(quoteFilterValue('a"b')).toBe('"a\\"b"');
  });

  it("escapes backslashes before quotes, so an escaped quote cannot be un-escaped", () => {
    // The ordering trap: escaping quotes first would turn `\"` into `\\"`,
    // where the backslash escapes the backslash and the quote terminates.
    expect(quoteFilterValue('a\\"b')).toBe('"a\\\\\\"b"');
    expect(quoteFilterValue("a\\b")).toBe('"a\\\\b"');
  });

  it("leaves the characters an email needs untouched inside the quotes", () => {
    // Stripping the reserved set instead of quoting would break this, which is
    // the reason the helper quotes.
    expect(quoteFilterValue("j.doe@example.com")).toBe('"j.doe@example.com"');
  });

  it("handles parentheses, which group conditions in the filter grammar", () => {
    expect(quoteFilterValue("a)or(b")).toBe('"a)or(b"');
  });
});

describe("ilikeAnyFilter", () => {
  it("builds one ilike condition per column with the term quoted once", () => {
    expect(ilikeAnyFilter(["full_name", "email"], "alice")).toBe(
      'full_name.ilike."%alice%",email.ilike."%alice%"'
    );
  });

  it("adds the wildcards itself, so no call site has to", () => {
    expect(ilikeAnyFilter(["name"], "bob")).toContain('"%bob%"');
  });

  it("keeps an injection attempt inside a single quoted value", () => {
    const filter = ilikeAnyFilter(["full_name", "email", "phone"], "x,role.eq.admin");
    // Three conditions, not four: the comma did not create a new one.
    expect(filter.split('.ilike."')).toHaveLength(4); // 3 conditions + leading segment
    expect(filter).toBe(
      'full_name.ilike."%x,role.eq.admin%",email.ilike."%x,role.eq.admin%",phone.ilike."%x,role.eq.admin%"'
    );
  });

  it("rejects a column name that is not a plain identifier", () => {
    // The helper must not become the injection vector it exists to close.
    expect(() => ilikeAnyFilter(["full_name.ilike.x,role"], "a")).toThrow(/Unsafe column/);
    expect(() => ilikeAnyFilter([""], "a")).toThrow(/Unsafe column/);
  });

  it("rejects an empty column list rather than emitting an empty filter", () => {
    expect(() => ilikeAnyFilter([], "a")).toThrow(/at least one column/);
  });
});

/**
 * Ratchet: no `.or()` call in the app may interpolate into its filter string.
 *
 * Deliberately a source scan and not a lint rule — it has to hold for files
 * nobody thought to lint, and it fails loudly with the offending path.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("no raw interpolation into a PostgREST filter", () => {
  it("finds no `.or(` call built from a template literal with a substitution", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const offenders: string[] = [];

    for (const file of walk(srcRoot)) {
      // This test's own fixtures describe the bad pattern in strings; skip it.
      if (file.endsWith("postgrest-filter.test.ts")) continue;
      const source = readFileSync(file, "utf8");
      // `.or(` followed by a backtick template containing a `${...}`.
      const raw = /\.or\(\s*`[^`]*\$\{[^`]*`/.test(source);
      if (raw) offenders.push(path.relative(srcRoot, file));
    }

    expect(
      offenders,
      "build the filter with ilikeAnyFilter/quoteFilterValue from @/lib/postgrest-filter instead — PostgREST parses this string as grammar, so an interpolated value is syntax"
    ).toEqual([]);
  });
});
