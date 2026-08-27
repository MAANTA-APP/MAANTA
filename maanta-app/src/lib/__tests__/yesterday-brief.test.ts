import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Ratchets for the founder's Yesterday brief.
 *
 * Two of these exist because the first draft got them wrong. I guessed at
 * `redemptions.status = 'held'` and `agent_tasks.status = 'open'`; the real
 * values are `'flagged'` and `is_complete = false`, which `/admin` had been
 * using all along. Both mistakes fail *quietly*: PostgREST returns an error,
 * the count resolves to null, and the alert renders as a dash — so a real
 * queue of flagged redemptions would simply never have been surfaced on the
 * page whose job is to surface it. A read that silently never matches is the
 * same class of defect as a zero from an error (D164), and it deserves the
 * same kind of guard.
 */
const src = () =>
  stripComments(
    readFileSync(path.join(__dirname, "../../app/founder/yesterday/page.tsx"), "utf8")
  );

describe("Yesterday brief — queries name columns that exist", () => {
  it("counts flagged redemptions, not a non-existent 'held' status", () => {
    const code = src();
    expect(code).toContain('.eq("status", "flagged")');
    expect(code).not.toContain('.eq("status", "held")');
  });

  it("counts open agent tasks by is_complete, the column that exists", () => {
    const code = src();
    expect(code).toContain('.eq("is_complete", false)');
    expect(code).not.toMatch(/agent_tasks[\s\S]{0,120}\.eq\("status", "open"\)/);
  });

  it("uses the persisted arrival-time verdict for Fast Visits", () => {
    // D191: qualification is decided at arrival and persisted immutably, so a
    // later gate flip cannot rewrite history. Counting anything else — the
    // current flag, the award row — would reintroduce exactly that defect.
    expect(src()).toContain("fast_visit_qualified_at");
  });
});

describe("Yesterday brief — evidence doctrine", () => {
  it("routes every genuine-tagged count through the single D188 helper", () => {
    const code = src();
    expect(code).toContain('from "@/lib/evidence-scope"');
    expect(code.match(/genuineTagged\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("takes external field validation from the manifest, never from a demo flag", () => {
    const code = src();
    expect(code).toContain("externalCohortSize");
    // The inverse rule — external = "not demo" — is the one that would let an
    // internal E2E shop become field evidence.
    expect(code).not.toMatch(/external[A-Za-z]*\s*=\s*[^;]*is_demo/);
  });

  it("states the genuine / demo split rather than reporting one number", () => {
    const code = src();
    expect(code).toContain("demoClaims");
    expect(code).toContain("demoVerified");
  });
});

describe("Yesterday brief — a dash is unknown, never zero", () => {
  it("keeps every headline figure nullable to the cell", () => {
    const code = src();
    // The null-preserving reader: an errored result becomes null, not 0.
    expect(code).toMatch(/r\.error \? null : r\.count \?\? 0/);
    // And the renderer prints a dash for null.
    expect(code).toMatch(/v === null \? "—"/);
  });

  it("never coerces a failed count to zero with ?? 0 at the render site", () => {
    const code = src();
    expect(code).not.toMatch(/value=\{[^}]*\?\?\s*0[^}]*\}/);
  });

  it("reports an unreadable supply list as a read failure, not an all-clear", () => {
    const code = src();
    expect(code).toContain("read failure, not an all-clear");
  });
});

describe("Yesterday brief — no causal claims from tiny samples", () => {
  it("shows a difference, never a percentage or a direction word", () => {
    const code = src();
    expect(code).toContain("vs the day before");
    // "up", "down", "improving", "trending" would all assert a trend from two
    // data points at Node 0 volumes.
    expect(code).not.toMatch(/\b(trending|improving|worsening)\b/i);
  });

  it("says the window is the previous full Nairobi day", () => {
    const code = src();
    expect(code).toContain("Nairobi");
    expect(code).toContain("3 * 3600_000");
  });
});
