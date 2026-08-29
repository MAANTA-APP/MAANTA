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

describe("Yesterday — supply and fees carry the same scope as the counts beside them", () => {
  it("counts shopper-visible supply through the canonical merchant predicate", () => {
    // Deal-side conditions alone are half the rule: a deal on a suspended,
    // hidden or shadow-banned merchant reaches nobody, so counting it inflated
    // supply AND suppressed the no-supply alert for the merchants most in need
    // of it.
    const code = src();
    expect(code).toContain("withPublicMerchant(");
    expect(code).toContain("merchants!inner(status,is_visible,is_shadow_banned,is_demo)");
  });

  it("applies that predicate to the zero-supply list too, not just the headline", () => {
    // Two places count supply on this page; a rule applied to one of them is a
    // page whose headline and its own alert disagree.
    const code = src();
    expect(code.match(/withPublicMerchant\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(code).not.toMatch(/if \(!demoMode\.enabled\) q = q\.eq\("is_demo", false\)/);
  });

  it("derives success fees through the one shared fee reader", () => {
    // merchant_transactions filtered by type alone let a fee charged against a
    // demo merchant sit beside genuine-tagged counts under one heading — the
    // D188 conflation in money form.
    //
    // Asserted as STRUCTURE, not as a token. The first version used
    // `toContain("success_fee_charged")`, and a mutation proved that useless:
    // stripping the column from both the query and the sum left the string
    // alive in a type annotation, and the guard stayed green over the restored
    // defect. Assert the call, never the spelling.
    const code = src();
    // D211: this page no longer builds a fee query. The D188 chain, the
    // reference_id link, the row cap and the ledger contract all live in
    // `readLedgerFeeTotals`. A second copy here would be a second place for the
    // money rules to drift, which is how the fee KPI acquired three callers
    // with three chances to forget the same type filter.
    expect(code).toMatch(/readLedgerFeeTotals\(service, \{/);
    expect(code).not.toMatch(/from\("merchant_transactions"\)/);
    // The caller-side type filter is gone and may not return: deciding what
    // counts as a fee is the reader's job, and the filter that lived here had
    // no opinion about a reversal at all.
    expect(code).not.toMatch(/transaction_type/);
    expect(code).not.toMatch(/FEE_LEDGER_TYPES/);
    // No hand-rolled reduction, and no generic magnitude rule, may return.
    expect(code).not.toMatch(/r\.amount \?\? 0/);
    expect(code).not.toMatch(/feeRows\.reduce/);
    expect(code).not.toMatch(/Math\.abs/);
  });

  it("windows both fee reads on the ledger movement's own timestamp", () => {
    // Both the all-class figure and the external-cohort figure. A day brief is
    // the surface where this matters most: a reversal posted yesterday against
    // a redemption from last month is yesterday's money movement.
    const code = src();
    const windows = code.match(
      /readLedgerFeeTotals\(service, \{[\s\S]{0,200}?window: \{ since: startIso, until: endIso \}/g
    );
    expect(windows?.length).toBe(2);
  });

  it("labels the fee KPI with its evidence scope", () => {
    expect(src()).toMatch(/genuine-tagged only/i);
  });

  it("windows arrivals and Fast Visits by their own event timestamps", () => {
    const code = src();
    expect(code).toMatch(/\.gte\("arrived_at", startIso\)/);
    expect(code).toMatch(/\.gte\("fast_visit_qualified_at", startIso\)/);
  });
});

describe("alert lists that name merchants cannot be built from a truncated read", () => {
  /**
   * Codex round 6. PostgREST applies a server-side max-rows (1000 by default)
   * and returns the first page **with no error**, so an unbounded `.select()`
   * that overflows it is indistinguishable from a complete result.
   *
   * On a KPI that would be a quietly low number. On these two reads it is
   * worse, because they build lists that NAME merchants:
   *
   * - `merchantsWithoutVisibleSupply` would silently drop merchants from the
   *   no-supply list — an all-clear for exactly the ones it dropped;
   * - `merchantsClaimedButNotVerified` can INVERT: a merchant whose `success`
   *   rows fall past the cap while its pending rows sit inside it is accused
   *   of converting nothing, when it verified fine.
   *
   * Both now cap explicitly and return null — which this page already renders
   * as "could not be established; this is a read failure, not an all-clear".
   */
  const code = () =>
    stripComments(
      readFileSync(
        path.join(process.cwd(), "src/app/founder/yesterday/page.tsx"),
        "utf8"
      )
    );

  it("bounds both list-building reads", () => {
    const src = code();
    // Both reads carry the cap...
    expect((src.match(/\.limit\(ALERT_ROW_CAP\)/g) ?? []).length).toBe(2);
    // ...and both then check whether they hit it.
    expect((src.match(/\.length >= ALERT_ROW_CAP\) return null;/g) ?? []).length).toBe(2);
  });

  it("caps below PostgREST's server limit so hitting the cap is unambiguous", () => {
    // Asking for exactly the server cap makes "I got the cap back" ambiguous
    // between a full page and a truncated one.
    const src = code();
    const m = src.match(/const ALERT_ROW_CAP = (\d+);/);
    expect(m, "ALERT_ROW_CAP must be declared").not.toBeNull();
    expect(Number(m![1])).toBeLessThan(1000);
  });

  it("leaves no unbounded select feeding a named-merchant alert", () => {
    // The property, not the two instances: any select in these two helpers
    // must be bounded. Guards against a third such read being added.
    const src = code();
    const helpers = src.slice(src.indexOf("async function merchantsWithoutVisibleSupply"));
    const selects = helpers.match(/\.select\([\s\S]*?\)/g) ?? [];
    // Every non-head select in the helpers region is either a count-only read
    // (head: true) or bounded by the cap.
    const unboundedListSelects = selects.filter(
      (sel) => !sel.includes("head: true") && !helpers.includes(".limit(ALERT_ROW_CAP)")
    );
    expect(unboundedListSelects).toEqual([]);
  });
});
