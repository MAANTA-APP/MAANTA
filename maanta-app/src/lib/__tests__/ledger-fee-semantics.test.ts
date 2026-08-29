import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import {
  aggregateLedgerFees,
  FEE_LEDGER_TYPES,
  FEE_ROW_CAP,
  LEDGER_TYPE_CONTRACT,
  UNKNOWN_FEE_TOTALS,
  type FeeLedgerRow,
  type GenuineFeeRedemption,
} from "@/lib/evidence-scope";
import { sumFeeTotals } from "@/lib/pilot-command-centre";
import {
  FEE_FIGURE_LABELS,
  FeeBreakdownCell,
} from "@/components/admin/fee-figures";
import { readLedgerFeeTotals } from "@/lib/evidence-scope";

/**
 * D211 — "Success fees" measured GROSS linked fee entries and said so nowhere.
 *
 * `reverse_success_fee` writes a positive `fee_reversal` row and, when arrears
 * were standing, a negative `arrears_settlement` row, both carrying the
 * redemption's `reference_id`. Neither type was in the billed set, so a
 * reversal could not double-count — but a reversed fee still counted in full
 * toward a number a reader takes as revenue.
 *
 * ## The ledger's signed contract, read back from production 2026-08-29
 *
 * `pg_get_functiondef` on the live functions:
 *
 * | type                  | writes         | sign     | bucket    |
 * |-----------------------|----------------|----------|-----------|
 * | `success_fee`         | `-p_amount`    | negative | gross     |
 * | `success_fee_arrears` | `p_amount`     | POSITIVE | gross     |
 * | `fee_reversal`        | `v_fee_amount` | positive | reversals |
 * | `arrears_settlement`  | `-v_settled`   | negative | excluded  |
 *
 * The arrears leg is positive because it accrues a debt rather than moving the
 * wallet. **Two rows against one redemption therefore carry opposite signs**,
 * which is the exact hazard the D211 row warned about, and the reason sign can
 * never classify a row while `Math.abs` could never be the arithmetic.
 */

const WINDOW = { since: "2026-08-01T00:00:00Z", until: "2026-09-01T00:00:00Z" };
const IN = "2026-08-15T12:00:00Z";
const BEFORE = "2026-07-15T12:00:00Z";

const red = (id: string): GenuineFeeRedemption => ({
  id,
  success_fee_charged: 30,
});

let rowSeq = 0;
const tx = (
  reference_id: string,
  transaction_type: string,
  amount: number | string,
  created_at = IN
): FeeLedgerRow => ({
  id: `tx${++rowSeq}`,
  reference_id,
  transaction_type,
  amount,
  created_at,
});

/** The common case: one genuine redemption, whatever movements are given. */
const totals = (
  ledger: FeeLedgerRow[],
  redemptions: GenuineFeeRedemption[] = [red("r1")],
  genuineReferenceIds = ["r1"]
) =>
  aggregateLedgerFees({
    redemptions,
    ledger,
    genuineReferenceIds,
    window: WINDOW,
  });

describe("the ledger contract is stated once and covers the whole CHECK", () => {
  /**
   * The CHECK constraint as the database holds it, taken from the migration
   * that last declared it. Parsed rather than retyped: a hand-copied list is a
   * second place for the type set to drift, and drift here means a new
   * transaction type silently contributing nothing to a money figure.
   */
  /**
   * The transaction types the database accepts, replayed from the migration
   * history rather than retyped.
   *
   * Follows the NAMED constraint through its events in order — every
   * `DROP CONSTRAINT merchant_transactions_transaction_type_check` and every
   * `ADD CONSTRAINT merchant_transactions_transaction_type_check … CHECK (…)`
   * — because three things all look like "a migration mentioning a CHECK" and
   * only one of them is a declaration:
   *
   * - A migration that DROPS the constraint and does not replace it leaves the
   *   column unconstrained. Picking "the last file whose text resembles a
   *   CHECK" would skip that file and keep parsing a superseded declaration,
   *   so the guard would pass while the live schema accepted anything.
   * - Several RPC bodies query `transaction_type IN ('success_fee', …)` as a
   *   fee predicate inside `$$ … $$`. That is a WHERE clause, not a constraint.
   * - A comment can contain either shape. Comments are stripped first.
   *
   * The last event wins, and a terminal drop is a failure rather than a silent
   * fallback to an older list.
   */
  const CONSTRAINT = "merchant_transactions_transaction_type_check";

  /** Strip `--` line comments and `/* *\/` blocks before matching anything. */
  const withoutSqlComments = (sql: string): string =>
    sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

  const constraintTypes = (): string[] => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const event = new RegExp(
      `(?:DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?${CONSTRAINT})` +
        `|(?:ADD\\s+CONSTRAINT\\s+${CONSTRAINT}\\s+CHECK\\s*\\(([\\s\\S]*?)\\)\\s*;)`,
      "gi"
    );

    let declared: string[] | null = null;
    let dropped = false;
    let events = 0;

    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = withoutSqlComments(
        readFileSync(path.join(dir, file), "utf8")
      );
      event.lastIndex = 0;
      for (let m = event.exec(sql); m !== null; m = event.exec(sql)) {
        events += 1;
        if (m[1] === undefined) {
          dropped = true;
          declared = null;
          continue;
        }
        dropped = false;
        declared = Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map((x) => x[1]);
      }
    }

    expect(events, `no migration touches ${CONSTRAINT}`).toBeGreaterThan(0);
    expect(
      dropped,
      `${CONSTRAINT} is dropped and never re-added — transaction_type is unconstrained`
    ).toBe(false);
    expect(declared, `${CONSTRAINT} has no surviving declaration`).not.toBeNull();
    expect(declared!.length).toBeGreaterThan(0);
    return declared!;
  };

  it("follows the constraint's last event, not the last file that mentions one", () => {
    // The replay must land on the 2026-07-22 declaration, which is the one that
    // added `fee_reversal`. Landing anywhere earlier means a later event was
    // missed; landing on a fee predicate inside an RPC body means the anchor is
    // wrong.
    expect(constraintTypes()).toContain("fee_reversal");
    expect(constraintTypes()).toContain("arrears_settlement");
  });

  it("ignores a CHECK-shaped line that is only a comment", () => {
    // The stripper is the thing under test here: a commented-out constraint is
    // not a constraint, and treating one as the live declaration would let a
    // reviewer's note redefine what the database accepts.
    const commented = withoutSqlComments(
      `-- ALTER TABLE t ADD CONSTRAINT ${CONSTRAINT} CHECK (transaction_type IN ('bogus'));\n` +
        `/* ALTER TABLE t DROP CONSTRAINT ${CONSTRAINT}; */\n` +
        `SELECT 1;`
    );
    expect(commented).not.toContain(CONSTRAINT);
    expect(commented).toContain("SELECT 1;");
  });

  it("decides every transaction type the database can hold", () => {
    // Not "covers the fee ones". Callers no longer filter by type, so every
    // type arrives at the aggregator and each needs a recorded decision. A new
    // type added to the database without one must fail HERE, in CI, rather
    // than quietly vanishing from a money figure in production.
    const inDb = constraintTypes().sort();
    expect(inDb.length).toBeGreaterThan(0);
    expect(Object.keys(LEDGER_TYPE_CONTRACT).sort()).toEqual(inDb);
  });

  it("declares no orientation for a type nothing has verified", () => {
    // `refund` and `dispute` have no verified sign in this repo. Filling the
    // shape with a guess would be inventing a money rule to satisfy a type.
    for (const [type, c] of Object.entries(LEDGER_TYPE_CONTRACT)) {
      if (c.bucket === "excluded") {
        expect(c, `${type} must not claim a sign`).not.toHaveProperty(
          "orientation"
        );
      } else {
        expect([1, -1], `${type} must declare its sign`).toContain(
          c.orientation
        );
      }
    }
  });

  it("keeps both billed legs in gross, with OPPOSITE orientations", () => {
    // The frozen rule is charged OR recorded as arrears, and arrears are owed
    // money rather than absent money. Counting only `success_fee` would
    // under-report exactly the merchants who ran out of balance — the
    // population the pilot watches most closely.
    expect(FEE_LEDGER_TYPES).toContain("success_fee");
    expect(FEE_LEDGER_TYPES).toContain("success_fee_arrears");
    expect(LEDGER_TYPE_CONTRACT.success_fee).toEqual({
      bucket: "gross",
      orientation: -1,
    });
    expect(LEDGER_TYPE_CONTRACT.success_fee_arrears).toEqual({
      bucket: "gross",
      orientation: 1,
    });
    // This is the whole reason sign cannot classify a row.
    expect(LEDGER_TYPE_CONTRACT.success_fee.orientation).not.toBe(
      LEDGER_TYPE_CONTRACT.success_fee_arrears.orientation
    );
  });

  it("derives the billed set from the contract instead of restating it", () => {
    expect([...FEE_LEDGER_TYPES].sort()).toEqual(
      Object.entries(LEDGER_TYPE_CONTRACT)
        .filter(([, c]) => c.bucket === "gross")
        .map(([t]) => t)
        .sort()
    );
  });
});

describe("REQUIRED PROOF 1 — a reversal cannot increase net fees", () => {
  it("subtracts the reversal from net", () => {
    const t = totals([tx("r1", "success_fee", -30), tx("r1", "fee_reversal", 30)]);
    expect(t.grossKes).toBe(30);
    expect(t.reversalsKes).toBe(30);
    expect(t.netKes).toBe(0);
  });

  it("never lets a reversal raise net above the fee-only figure", () => {
    const feeOnly = totals([tx("r1", "success_fee", -30)]);
    const reversed = totals([
      tx("r1", "success_fee", -30),
      tx("r1", "fee_reversal", 30),
    ]);
    expect(reversed.netKes!).toBeLessThan(feeOnly.netKes!);
    // The mutant this kills: `netKes: gross + reversals`. It would read 60 —
    // a fee that was given back, reported as double revenue.
    expect(reversed.netKes).not.toBe(60);
  });
});

describe("REQUIRED PROOF 2 — a reversal cannot increase gross fees", () => {
  it("leaves gross untouched by a reversal", () => {
    const feeOnly = totals([tx("r1", "success_fee", -30)]);
    const reversed = totals([
      tx("r1", "success_fee", -30),
      tx("r1", "fee_reversal", 30),
    ]);
    expect(reversed.grossKes).toBe(feeOnly.grossKes);
    // The mutant: `fee_reversal` given `bucket: "gross"`. It would read 60,
    // and `Math.abs` over the old billed set would have done exactly that had
    // the type ever been added to it.
    expect(reversed.grossKes).toBe(30);
  });

  it("reports gross zero and a reversal when only the credit is in window", () => {
    // The fee posted before the window, its reversal inside it. Gross for THIS
    // window is 0 and net is negative — money left in the period. Reporting a
    // reversal as gross would have shown 30 earned in a month that earned
    // nothing.
    const t = aggregateLedgerFees({
      redemptions: [],
      ledger: [
        tx("r1", "success_fee", -30, BEFORE),
        tx("r1", "fee_reversal", 30, IN),
      ],
      genuineReferenceIds: ["r1"],
      window: WINDOW,
    });
    expect(t.grossKes).toBe(0);
    expect(t.reversalsKes).toBe(30);
    expect(t.netKes).toBe(-30);
  });
});

describe("REQUIRED PROOF 3 — an arrears settlement is not newly generated fee", () => {
  it("counts a settlement in neither gross nor reversals", () => {
    const withSettlement = totals([
      tx("r1", "success_fee_arrears", 30),
      tx("r1", "fee_reversal", 30),
      tx("r1", "arrears_settlement", -30),
    ]);
    // The settlement moves an amount the arrears row already counted as
    // billed. In gross it would double the fee; in reversals it would subtract
    // a fee nobody reversed.
    expect(withSettlement.grossKes).toBe(30);
    expect(withSettlement.reversalsKes).toBe(30);
    expect(withSettlement.netKes).toBe(0);
  });

  it("does not let a settlement alone establish a fee", () => {
    // A settlement carrying a genuine reference_id with no fee row beside it:
    // the redemption's fee never posted, so gross is unknown, not 30 and not 0.
    const t = totals([tx("r1", "arrears_settlement", -30)]);
    expect(t.grossKes).toBeNull();
    expect(t.netKes).toBeNull();
  });

  it("keeps the settlement out of the contract's billed set", () => {
    expect(FEE_LEDGER_TYPES).not.toContain("arrears_settlement");
    expect(LEDGER_TYPE_CONTRACT.arrears_settlement.bucket).toBe("excluded");
  });
});

describe("REQUIRED PROOF 4 — a caller omitting its former type filter changes nothing", () => {
  it("returns the same three figures with every unrelated type present", () => {
    // The pre-D211 shape: each caller passed rows it had already narrowed with
    // `.in("transaction_type", FEE_LEDGER_TYPES)`. That filter was correctness
    // living in the caller. Handing the aggregator the UNFILTERED ledger must
    // produce the identical answer, or the caller was still carrying a rule.
    const feeRowsOnly = [
      tx("r1", "success_fee", -30),
      tx("r1", "fee_reversal", 30),
    ];
    const everything = [
      ...feeRowsOnly,
      tx("r1", "arrears_settlement", -30),
      tx("r1", "topup", 500),
      tx("r1", "boost_fee", -100),
      tx("r1", "subscription", -3500),
      tx("r1", "refund", 200),
      tx("r1", "dispute", -50),
    ];
    expect(totals(everything)).toEqual(totals(feeRowsOnly));
  });

  it("keeps neither surface's fee query, so there is no filter to omit", () => {
    // Structural, because the point is that the rule cannot live in a caller.
    for (const rel of [
      "src/app/admin/pilot/page.tsx",
      "src/app/founder/yesterday/page.tsx",
    ]) {
      const code = stripComments(
        readFileSync(path.join(process.cwd(), rel), "utf8")
      );
      expect(code, rel).toMatch(/readLedgerFeeTotals\(service, \{/);
      expect(code, rel).not.toMatch(/from\("merchant_transactions"\)/);
      expect(code, rel).not.toMatch(/transaction_type/);
      expect(code, rel).not.toMatch(/FEE_LEDGER_TYPES/);
    }
  });
});

describe("REQUIRED PROOF 5 — a generic magnitude rule cannot return", () => {
  it("does not normalise a wrong-signed fee row", () => {
    // `Math.abs` was never arithmetic here. It said "whatever sign this row
    // carries, treat it as billed" — which absorbs a row the money path could
    // not have written. A `success_fee` of +30 contradicts the live function's
    // `-p_amount`, so the figure is UNKNOWN. Under `Math.abs` it read 30.
    const t = totals([tx("r1", "success_fee", 30)]);
    expect(t.grossKes).toBeNull();
    expect(t.netKes).toBeNull();
    expect(t.grossKes).not.toBe(30);
  });

  it("does not normalise a wrong-signed reversal", () => {
    const t = totals([tx("r1", "success_fee", -30), tx("r1", "fee_reversal", -30)]);
    expect(t.reversalsKes).toBeNull();
    expect(t.netKes).toBeNull();
    // Gross is still established: blanking a figure that IS known would be its
    // own small lie.
    expect(t.grossKes).toBe(30);
  });

  it("refuses a zero-amount fee row, which neither RPC can write", () => {
    expect(totals([tx("r1", "success_fee", 0)]).grossKes).toBeNull();
  });

  it("reads the STORED amount and never recomputes it", () => {
    // A fee posted under a different rate must keep the amount the money path
    // actually wrote, or the page silently restates history the day KES 30
    // changes. Strings included: PostgREST returns numeric as text.
    const t = totals(
      [tx("r1", "success_fee", "-25"), tx("r2", "success_fee_arrears", "40")],
      [red("r1"), red("r2")],
      ["r1", "r2"]
    );
    expect(t.grossKes).toBe(65);
  });

  it("carries no generic magnitude call in the fee path", () => {
    const code = stripComments(
      readFileSync(path.join(process.cwd(), "src/lib/evidence-scope.ts"), "utf8")
    );
    expect(code).not.toMatch(/Math\.abs/);
  });
});

describe("REQUIRED PROOF 6 — the three figures cannot be mislabelled or swapped", () => {
  it("gives each figure a distinct label, from one source", () => {
    const labels = Object.values(FEE_FIGURE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    // "Success fees" unqualified is the D211 defect itself: a number a reader
    // takes as revenue with nothing saying which one it is.
    for (const l of labels) expect(l).not.toBe("Success fees");
    expect(FEE_FIGURE_LABELS.gross).toMatch(/gross/i);
    expect(FEE_FIGURE_LABELS.reversals).toMatch(/reversal/i);
    expect(FEE_FIGURE_LABELS.net).toMatch(/net/i);
  });

  it("prints every fee figure through the shared labels", () => {
    // A page that spells a label inline is a page whose words can stop matching
    // its arithmetic — which is precisely what D211 recorded.
    for (const rel of [
      "src/app/admin/pilot/page.tsx",
      "src/app/founder/yesterday/page.tsx",
    ]) {
      const code = stripComments(
        readFileSync(path.join(process.cwd(), rel), "utf8")
      );
      expect(code, rel).toMatch(/FEE_FIGURE_LABELS\.net/);
      expect(code, rel).toMatch(/FEE_FIGURE_LABELS\.gross/);
      expect(code, rel).toMatch(/FEE_FIGURE_LABELS\.reversals/);
      expect(code, rel).not.toMatch(/label="Success fees"/);
      expect(code, rel).not.toMatch(/Success fees \(\$\{days\}d\)/);
    }
  });

  it("RENDERS net as the cell's headline, with its components beneath", () => {
    // A source scan cannot see which figure a component actually prints. The
    // cell is the surface a reader looks at in both pilot tables, so a swap
    // here shows gross where net belongs — the D211 defect restored inside the
    // fix for it. Three different values, so an exchange cannot pass.
    const html = renderToStaticMarkup(
      h(FeeBreakdownCell, {
        totals: { grossKes: 100, reversalsKes: 30, netKes: 70 },
      })
    );
    const headline = html.slice(0, html.indexOf("<span", 1));
    expect(headline, "the leading figure must be NET").toContain("70");
    expect(headline, "gross must not lead the cell").not.toContain("100");
    // Both components still visible: a net figure with no visible components is
    // the same opaque number D211 opened against.
    expect(html).toContain("100");
    expect(html).toContain("30");
  });

  it("RENDERS an unavailable figure as a dash, never as zero", () => {
    const html = renderToStaticMarkup(
      h(FeeBreakdownCell, { totals: UNKNOWN_FEE_TOTALS })
    );
    expect(html).toContain("—");
    expect(html).not.toMatch(/KES\s*0/);
  });

  it("distinguishes the three figures by value, so a swap cannot pass", () => {
    // Three different numbers. A guard built on 30/0/30 would survive gross and
    // net being exchanged.
    const t = totals([
      tx("r1", "success_fee", -30),
      tx("r2", "success_fee_arrears", 70),
      tx("r1", "fee_reversal", 30),
    ], [red("r1"), red("r2")], ["r1", "r2"]);
    expect(t.grossKes).toBe(100);
    expect(t.reversalsKes).toBe(30);
    expect(t.netKes).toBe(70);
  });

  it("derives net from gross and reversals at every level", () => {
    // Row-level and total-level must satisfy the same identity, or a table can
    // print a total that contradicts the two figures beside it.
    const rows = [
      { grossKes: 100, reversalsKes: 30, netKes: 70 },
      { grossKes: 50, reversalsKes: 20, netKes: 30 },
    ];
    const t = sumFeeTotals(rows);
    expect(t.grossKes).toBe(150);
    expect(t.reversalsKes).toBe(50);
    expect(t.netKes).toBe(100);
    expect(t.netKes).toBe(t.grossKes! - t.reversalsKes!);
  });

  it("DERIVES the total's net rather than trusting any row's own net", () => {
    // A row whose net contradicts its own components cannot come out of
    // `aggregateLedgerFees` — but a hand-built row, a future caller or a
    // partially-migrated fixture can produce one, and summing a net column
    // would carry that contradiction into a printed total. Deriving means the
    // identity holds whatever arrives.
    const t = sumFeeTotals([
      { grossKes: 100, reversalsKes: 30, netKes: 999 },
      { grossKes: 50, reversalsKes: 20, netKes: -999 },
    ]);
    expect(t.grossKes).toBe(150);
    expect(t.reversalsKes).toBe(50);
    expect(t.netKes).toBe(100);
    expect(t.netKes).toBe(t.grossKes! - t.reversalsKes!);
  });

  it("keeps a summed net unknown when any component is unknown", () => {
    const t = sumFeeTotals([
      { grossKes: 100, reversalsKes: 30, netKes: 70 },
      { grossKes: 50, reversalsKes: null, netKes: null },
    ]);
    expect(t.grossKes).toBe(150);
    expect(t.reversalsKes).toBeNull();
    expect(t.netKes).toBeNull();
  });
});

describe("the window follows the ledger movement, not the redemption", () => {
  it("counts a reversal posted in the window against an older redemption", () => {
    // The requirement in one case. Windowing by the redemption's own date would
    // hide every correction made to older activity.
    const t = aggregateLedgerFees({
      redemptions: [],
      ledger: [tx("old", "fee_reversal", 30, IN)],
      genuineReferenceIds: ["old"],
      window: WINDOW,
    });
    expect(t.reversalsKes).toBe(30);
  });

  it("excludes a movement posted outside the window", () => {
    const t = aggregateLedgerFees({
      redemptions: [],
      ledger: [tx("old", "fee_reversal", 30, BEFORE)],
      genuineReferenceIds: ["old"],
      window: WINDOW,
    });
    expect(t.reversalsKes).toBe(0);
  });

  it("answers completeness from fee rows of ANY date", () => {
    // A redemption verified at 23:59:59 whose fee row lands at 00:00:00.1 the
    // next day is complete, not unknown. Manufacturing an unknown at a midnight
    // boundary would make a daily brief unreadable on exactly the days it
    // matters.
    const t = aggregateLedgerFees({
      redemptions: [red("r1")],
      ledger: [tx("r1", "success_fee", -30, "2026-09-01T00:00:00.100Z")],
      genuineReferenceIds: ["r1"],
      window: WINDOW,
    });
    // The fee is outside the window, so it adds nothing — but it does answer
    // "did this redemption's fee post".
    expect(t.grossKes).toBe(0);
    expect(t.netKes).toBe(0);
  });

  it("treats a timestamp it cannot PLACE as unknown, never as excluded", () => {
    // `Date.parse` and PostgreSQL do not agree on every valid `timestamptz`.
    // `infinity` is a real value the database orders above every bound and
    // would return from the open-ended `/admin/pilot` read, while
    // `Date.parse("infinity")` is NaN. Dropping such a row would understate a
    // money figure the database had already accepted — a quietly low number
    // presented as fact, which is the one direction this module never goes.
    for (const created_at of [null, "not-a-date", "infinity", "-infinity"]) {
      const t = aggregateLedgerFees({
        redemptions: [],
        ledger: [{ ...tx("r1", "fee_reversal", 30), created_at }],
        genuineReferenceIds: ["r1"],
        window: WINDOW,
      });
      expect(t.reversalsKes, `created_at = ${created_at}`).toBeNull();
      expect(t.netKes, `created_at = ${created_at}`).toBeNull();
    }
  });

  it("poisons only the bucket the unplaceable row belongs to", () => {
    const t = aggregateLedgerFees({
      redemptions: [],
      ledger: [
        tx("r1", "success_fee", -30),
        { ...tx("r1", "fee_reversal", 30), created_at: "infinity" },
      ],
      genuineReferenceIds: ["r1"],
      window: WINDOW,
    });
    expect(t.grossKes).toBe(30);
    expect(t.reversalsKes).toBeNull();
    expect(t.netKes).toBeNull();
  });

  it("still answers completeness from a row it cannot place", () => {
    // The fee posted; only WHEN is in doubt. Gross is unknown because the row
    // cannot be placed, not because the redemption looks unbilled — and the
    // distinction matters if the placement rule ever changes.
    const t = aggregateLedgerFees({
      redemptions: [red("r1")],
      ledger: [{ ...tx("r1", "success_fee", -30), created_at: "infinity" }],
      genuineReferenceIds: ["r1"],
      window: WINDOW,
    });
    expect(t.grossKes).toBeNull();
  });

  it("keeps a row the database legitimately placed outside the window excluded", () => {
    // `out` must stay distinct from `unknown`: the reader deliberately fetches
    // rows outside the window to answer completeness, and those must not
    // poison a total that is otherwise fully established.
    const t = aggregateLedgerFees({
      redemptions: [red("r1")],
      ledger: [tx("r1", "success_fee", -30, BEFORE)],
      genuineReferenceIds: ["r1"],
      window: WINDOW,
    });
    expect(t.grossKes).toBe(0);
    expect(t.netKes).toBe(0);
  });
});

/**
 * A faithful-enough PostgREST fake: it EVALUATES the filters it is given.
 *
 * Recording the calls would only prove a query was built. These tests are about
 * what the query lets through — above all that no transaction-type filter
 * survives anywhere, because `FEE_LEDGER_TYPES` holds only the two billed types
 * and a filter to it would drop every `fee_reversal` row before the aggregator
 * ever saw one. The reversal figure would then read 0 forever, on every
 * surface, and no source scan of the PAGES would notice: the defect would be
 * inside the shared reader they delegate to.
 */
function isoUtc(value: unknown): string {
  const s = String(value);
  expect(
    s,
    "this fake orders timestamps as strings, which is only correct for ISO-8601 UTC"
  ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  return s;
}

function fakeService(tables: Record<string, Record<string, unknown>[]>) {
  const seen: { table: string; column: string; op: string }[] = [];
  const get = (row: Record<string, unknown>, column: string): unknown =>
    column.split(".").reduce<unknown>(
      (v, part) => (v as Record<string, unknown> | null)?.[part],
      row
    );

  const build = (table: string, rows: Record<string, unknown>[]) => {
    let current = rows;
    const q = {
      eq(column: string, value: unknown) {
        seen.push({ table, column, op: "eq" });
        current = current.filter((r) => get(r, column) === value);
        return q;
      },
      in(column: string, values: readonly unknown[]) {
        seen.push({ table, column, op: "in" });
        current = current.filter((r) => values.includes(get(r, column)));
        return q;
      },
      gte(column: string, value: unknown) {
        seen.push({ table, column, op: "gte" });
        // Lexicographic ordering is only chronological for a FIXED ISO-UTC
        // shape. PostgREST could return `+00:00` instead of `Z`, or a
        // different fractional precision, and this fake would then order rows
        // differently from the real thing — the tests would be passing against
        // a fiction. So the shape is asserted rather than assumed.
        isoUtc(value);
        current = current.filter((r) => {
          const held = get(r, column);
          if (held == null) return false;
          return isoUtc(held) >= String(value);
        });
        return q;
      },
      lt(column: string, value: unknown) {
        seen.push({ table, column, op: "lt" });
        isoUtc(value);
        current = current.filter((r) => {
          const held = get(r, column);
          if (held == null) return false;
          return isoUtc(held) < String(value);
        });
        return q;
      },
      not(column: string, op: string, value: unknown) {
        seen.push({ table, column, op: `not.${op}` });
        if (op === "is" && value === null) {
          current = current.filter((r) => get(r, column) != null);
        }
        return q;
      },
      limit(n: number) {
        return Promise.resolve({ data: current.slice(0, n), error: null });
      },
    };
    return q;
  };

  return {
    seen,
    service: {
      from(table: string) {
        return { select: () => build(table, tables[table] ?? []) };
      },
    },
  };
}

/** A genuine-tagged redemption row as the join returns it. */
const genuineRedemption = (id: string) => ({
  id,
  success_fee_charged: 30,
  merchant_id: "m1",
  status: "success",
  is_demo: false,
  merchants: { is_demo: false, node: "bbs-mall" },
  deals: { is_demo: false },
});

describe("the shared reader lets a reversal through, and filters no type", () => {
  const setup = () =>
    fakeService({
      redemptions: [
        { ...genuineRedemption("r_new"), redeemed_at: IN },
        // Verified before the window; its reversal lands inside it.
        { ...genuineRedemption("r_old"), redeemed_at: BEFORE },
      ],
      merchant_transactions: [
        { id: "t1", merchant_id: "m1", reference_id: "r_new", transaction_type: "success_fee", amount: -30, created_at: IN },
        { id: "t2", merchant_id: "m1", reference_id: "r_old", transaction_type: "success_fee", amount: -30, created_at: BEFORE },
        { id: "t3", merchant_id: "m1", reference_id: "r_old", transaction_type: "fee_reversal", amount: 30, created_at: IN },
        { id: "t4", merchant_id: "m1", reference_id: "r_old", transaction_type: "arrears_settlement", amount: -30, created_at: IN },
        { id: "t5", merchant_id: "m1", reference_id: null, transaction_type: "topup", amount: 500, created_at: IN },
      ],
    });

  it("counts this window's fee and this window's reversal against an older redemption", async () => {
    const { service } = setup();
    const t = await readLedgerFeeTotals(service, {
      merchantIds: ["m1"],
      window: WINDOW,
    });
    // The old fee posted before the window, so it is not this window's gross.
    expect(t.grossKes).toBe(30);
    // Its reversal posted inside the window, so it IS this window's reversal.
    // A type filter to the billed set would have dropped it and read 0.
    expect(t.reversalsKes).toBe(30);
    expect(t.netKes).toBe(0);
  });

  it("applies no transaction_type filter anywhere in the read", async () => {
    const { service, seen } = setup();
    await readLedgerFeeTotals(service, { merchantIds: ["m1"], window: WINDOW });
    expect(seen.filter((f) => f.column === "transaction_type")).toEqual([]);
  });

  it("windows movements on created_at and redemptions on redeemed_at", async () => {
    const { service, seen } = setup();
    await readLedgerFeeTotals(service, { merchantIds: ["m1"], window: WINDOW });
    const ledgerWindow = seen.filter(
      (f) => f.table === "merchant_transactions" && f.column === "created_at"
    );
    expect(ledgerWindow.map((f) => f.op)).toEqual(["gte", "lt"]);
    const redemptionWindow = seen.filter(
      (f) => f.table === "redemptions" && f.column === "redeemed_at"
    );
    expect(redemptionWindow.map((f) => f.op)).toEqual(["gte", "lt"]);
  });

  it("keeps the D188 parent predicates on every redemption read", async () => {
    const { service, seen } = setup();
    await readLedgerFeeTotals(service, { merchantIds: ["m1"], window: WINDOW });
    for (const column of ["is_demo", "merchants.is_demo", "deals.is_demo"]) {
      expect(
        seen.some((f) => f.table === "redemptions" && f.column === column),
        `redemptions must be filtered on ${column}`
      ).toBe(true);
    }
  });

  it("drops a movement whose redemption is not genuine-tagged", async () => {
    const { service } = fakeService({
      redemptions: [
        {
          ...genuineRedemption("r_demo"),
          redeemed_at: IN,
          deals: { is_demo: true },
        },
      ],
      merchant_transactions: [
        { id: "t1", merchant_id: "m1", reference_id: "r_demo", transaction_type: "success_fee", amount: -30, created_at: IN },
      ],
    });
    const t = await readLedgerFeeTotals(service, {
      merchantIds: ["m1"],
      window: WINDOW,
    });
    // The ledger row carries nothing about its deal. Only the parent join can
    // see this, which is why the reader makes it and the aggregator trusts it.
    expect(t).toEqual({ grossKes: 0, reversalsKes: 0, netKes: 0 });
  });

  it("reports a true zero when the scope names nobody", async () => {
    const { service } = setup();
    const t = await readLedgerFeeTotals(service, {
      merchantIds: [],
      window: WINDOW,
    });
    expect(t).toEqual({ grossKes: 0, reversalsKes: 0, netKes: 0 });
  });
});

describe("the unknown states, none of which is zero", () => {
  it("keeps a failed read UNAVAILABLE, never zero (D164 / D185)", () => {
    // "KES 0" reads as "this merchant earned nothing", a conclusion
    // manufactured from an error. Any of the three inputs failing is enough.
    const base = { window: WINDOW };
    expect(
      aggregateLedgerFees({ ...base, redemptions: null, ledger: [], genuineReferenceIds: [] })
    ).toEqual(UNKNOWN_FEE_TOTALS);
    expect(
      aggregateLedgerFees({ ...base, redemptions: [], ledger: null, genuineReferenceIds: [] })
    ).toEqual(UNKNOWN_FEE_TOTALS);
    expect(
      aggregateLedgerFees({ ...base, redemptions: [], ledger: [], genuineReferenceIds: null })
    ).toEqual(UNKNOWN_FEE_TOTALS);
    expect(
      aggregateLedgerFees({ ...base, redemptions: [], ledger: [], genuineReferenceIds: [] })
    ).toEqual({ grossKes: 0, reversalsKes: 0, netKes: 0 });
  });

  it("reports a truncated read as unavailable rather than a low total (D149)", () => {
    const many = Array.from({ length: FEE_ROW_CAP }, (_, i) => red(`r${i}`));
    expect(
      aggregateLedgerFees({
        redemptions: many,
        ledger: [],
        genuineReferenceIds: [],
        window: WINDOW,
      })
    ).toEqual(UNKNOWN_FEE_TOTALS);
  });

  it("reports UNKNOWN gross when a genuine success produced no ledger entry", () => {
    // verify_redemption sets status = 'success' BEFORE the fee step and runs
    // that step inside an EXCEPTION handler that does not re-raise, so a failed
    // fee commits a successful redemption whose ledger row does not exist.
    const t = totals(
      [tx("r1", "success_fee", -30)],
      [red("r1"), red("r2")],
      ["r1", "r2"]
    );
    // Not 30 (a quietly low number presented as fact) and not 60 (revenue that
    // does not exist). Unknown.
    expect(t.grossKes).toBeNull();
    expect(t.netKes).toBeNull();
  });

  it("drops a movement pointing outside the genuine-tagged set (D188)", () => {
    // A ledger row carries nothing about its merchant or deal. Without the
    // parent join a fee against a demo-tagged deal lands in a figure whose
    // neighbours are all genuine-tagged — the D188 conflation in money form.
    const t = aggregateLedgerFees({
      redemptions: [],
      ledger: [tx("demo", "success_fee", -30), tx("demo", "fee_reversal", 30)],
      genuineReferenceIds: [],
      window: WINDOW,
    });
    expect(t).toEqual({ grossKes: 0, reversalsKes: 0, netKes: 0 });
  });

  it("ignores a movement with no reference_id at all", () => {
    const t = aggregateLedgerFees({
      redemptions: [],
      ledger: [{ ...tx("r1", "success_fee", -30), reference_id: null }],
      genuineReferenceIds: ["r1"],
      window: WINDOW,
    });
    expect(t.grossKes).toBe(0);
  });
});
