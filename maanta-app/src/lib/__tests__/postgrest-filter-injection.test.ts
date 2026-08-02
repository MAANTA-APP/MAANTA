import { describe, it, expect } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { pgrstQuote, orIlikeAny } from "@/lib/supabase/filters";
import { walk, relToSrc } from "./helpers/source-files";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Guard for drift **D57** — user input interpolated into a PostgREST filter
 * expression.
 *
 * Two halves, and the second is the one that matters long-term:
 *
 *  1. The escaping itself is asserted against **the URL supabase-js actually
 *     emits**, not against the helper's return value. A helper that returns a
 *     nice-looking string while the client mangles it on the way out would pass
 *     a unit test and still be injectable.
 *  2. A source scan fails the build on any interpolated `.or(` under `src/`,
 *     because the defect is the *construction*. Fixing the one call site that
 *     was found leaves the next one free to reintroduce it, and this repo has
 *     already watched that happen with the comment strippers (D38, D43).
 */

const SRC = path.resolve(__dirname, "..", "..");

/** The URL supabase-js builds — the only thing PostgREST ever sees. */
function emittedUrl(build: (q: ReturnType<typeof table>) => { url: URL }): string {
  return decodeURIComponent(build(table()).url.toString());
}
function table() {
  return createClient("https://example.supabase.co", "anon-key-for-tests")
    .from("users")
    .select("id, full_name, email, phone, role");
}

/** The exact payload from the audit: breaks out of the intended disjunction. */
const HOSTILE = "x%,role.eq.admin,full_name.ilike.%y";

describe("orIlikeAny keeps user input inside the value (D57)", () => {
  it("does not let a comma create a new top-level predicate", () => {
    const filter = orIlikeAny(["full_name", "email", "phone"], HOSTILE)!;
    const url = emittedUrl((q) => q.or(filter) as unknown as { url: URL });

    // The property is structural, so assert it structurally. A substring check
    // for `role.eq.admin` would fail on the *correct* output too — the text is
    // still there, harmlessly, inside the quoted value. What must be true is
    // that it is not a predicate: split the disjunction on commas that sit
    // outside quotes, and every part must be one of the three columns we asked
    // for. Before the fix this split returned nine parts, one of them
    // `role.eq.admin`.
    const inner = url.slice(url.indexOf("or=(") + 4, url.lastIndexOf(")"));
    const predicates = inner.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

    expect(predicates).toHaveLength(3);
    expect(predicates.map((p) => p.slice(0, p.indexOf(".ilike.")))).toEqual([
      "full_name",
      "email",
      "phone",
    ]);

    // The whole hostile string survives as one quoted value — the admin's
    // search is not silently mangled, it is just not executable.
    expect(url).toContain('full_name.ilike."%x%,role.eq.admin,full_name.ilike.%y%"');
  });

  it("escapes the characters that would end a quoted value", () => {
    // A double quote would otherwise close the quoting and hand the rest of the
    // string back to the parser — the same escape as the comma, one level down.
    expect(pgrstQuote('a"b')).toBe('"a\\"b"');
    expect(pgrstQuote("a\\b")).toBe('"a\\\\b"');
    expect(pgrstQuote('back\\"slash')).toBe('"back\\\\\\"slash"');
  });

  it("quotes unconditionally, so the safe path never depends on the input", () => {
    expect(pgrstQuote("plain")).toBe('"plain"');
    expect(orIlikeAny(["a"], "plain")).toBe('a.ilike."%plain%"');
  });

  it("returns null for an empty term rather than an empty or=()", () => {
    expect(orIlikeAny(["a", "b"], "")).toBeNull();
    expect(orIlikeAny(["a", "b"], "   ")).toBeNull();
    expect(orIlikeAny([], "term")).toBeNull();
  });

  it("confirms bound filters were never the problem", () => {
    // Stated as a test so a future reader does not "harden" .ilike() too, or
    // conclude the whole file needed escaping. supabase-js encodes the value.
    const url = emittedUrl(
      (q) => q.ilike("title", `%${HOSTILE}%`) as unknown as { url: URL }
    );
    expect(url).toContain(`title=ilike.%${HOSTILE}%`);
    expect(url).not.toContain("or=(");
  });
});

describe("no source builds a PostgREST filter expression by interpolation", () => {
  it("finds real call sites to check, so the scan cannot pass vacuously", () => {
    const files = walk(SRC).filter((f) => /\.or\s*\(/.test(stripComments(readFileSync(f, "utf8"))));
    expect(files.length, "no .or( call sites found — did the scan break?").toBeGreaterThan(0);
  });

  it("fails on an interpolated .or( anywhere under src/", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const code = stripComments(readFileSync(file, "utf8"));
      // `.or(` opened with a template literal containing a substitution. The
      // safe form passes a variable built by orIlikeAny, so it has no backtick.
      for (const match of Array.from(code.matchAll(/\.or\s*\(\s*`([^`]*)`/g))) {
        if (match[1].includes("${")) {
          offenders.push(relToSrc(SRC, file));
        }
      }
    }

    expect(
      Array.from(new Set(offenders)),
      "`.or()` takes PostgREST's filter DSL, not a bound value — an interpolated\n" +
        "template literal there is injectable (D57). Build the expression with\n" +
        "orIlikeAny/pgrstQuote from src/lib/supabase/filters.ts instead."
    ).toEqual([]);
  });
});
