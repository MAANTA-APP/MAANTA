import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Schema and evidence enforcement for `docs/maanta-drift-register.md` (D16).
 *
 * The register exists because dated audit narratives do not carry state, so
 * resolved findings got re-discovered. But a tracker nobody validates is just a
 * slower version of the same problem — a register can rot exactly like the docs
 * it replaced. So the register is machine-checked, and the checks are about
 * honesty rather than formatting:
 *
 *  - A row cannot claim `closed` without naming evidence, and a cited repo path
 *    must actually exist. This is the invariant the original audit brief asked
 *    for ("drift rows close only when backed by evidence") and the one that
 *    stops a row being closed by assertion.
 *  - `pending-deploy` rows must name the migration that is not yet applied, and
 *    that migration must exist. "Merged" is precisely where tracking usually
 *    stops, so the register refuses to treat it as done.
 *  - IDs are unique and never reused, so closing a row cannot quietly erase what
 *    was once wrong.
 *
 * There is no check here for "design-ahead frames reference open drift rows" —
 * the original brief asked for it, but this repo has no frames artifact (see §0
 * of docs/skills/truth-audit-2026-07-30.md). Adding a test for a file that does
 * not exist would be its own false claim.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const REGISTER = path.join(REPO_ROOT, "docs", "maanta-drift-register.md");

const STATUSES = ["open", "pending-deploy", "closed", "deferred"] as const;
const CATEGORIES = [
  "code-outlier",
  "mirror-stale",
  "doc-stale",
  "db-metadata",
  "product-decision",
  "prototype-only",
  "process",
] as const;

type Row = {
  id: string;
  status: string;
  category: string;
  opened: string;
  domain: string;
  claim: string;
  evidence: string;
  owner: string;
  lineNumber: number;
};

const raw = existsSync(REGISTER) ? readFileSync(REGISTER, "utf8") : "";

/** Parse the one table whose header starts with `| ID |`. */
function parseRows(): Row[] {
  const lines = raw.split("\n");
  const rows: Row[] = [];
  let inTable = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (/^\|\s*ID\s*\|/.test(trimmed)) {
      inTable = true;
      return;
    }
    if (!inTable) return;
    // Separator row, or the first non-table line ends the table.
    if (/^\|[\s:|-]+\|$/.test(trimmed)) return;
    if (!trimmed.startsWith("|")) {
      inTable = false;
      return;
    }
    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length < 8) return;
    rows.push({
      id: cells[0],
      status: cells[1],
      category: cells[2],
      opened: cells[3],
      domain: cells[4],
      claim: cells[5],
      evidence: cells[6],
      owner: cells[7],
      lineNumber: i + 1,
    });
  });

  return rows;
}

/**
 * Paths that can actually *prove* a row is closed: a test that would fail on
 * regression, a migration that changed the database, or the decisions log.
 *
 * The distinction matters more than it looks. Requiring merely "a path that
 * exists" is not a real gate — a row can cite background reading it happens to
 * relate to and look evidenced. That hole was found by deliberately flipping an
 * open row to closed and watching this suite pass, which is why the rule is now
 * about the *kind* of artifact rather than its existence.
 */
function isProofPath(p: string): boolean {
  return (
    p.includes("/__tests__/") ||
    p.includes("/supabase/tests/") ||
    p.includes("/supabase/migrations/") ||
    p === "docs/maanta-decisions-log.md"
  );
}

/**
 * Some drift genuinely has no guard — a misleading code comment, say. Those may
 * still close, but they must say so out loud with a reason, so "unguarded" is a
 * visible choice rather than an accident.
 */
const NO_GUARD = /no guard:\s*\S/i;

/** Backticked tokens that look like repo-root-relative paths. */
function citedPaths(evidence: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(evidence.matchAll(/`([^`]+)`/g))) {
    const token = m[1].trim();
    // A path, not prose or a SQL snippet: has a slash and a file extension.
    if (!token.includes("/")) continue;
    if (/\s/.test(token)) continue;
    if (!/\.(md|ts|tsx|sql|json|ya?ml)$/.test(token)) continue;
    out.push(token);
  }
  return out;
}

const rows = parseRows();

describe("drift register schema", () => {
  it("exists and is parseable", () => {
    expect(existsSync(REGISTER), `${REGISTER} is missing`).toBe(true);
    expect(rows.length, "no drift rows parsed — did the table header change?").toBeGreaterThan(0);
  });

  it("uses well-formed, unique IDs", () => {
    const bad = rows.filter((r) => !/^(D|FU)-?\d+$/.test(r.id));
    expect(bad.map((r) => `${r.id} (line ${r.lineNumber})`), "malformed IDs").toEqual([]);

    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const r of rows) {
      if (seen.has(r.id)) dupes.push(`${r.id} (lines ${seen.get(r.id)} and ${r.lineNumber})`);
      else seen.set(r.id, r.lineNumber);
    }
    expect(dupes, "IDs must be unique and never reused — close rows, don't recycle them").toEqual([]);
  });

  it("uses only known statuses and categories", () => {
    const badStatus = rows
      .filter((r) => !STATUSES.includes(r.status as (typeof STATUSES)[number]))
      .map((r) => `${r.id}: "${r.status}"`);
    expect(badStatus, `status must be one of ${STATUSES.join(" | ")}`).toEqual([]);

    const badCategory = rows
      .filter((r) => !CATEGORIES.includes(r.category as (typeof CATEGORIES)[number]))
      .map((r) => `${r.id}: "${r.category}"`);
    expect(badCategory, `category must be one of ${CATEGORIES.join(" | ")}`).toEqual([]);
  });

  it("dates every row as ISO yyyy-mm-dd", () => {
    const bad = rows.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.opened));
    expect(bad.map((r) => `${r.id}: "${r.opened}"`), "Opened must be ISO").toEqual([]);
  });

  it("states claim vs reality for every row", () => {
    // A row that only says what to do rots; one that says what is untrue does not.
    const thin = rows.filter((r) => r.claim.length < 40);
    expect(
      thin.map((r) => `${r.id}: "${r.claim}"`),
      "describe the gap as claim vs reality, not as a task"
    ).toEqual([]);
  });
});

describe("drift rows close only when backed by evidence", () => {
  it("requires a guard, or an explicit admission of none, on every closed row", () => {
    const unevidenced = rows
      .filter((r) => r.status === "closed")
      .filter((r) => !citedPaths(r.evidence).some(isProofPath) && !NO_GUARD.test(r.evidence))
      .map((r) => `${r.id} (line ${r.lineNumber}): ${r.evidence.slice(0, 80)}`);
    expect(
      unevidenced,
      "a closed row must cite a test, a migration or the decisions log — something that\n" +
        "would fail or be contradicted if the drift returned. If the fix genuinely cannot\n" +
        'be guarded (a misleading comment, say), write "no guard: <reason>" instead.\n' +
        "Citing a doc the row merely relates to is not evidence:\n"
    ).toEqual([]);
  });

  it("resolves every cited repo path", () => {
    const missing: string[] = [];
    for (const r of rows) {
      for (const p of citedPaths(r.evidence)) {
        if (!existsSync(path.join(REPO_ROOT, p))) missing.push(`${r.id} cites missing ${p}`);
      }
    }
    expect(
      missing,
      "cited evidence does not exist. Either the path is wrong or the evidence was\n" +
        "removed — in which case the row is not closed any more"
    ).toEqual([]);
  });

  it("keeps pending-deploy rows honest about what is not yet live", () => {
    // "Merged" is exactly where tracking normally stops, so this status has to
    // name the artifact that has not landed and prove it exists to be landed.
    const problems: string[] = [];
    for (const r of rows.filter((x) => x.status === "pending-deploy")) {
      const migrations = citedPaths(r.evidence).filter((p) => p.includes("/migrations/"));
      if (migrations.length === 0) {
        problems.push(`${r.id}: pending-deploy must name the unapplied migration`);
      }
      if (!/not live|not yet applied|db push|pending/i.test(r.evidence)) {
        problems.push(`${r.id}: say explicitly that it is not live yet`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gives every open and deferred row an owner and a next step", () => {
    const problems: string[] = [];
    for (const r of rows.filter((x) => x.status === "open" || x.status === "deferred")) {
      if (!r.owner || r.owner.length < 2) problems.push(`${r.id}: needs an owner`);
      if (r.evidence.length < 30) problems.push(`${r.id}: needs a concrete next step`);
    }
    expect(problems, "an unowned open row is a wish, not a tracked gap").toEqual([]);
  });
});

describe("drift register stays current", () => {
  it("carries a Last updated stamp no older than its newest row", () => {
    const stamp = raw.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})/m);
    expect(stamp, "register needs a `Last updated: yyyy-mm-dd` line").not.toBeNull();

    const newest = rows
      .map((r) => r.opened)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .pop();
    expect(
      stamp![1] >= (newest ?? "0000-00-00"),
      `Last updated (${stamp![1]}) is older than the newest row (${newest}) — bump it`
    ).toBe(true);
  });

  it("documents every status and category it allows", () => {
    // Stops the vocabulary drifting away from the prose that explains it.
    for (const s of STATUSES) {
      expect(raw, `status \`${s}\` is allowed by the test but undocumented`).toContain(`\`${s}\``);
    }
    for (const c of CATEGORIES) {
      expect(raw, `category \`${c}\` is allowed by the test but undocumented`).toContain(c);
    }
  });
});
