import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * D211 / B2b — one SQL money rule, one complete set of semantic cases.
 *
 * `_fee_totals` (migration 20260829120000) answers "what did success fees earn
 * in this period". B2b removed the application-side relational implementation;
 * every surface now delegates here, so these cases are the one executable
 * semantic contract rather than a parity approximation.
 *
 * `supabase/tests/fixtures/fee-contract-cases.json` is that source. The SQL
 * half is generated from it and checked in; this file runs the TypeScript half
 * and also fails when the generated SQL is stale, so a fixture edited without
 * regenerating is a red build rather than a quietly weaker suite.
 *
 * TypeScript separately proves that transport errors, unavailable rows and
 * malformed partial rows map all three cards to unavailable.
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

describe("the SQL fee contract covers the complete shared case set", () => {
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

  it("has no B2a TypeScript divergence or gap annotations left", () => {
    for (const c of spec.cases) {
      expect(c.tsDivergence, c.id).toBeUndefined();
      expect(c.notYetInTypeScript, c.id).toBeUndefined();
    }
  });
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
