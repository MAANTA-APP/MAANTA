import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Guard for drift **D77** — the SQL suites can only fail if PL/pgSQL asserts run.
 *
 * Every file under `supabase/tests/` signals failure with `ASSERT`. `ASSERT` is
 * a no-op when `plpgsql.check_asserts` is off, so with that setting off the
 * entire money-path corpus — golden path, verify/fee, arrears, the nodes
 * registry — passes green while testing nothing at all.
 *
 * It defaults to on, which is why this was never noticed. But the default
 * belongs to the server, not to this repo: `ALTER DATABASE ... SET`, a
 * `postgresql.conf` edit, or a future Supabase CLI default would each flip it
 * with nothing here objecting. Both runners now pin it explicitly.
 *
 * This test exists for the same reason `build-gates.test.ts` does: the fix is a
 * line in a script, and a line in a script can be deleted in a hurry. Without
 * this, removing `PGOPTIONS` would make CI *greener* — every suite would still
 * "pass" — which is precisely the failure mode that makes vacuous guards worse
 * than absent ones (see D38, D69).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

/** Matches `plpgsql.check_asserts=on` tolerant of spacing and quoting. */
const ENFORCES = /plpgsql\.check_asserts\s*=\s*on/;

const RUNNERS = [
  {
    label: "CI db-tests job",
    file: ".github/workflows/ci.yml",
    // Narrowed to the job, so setting it in an unrelated job cannot satisfy this.
    section: (src: string) => src.slice(src.indexOf("db-tests:")),
  },
  {
    label: "make db-verify",
    file: "Makefile",
    section: (src: string) => {
      const start = src.indexOf("db-verify:");
      const rest = src.slice(start);
      // Stop at the next target so a later target's setting cannot stand in.
      const next = rest.slice(1).search(/\n[a-zA-Z0-9_-]+:/);
      return next === -1 ? rest : rest.slice(0, next + 1);
    },
  },
] as const;

describe("the SQL suites cannot pass vacuously (D77)", () => {
  it.each(RUNNERS)("$label pins plpgsql.check_asserts=on", ({ file, section }) => {
    const src = readFileSync(path.join(REPO_ROOT, file), "utf8");
    const scoped = section(src);

    expect(scoped, `${file}: could not locate the runner section`).not.toBe("");
    expect(
      ENFORCES.test(scoped),
      `${file} runs supabase/tests/*.sql without pinning plpgsql.check_asserts.\n` +
        "Those suites report failure with ASSERT, which is a no-op when that\n" +
        "setting is off — so without it the whole corpus can pass while testing\n" +
        'nothing. Restore: export PGOPTIONS="-c plpgsql.check_asserts=on"'
    ).toBe(true);
  });

  it("still finds ASSERT-based suites to protect, so this guard is not moot", () => {
    // If the suites ever stop using ASSERT, the pin above is pointless and this
    // file should be reconsidered rather than left as decoration.
    const dir = path.join(REPO_ROOT, "maanta-app", "supabase", "tests");
    const withAsserts = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /\bASSERT\b/.test(readFileSync(path.join(dir, f), "utf8")));

    expect(withAsserts.length).toBeGreaterThan(0);
  });
});
