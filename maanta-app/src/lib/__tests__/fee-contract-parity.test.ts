import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  aggregateLedgerFees,
  type FeeLedgerRow,
  type GenuineFeeRedemption,
} from "@/lib/evidence-scope";

/**
 * D211 / B2a — one money rule, two languages, one set of cases.
 *
 * `_fee_totals` (migration 20260829120000) and `aggregateLedgerFees` both
 * answer "what did success fees earn in this period". Two implementations of
 * one rule is a second place for it to drift, and the honest guard against that
 * is not a scan of either source — a phrase parser proves the code SAYS the
 * right thing — but the SAME semantic cases run against both.
 *
 * `supabase/tests/fixtures/fee-contract-cases.json` is that source. The SQL
 * half is generated from it and checked in; this file runs the TypeScript half
 * and also fails when the generated SQL is stale, so a fixture edited without
 * regenerating is a red build rather than a quietly weaker suite.
 *
 * ## The one divergence, and why it is written down rather than hidden
 *
 * SQL reports availability all-or-nothing: any missing fee row or any invalid
 * polarity makes gross, reversals AND net unavailable together (founder ruling
 * 2026-08-29 — an executive surface must never show a partial total).
 * TypeScript still reports it per bucket, which is the behaviour PR B merged.
 *
 * B2a does not change merged TypeScript behaviour, so the difference is
 * recorded per case in `tsDivergence` and asserted, rather than papered over
 * with a looser comparison. **B2b moves TypeScript to all-or-nothing and must
 * delete every `tsDivergence`** — the test below fails once none remain, which
 * is the reminder to delete this scaffolding with them.
 */

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "supabase/tests/fixtures/fee-contract-cases.json");
const GENERATED = path.join(
  ROOT,
  "supabase/tests/fixtures/fee_contract_cases.generated.sql"
);

type Demo = { redemption?: boolean; merchant?: boolean; deal?: boolean };
type Case = {
  id: string;
  description: string;
  window?: { since: string; until: string | null };
  scope?: string[];
  merchants?: string[];
  redemptions: {
    key: string;
    merchant?: string;
    redeemedAt: string;
    status?: string;
    feeSnapshot?: number;
    deal?: string;
    fraudFlags?: string[];
    reviewRequired?: boolean;
    demo?: Demo;
  }[];
  movements: {
    redemption: string;
    merchant?: string;
    type: string;
    amount: number | string;
    createdAt: string;
    isDemo?: boolean;
    orphan?: boolean;
    unlinked?: boolean;
    auditAmount?: number;
    noApprover?: boolean;
  }[];
  expected: {
    grossKes: number | null;
    reversalsKes: number | null;
    netKes: number | null;
    available: boolean;
    missingFeeRows: number;
    invalidRows: number;
  };
  tsDivergence?: { grossKes: number | null; reversalsKes: number | null; netKes: number | null };
  /** A case TypeScript cannot answer yet, with what B2b must change. */
  notYetInTypeScript?: string;
};

const spec = JSON.parse(readFileSync(SOURCE, "utf8")) as {
  window: { since: string; until: string | null };
  cases: Case[];
};

const isGenuine = (d?: Demo) => !d?.redemption && !d?.merchant && !d?.deal;

/**
 * Build the aggregator's three inputs the way `readLedgerFeeTotals` does.
 *
 * The reader is what supplies scope and the D188 join in TypeScript, so the
 * fixture has to reproduce that division of labour or the two implementations
 * would be answering different questions: SQL does the join itself, TypeScript
 * receives its result.
 */
function inputsFor(c: Case) {
  const w = c.window ?? spec.window;
  const inScope = (key: string) => {
    if (!Array.isArray(c.scope)) return true;
    const r = c.redemptions.find((x) => x.key === key);
    return c.scope.includes(r?.merchant ?? "m1");
  };
  // `status = 'success'` belongs here because it is the READER's predicate, not
  // the aggregator's: `readLedgerFeeTotals` builds its genuine set with
  // `.eq("status", "success")`, so a fee against a pending redemption never
  // reaches `aggregateLedgerFees` at all. The harness has to reproduce that
  // division of labour or the two implementations answer different questions.
  const genuine = (key: string) => {
    const r = c.redemptions.find((x) => x.key === key);
    return (
      !!r && (r.status ?? "success") === "success" && isGenuine(r.demo) && inScope(key)
    );
  };

  const since = Date.parse(w.since);
  const until = w.until ? Date.parse(w.until) : null;

  const redemptions: GenuineFeeRedemption[] = c.redemptions
    .filter((r) => genuine(r.key))
    .filter((r) => {
      const t = Date.parse(r.redeemedAt);
      return t >= since && (until === null || t < until);
    })
    .map((r) => ({ id: r.key, success_fee_charged: r.feeSnapshot ?? 30 }));

  const ledger: FeeLedgerRow[] = c.movements.map((m, i) => ({
    id: `${c.id}-${i}`,
    reference_id: m.redemption,
    transaction_type: m.type,
    amount: m.amount,
    created_at: m.createdAt,
  }));

  const genuineReferenceIds = c.redemptions
    .filter((r) => genuine(r.key))
    .map((r) => r.key);

  return { redemptions, ledger, genuineReferenceIds, window: w };
}

describe("the fee contract holds in TypeScript on the shared cases", () => {
  it("covers every semantic dimension the contract has", () => {
    // Not a count — a checklist. A case quietly dropped from the fixture would
    // weaken BOTH implementations at once, which is the failure mode a shared
    // source of truth introduces and has to answer for.
    const ids = spec.cases.map((c) => c.id);
    for (const required of [
      "all-four-types",
      "charge-leg-negative",
      "arrears-leg-positive",
      "reversal-reduces-net-not-gross",
      "settlement-excluded",
      "unrelated-types-excluded",
      "invalid-polarity-charge",
      "invalid-polarity-reversal",
      "zero-amount-fee-row",
      "missing-fee-row",
      "zero-activity",
      "d188-demo-redemption",
      "d188-demo-merchant",
      "d188-demo-deal",
      "boundary-movement-at-since",
      "boundary-movement-at-until",
      "boundary-movement-before-since",
      "reversal-in-window-older-redemption",
      "fee-outside-window-proves-completeness",
      "missing-fee-outside-window-does-not-poison",
      "scoped-excludes-other-merchants",
      "scoped-empty-is-available-zero",
      "fee-against-non-success-redemption-is-invalid",
      "nan-amount",
      "infinite-created-at",
      "malformed-later-reversal-does-not-blank-an-earlier-period",
      "valid-and-malformed-gross-evidence",
      "demo-tagged-movement-excluded",
      "orphan-reversal-without-audit-row",
      "second-reversal-riding-on-an-existing-audit-row",
      "second-reversal-sharing-the-first-audit-timestamp",
      "reversal-audit-row-disagrees-on-amount",
      "reversal-audit-without-an-approver",
      "fee-amount-disagrees-with-redemption-snapshot",
      "redemption-linked-to-another-merchants-deal",
      "gross-posted-before-verification",
      "duplicate-gross-rows-for-one-redemption",
      "reversal-posted-before-verification",
      "reversal-without-an-original-fee",
      "fee-row-with-no-redemption-parent",
      "unparented-fee-with-an-unplaceable-timestamp",
      "flagged-success-still-counts-and-its-reversal-reduces-net",
      "flagged-success-counts-before-its-reversal-lands",
      "unplaceable-fee-on-an-older-redemption-still-surfaces",
      "negative-infinity-fee-on-an-older-redemption-surfaces",
      "unparented-fee-at-negative-infinity",
      "deal-owner-sees-corruption-on-its-own-deal",
      "deal-owner-sees-a-missing-fee-on-its-own-deal",
      "success-with-an-unplaceable-verification-time",
      "billed-success-with-an-unplaceable-verification-time",
      "orphan-audit-pointing-at-another-merchants-transaction",
      "audit-and-reversal-timestamped-apart",
      "reversal-audit-naming-a-third-merchant",
      "audit-row-pointing-at-a-non-reversal-movement",
      "audit-against-non-success-redemption-is-invalid",
      "reversal-posted-before-its-own-charge",
      "cross-merchant-reference",
      "cross-merchant-reference-from-debited-scope",
      "malformed-fee-outside-window-does-not-prove-completeness",
    ]) {
      expect(ids, `case "${required}" must exist in the shared fixture`).toContain(
        required
      );
    }
    expect(new Set(ids).size, "case ids must be unique").toBe(ids.length);
  });

  for (const c of spec.cases) {
    if (c.notYetInTypeScript) continue;
    it(`${c.id} — ${c.description}`, () => {
      const want = c.tsDivergence ?? {
        grossKes: c.expected.grossKes,
        reversalsKes: c.expected.reversalsKes,
        netKes: c.expected.netKes,
      };
      expect(aggregateLedgerFees(inputsFor(c))).toEqual(want);
    });
  }
});

describe("the generated SQL half stays in step with its source", () => {
  it("regenerates to exactly the checked-in file", () => {
    // The whole mechanism rests on this. If the generator's output can drift
    // from the committed SQL, the two implementations are no longer proved by
    // the same cases and the fixture is decoration.
    execFileSync("node", ["scripts/gen-fee-contract-cases.mjs", "--check"], {
      cwd: ROOT,
      stdio: "pipe",
    });
  });

  it("emits one assertion block per case, naming it", () => {
    const sql = readFileSync(GENERATED, "utf8");
    for (const c of spec.cases) {
      expect(sql, `${c.id} must appear in the generated SQL`).toContain(
        `fee contract case passed: ${c.id}`
      );
    }
  });

  it("ASSERTS all six returned fields in every case, not merely mentions them", () => {
    // available and the two diagnostic counts are part of the contract. A
    // generator emitting only the three numerics would pass every case while
    // proving nothing about the all-or-nothing rule.
    //
    // Counted as ASSERT statements, not as string occurrences. An earlier
    // version of this test used `toContain("v_row.missing_fee_rows")` and a
    // mutation proved it vacuous: deleting the assertion left the field named
    // inside the surviving `format()` argument of a neighbouring one, and the
    // guard stayed green over a generator that had stopped checking it. Same
    // failure as the four vacuous guards earlier in this release train —
    // asserting that the code SAYS a thing rather than DOES it.
    const sql = readFileSync(GENERATED, "utf8");
    for (const field of [
      "available",
      "gross_kes",
      "reversals_kes",
      "net_kes",
      "missing_fee_rows",
      "invalid_rows",
    ]) {
      const asserts = sql.match(
        new RegExp(`ASSERT v_row\\.${field}\\b`, "g")
      ) ?? [];
      expect(
        asserts.length,
        `every case must ASSERT ${field}; found ${asserts.length} for ${spec.cases.length} cases`
      ).toBe(spec.cases.length);
    }
  });

  it("scopes every generated case to the merchants it created", () => {
    // Isolation, not contract. `admin_fee_totals_global` sums the whole
    // database, so a global assertion in a generated case would depend on what
    // every other suite in supabase/tests/ left behind — and one stray genuine
    // success with no fee row anywhere would turn every case in the file
    // unavailable, which is a suite that fails for reasons it does not name.
    // The global wrapper is covered by hand-written relative assertions in the
    // parent suite instead.
    const sql = readFileSync(GENERATED, "utf8");
    expect((sql.match(/admin_fee_totals_for_merchants\(/g) ?? []).length).toBe(
      spec.cases.length
    );
    expect(sql).not.toContain("admin_fee_totals_global(");
  });

  it("passes each case's own merchant ids, never a wider set", () => {
    // The `scoped-excludes-other-merchants` case is the one that would silently
    // stop testing anything if the generator defaulted to "all merchants in the
    // case" for a case that explicitly narrows the scope.
    const sql = readFileSync(GENERATED, "utf8");
    const block = sql.slice(sql.indexOf("-- scoped-excludes-other-merchants"));
    // The wrapper call itself, not the whole block — the block legitimately
    // creates m2 and its rows, which is the point of the case.
    const start = block.indexOf("admin_fee_totals_for_merchants(");
    const call = block.slice(start, block.indexOf(";", start));
    expect(call).toContain("ARRAY[v_m_m1]::uuid[]");
    expect(call).not.toContain("v_m_m2");
  });
});

describe("the TypeScript divergence is temporary and tracked", () => {
  it("names every case where TypeScript still differs from SQL", () => {
    // Exactly the four all-or-nothing cases, and nothing else. A divergence
    // appearing anywhere else means the two contracts parted company on
    // something nobody decided.
    const diverging = spec.cases.filter((c) => c.tsDivergence).map((c) => c.id);
    expect(diverging.sort()).toEqual(
      [
        "infinite-created-at",
        "invalid-polarity-charge",
        "invalid-polarity-reversal",
        "missing-fee-row",
        "nan-amount",
        "zero-amount-fee-row",
      ].sort()
    );
  });

  it("names what B2b must change for every case TypeScript cannot answer", () => {
    // Two cases are not merely reported differently — TypeScript gets them
    // WRONG, and skipping them silently would turn a known gap into an unknown
    // one. Each must say what closes it, and B2b must delete these along with
    // the tsDivergence entries.
    const gaps = spec.cases.filter((c) => c.notYetInTypeScript);
    expect(gaps.map((c) => c.id).sort()).toEqual([
      "audit-against-non-success-redemption-is-invalid",
      "audit-and-reversal-timestamped-apart",
      "audit-row-pointing-at-a-non-reversal-movement",
      "billed-success-with-an-unplaceable-verification-time",
      "cross-merchant-reference",
      "cross-merchant-reference-from-debited-scope",
      "deal-owner-sees-a-missing-fee-on-its-own-deal",
      "deal-owner-sees-corruption-on-its-own-deal",
      "demo-tagged-movement-excluded",
      "duplicate-gross-rows-for-one-redemption",
      "fee-against-non-success-redemption-is-invalid",
      "fee-amount-disagrees-with-redemption-snapshot",
      "fee-row-with-no-redemption-parent",
      "gross-posted-before-verification",
      "malformed-fee-outside-window-does-not-prove-completeness",
      "negative-infinity-fee-on-an-older-redemption-surfaces",
      "orphan-audit-pointing-at-another-merchants-transaction",
      "orphan-reversal-without-audit-row",
      "redemption-linked-to-another-merchants-deal",
      "reversal-audit-naming-a-third-merchant",
      "reversal-audit-row-disagrees-on-amount",
      "reversal-audit-without-an-approver",
      "reversal-posted-before-its-own-charge",
      "reversal-posted-before-verification",
      "reversal-without-an-original-fee",
      "second-reversal-riding-on-an-existing-audit-row",
      "second-reversal-sharing-the-first-audit-timestamp",
      "success-with-an-unplaceable-verification-time",
      "unparented-fee-at-negative-infinity",
      "unparented-fee-with-an-unplaceable-timestamp",
      "unplaceable-fee-on-an-older-redemption-still-surfaces",
    ]);
    for (const c of gaps) {
      expect(c.notYetInTypeScript!.length, `${c.id} must say what B2b changes`)
        .toBeGreaterThan(40);
      expect(c.tsDivergence, `${c.id}: a gap is not a divergence`).toBeUndefined();
    }
  });

  it("still runs every other case through TypeScript", () => {
    // The skip must stay narrow. Every other case is asserted in TypeScript.
    const skipped = spec.cases.filter((c) => c.notYetInTypeScript).length;
    expect(spec.cases.length - skipped).toBe(28);
  });

  it("only ever diverges by reporting availability per bucket", () => {
    // The divergence must be THIS one and not a second, quieter one. In every
    // diverging case SQL makes all three unavailable; TypeScript agrees that
    // net is unavailable and differs only on the sibling bucket.
    for (const c of spec.cases) {
      if (!c.tsDivergence) continue;
      expect(c.expected.available, `${c.id}`).toBe(false);
      expect(c.expected.grossKes, `${c.id}`).toBeNull();
      expect(c.expected.reversalsKes, `${c.id}`).toBeNull();
      expect(c.expected.netKes, `${c.id}`).toBeNull();
      expect(c.tsDivergence.netKes, `${c.id}: net must be unavailable in both`).toBeNull();
      const differs =
        c.tsDivergence.grossKes !== null || c.tsDivergence.reversalsKes !== null;
      expect(differs, `${c.id}: a tsDivergence identical to SQL is dead weight`).toBe(
        true
      );
    }
  });
});
