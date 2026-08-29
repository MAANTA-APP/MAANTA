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
  redemptions: { key: string; merchant?: string; redeemedAt: string; demo?: Demo }[];
  movements: { redemption: string; type: string; amount: number; createdAt: string }[];
  expected: {
    grossKes: number | null;
    reversalsKes: number | null;
    netKes: number | null;
    available: boolean;
    missingFeeRows: number;
    invalidRows: number;
  };
  tsDivergence?: { grossKes: number | null; reversalsKes: number | null; netKes: number | null };
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
  const genuine = (key: string) => {
    const r = c.redemptions.find((x) => x.key === key);
    return !!r && isGenuine(r.demo) && inScope(key);
  };

  const since = Date.parse(w.since);
  const until = w.until ? Date.parse(w.until) : null;

  const redemptions: GenuineFeeRedemption[] = c.redemptions
    .filter((r) => genuine(r.key))
    .filter((r) => {
      const t = Date.parse(r.redeemedAt);
      return t >= since && (until === null || t < until);
    })
    .map((r) => ({ id: r.key, success_fee_charged: 30 }));

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
    ]) {
      expect(ids, `case "${required}" must exist in the shared fixture`).toContain(
        required
      );
    }
    expect(new Set(ids).size, "case ids must be unique").toBe(ids.length);
  });

  for (const c of spec.cases) {
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

  it("asserts all six returned fields, not just the money ones", () => {
    // available and the two diagnostic counts are part of the contract. A
    // generator that emitted only the three numerics would pass every case
    // while proving nothing about the all-or-nothing rule.
    const sql = readFileSync(GENERATED, "utf8");
    for (const field of [
      "v_row.available",
      "v_row.gross_kes",
      "v_row.reversals_kes",
      "v_row.net_kes",
      "v_row.missing_fee_rows",
      "v_row.invalid_rows",
    ]) {
      expect(sql).toContain(field);
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
        "invalid-polarity-charge",
        "invalid-polarity-reversal",
        "missing-fee-row",
        "zero-amount-fee-row",
      ].sort()
    );
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
