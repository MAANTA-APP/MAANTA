import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
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
 *  - IDs are unique within the register, and D-numbers are contiguous, so a
 *    deleted row leaves a detectable hole rather than quietly erasing what was
 *    once wrong.
 *
 * Two limits, stated rather than left to be discovered — the point of this file
 * is that an unenforced claim is worse than an absent one:
 *
 *  - **Contiguity detects numeric holes, nothing more.** Deleting D7 outright
 *    fails, because D6→D8 is a gap. Two things it does NOT catch: rewriting D7's
 *    content in place while keeping the ID, and renumbering the whole tail
 *    (delete D7, shift D8..Dn down by one). Both leave D1..Dn contiguous.
 *    Detecting either needs history, and CI checks out at `fetch-depth: 1` — a
 *    base-branch guard would find nothing to compare against and pass silently,
 *    which is enforcement-shaped and enforces nothing. The append-only rule is
 *    carried by the register's prose for those cases, not by this file.
 *  - **No check for "design-ahead frames reference open drift rows."** The
 *    original brief asked for it. It was skipped because this repo had no frames
 *    artifact, and asserting against a file that does not exist would have been
 *    its own false claim. **That reason expired on 2026-07-30**, when #146 added
 *    maanta-app/design/current-reality/frames.json. The check is now buildable
 *    and is still not built, which is tracked as D26 rather than left implied by
 *    a stale comment here. Note it would fail as written today: the file has one
 *    design-ahead surface and references no drift row anywhere.
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

/**
 * Rows that could not be parsed. Surfaced as a test failure rather than skipped.
 *
 * Silently dropping a malformed row would let it bypass every check below — a row
 * missing its Owner cell would never reach the owner assertion, so the weakest
 * rows would be the ones that escape. That is the same shape as the evidence hole
 * this suite already had: a check that only inspects what it manages to parse is
 * not a check.
 */
const parseProblems: string[] = [];

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
    // Alignment row.
    if (/^\|[\s:|-]+\|$/.test(trimmed)) return;
    // A blank line inside the table is tolerated; a horizontal rule ends it.
    if (!trimmed) return;
    if (/^-{3,}$/.test(trimmed)) {
      inTable = false;
      return;
    }
    // Anything else while still in the table must be a well-formed row.
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      parseProblems.push(`line ${i + 1}: not a table row — did the table end without a --- rule?`);
      return;
    }
    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length !== 8) {
      parseProblems.push(
        `line ${i + 1}: expected 8 cells, got ${cells.length} — a short row would skip every check`
      );
      return;
    }
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

/**
 * Backticked tokens that look like repo-root-relative paths.
 *
 * Known limit, stated rather than discovered: the file-extension requirement means
 * a citation without one — a bare directory like `docs/ops/`, say — is not treated
 * as a path and so is never resolved. That is deliberate, because the evidence
 * column also contains prose and SQL snippets in backticks, and treating those as
 * paths would produce noise. It errs toward under-validating, never toward passing
 * a path that does not exist. Cite a file, not a folder.
 */
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
    expect(
      parseProblems,
      "malformed register rows. A row that fails to parse is a row that skips every\n" +
        "check below, so it fails here instead of being dropped"
    ).toEqual([]);
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
    expect(dupes, "IDs must be unique within the register").toEqual([]);
  });

  /**
   * The append-only rule needs more than within-file uniqueness: deleting D7 and
   * later reusing the number would pass a uniqueness check, and the deletion is
   * the thing that loses history.
   *
   * Contiguity catches it without consulting git — a removed row leaves a hole.
   * Deliberately not implemented by diffing the base branch: CI checks out at
   * `fetch-depth: 1`, so previous revisions are not reliably available and the
   * guard would pass for the wrong reason.
   */
  it("keeps D-numbers contiguous, so a deleted row leaves a detectable hole", () => {
    const numbers = rows
      .filter((r) => /^D-?\d+$/.test(r.id))
      .map((r) => Number(r.id.replace(/^D-?/, "")))
      .sort((a, b) => a - b);
    if (numbers.length === 0) return;

    expect(numbers[0], "D-numbering starts at 1").toBe(1);
    const gaps: string[] = [];
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] !== numbers[i - 1] + 1) {
        gaps.push(`between D${numbers[i - 1]} and D${numbers[i]}`);
      }
    }
    expect(
      gaps,
      "gap in the D sequence — a row was deleted or renumbered. Rows are append-only:\n" +
        "close them instead, because the record of what was once wrong is the point"
    ).toEqual([]);
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

  it("resolves every cited repo path, and only inside this repo", () => {
    const missing: string[] = [];
    for (const r of rows) {
      for (const p of citedPaths(r.evidence)) {
        // `path.join`/`path.resolve` accept `../`, so a citation could point
        // outside the repo and still "exist". Evidence has to be something a
        // reader of this repo can actually open.
        const resolved = path.resolve(REPO_ROOT, p);
        if (!existsSync(resolved)) {
          missing.push(`${r.id} cites missing ${p}`);
          continue;
        }
        // Canonicalize both sides before comparing. `path.resolve` is purely
        // lexical, so a repo-local symlink pointing outside the tree would pass a
        // string-prefix check — and the repo root itself may sit under a symlink,
        // which would fail one. realpath on both is the only comparison that means
        // what it says. Done after the existence check so a missing path reports
        // as missing rather than throwing ENOENT here.
        const realRoot = realpathSync(REPO_ROOT);
        const realCited = realpathSync(resolved);
        const inside =
          realCited === realRoot || realCited.startsWith(realRoot + path.sep);
        if (!inside) {
          missing.push(`${r.id} cites ${p}, which resolves outside the repo root`);
        }
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

describe("the register describes reconciliations as what they were", () => {
  /**
   * Codex, on PR #288 head 38a07e6. The register header announced the branch
   * had been "rebased onto main" while the commit that wrote it said the
   * opposite — `main` was merged in, and the head is a two-parent merge. The
   * ops doc compounded it: a section whose paragraph began "Resolved
   * 2026-08-28" still ended by promising that "after PR 5 merges, PR 1 rebases
   * and renumbers", so the same paragraph both completed and forecast the act.
   *
   * The register is the canonical record of what is true. A provenance line
   * that misstates HOW a reconciliation happened is the register doing the
   * thing it exists to catch — and the failure mode is specific: a future
   * reader tracing a renumber would look for a rebase that never occurred, and
   * find a history that does not match the account of it.
   *
   * Guarded as the shape rather than the sentence: no completed reconciliation
   * may be described in the future tense, and no merge may be called a rebase.
   */
  it("states how the 2026-08-28 reconciliation was actually done", () => {
    // Asserted positively, not as a ban on the word "rebase": the register
    // legitimately records a REAL past rebase (the D173/D174 collision, onto
    // `5ee90ba`), and forbidding the phrase outright would stop the register
    // describing history that genuinely happened. What must hold is that THIS
    // reconciliation is described as the merge it was.
    const header = raw.split("\n").slice(0, 6).join("\n");
    expect(header).toMatch(/reconciled onto `main`/);
    expect(header).toMatch(/merged into the branch, not rebased onto/);
    expect(header).toMatch(/two-parent merge/);
  });

  it("does not promise a renumber it has already carried out", () => {
    // Third attempt at this guard, and the first two failed in opposite
    // directions — worth recording, because both are shapes this repo has
    // shipped before.
    //
    //  1. It scanned the REGISTER for a sentence that lives in the ops record,
    //     so it passed straight over the restored defect (D38).
    //  2. Repointed at one hardcoded filename, it then early-returned when the
    //     file was absent — "merged away later; nothing to police" — which
    //     turns a rename into a permanent blind spot while the test stays
    //     green. The stale wording would simply travel with the document.
    //
    // So it scans the whole ops directory instead of naming a file. A rename
    // cannot create a blind spot, a deletion cannot silently pass, and the
    // scan asserts it actually read something so it can never pass vacuously.
    // Whole `docs/` tree, recursively: scanning only `docs/ops` would let the
    // record escape by moving one directory up.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return e.isFile() && e.name.endsWith(".md") ? [full] : [];
      });
    const files = walk(path.join(REPO_ROOT, "docs"));
    expect(files.length, "docs/ must contain records to scan").toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      // Future tense for a renumber the same document reports as done.
      const name = path.relative(REPO_ROOT, f);
      if (/rebases and renumbers/.test(text)) offenders.push(`${name}: "rebases and renumbers"`);
      if (/Numbering, to settle after/.test(text)) offenders.push(`${name}: future-tense numbering heading`);
      // A moving pointer stated as a durable fact: "the head is a two-parent
      // merge" is true only until the next commit. Name the commit.
      if (/(the |branch )head is a two-parent merge/.test(text)) {
        offenders.push(`${name}: describes "the head" as the merge instead of naming the commit`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
