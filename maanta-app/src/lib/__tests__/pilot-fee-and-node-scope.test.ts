import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { genuineTagged } from "@/lib/evidence-scope";
import { externalCohortSize, NODE0_COHORT_MANIFEST } from "@/lib/pilot-cohort";
import { NODE_0, NODES, ALL_NODES } from "@/lib/nodes";

/**
 * Two Codex P2 findings on the Pilot Command Centre, guarded.
 *
 * **P2-1 — the fee KPI was on a different evidence scope from everything beside
 * it.** It read `merchant_transactions` filtered by `transaction_type` alone:
 * no redemption, deal or merchant scope at all. Every other figure in the same
 * table is genuine-tagged through the D188 parent chain, so a fee charged
 * against a demo-tagged redemption or deal appeared under a page that states
 * its counts are genuine-tagged. That is the D188 conflation in money form, and
 * money is the one column where a mixed number is read as revenue.
 *
 * **P2-2 — the cohort KPI described a different population from the rows below
 * it.** `externalCohortSize()` reads the Node 0 enrolment manifest, which
 * carries no node because there is nothing else it could be about; the merchant
 * rows and activity totals were filtered by `?node=`. Selecting CBD Galleria
 * therefore showed Node 0's enrolment count above CBD's activity — and once
 * Merchant 01 is enrolled, that renders BBS Mall's enrolment as if it were
 * another mall's.
 */

const pilotSource = () =>
  stripComments(
    readFileSync(
      path.join(process.cwd(), "src/app/admin/pilot/page.tsx"),
      "utf8"
    )
  );

/**
 * A filter recorder that can also EVALUATE what it recorded.
 *
 * Recording alone proves a call happened; it does not prove the call excludes
 * anything. These four cases are the whole point of P2-1, so they are asserted
 * against candidate rows rather than against a list of `.eq` arguments.
 */
function scopedQuery() {
  const filters: [string, unknown][] = [];
  const q = {
    filters,
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return q;
    },
  };
  return q;
}

/** Resolve a PostgREST-style dotted path (`merchants.is_demo`) on a row. */
function at(row: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>((v, k) => (v as Record<string, unknown> | null)?.[k], row);
}

/** Would a row survive every recorded filter? */
function admits(q: ReturnType<typeof scopedQuery>, row: unknown): boolean {
  return q.filters.every(([column, value]) => at(row, column) === value);
}

type Redemption = {
  is_demo: boolean;
  merchants: { is_demo: boolean };
  deals: { is_demo: boolean };
  success_fee_charged: number;
};

const redemption = (over: Partial<Redemption> = {}): Redemption => ({
  is_demo: false,
  merchants: { is_demo: false },
  deals: { is_demo: false },
  success_fee_charged: 30,
  ...over,
});

describe("P2-1 — pilot fees carry the genuine (D188) parent scope", () => {
  it("counts a fee whose redemption, merchant AND deal are all genuine", () => {
    const q = scopedQuery();
    genuineTagged(q);
    expect(admits(q, redemption())).toBe(true);
  });

  it("excludes a fee on a demo-tagged redemption", () => {
    const q = scopedQuery();
    genuineTagged(q);
    expect(admits(q, redemption({ is_demo: true }))).toBe(false);
  });

  it("excludes a fee whose MERCHANT parent is demo", () => {
    // The case the old ledger query could not see at all: the fee row itself
    // carries nothing about its merchant.
    const q = scopedQuery();
    genuineTagged(q);
    expect(admits(q, redemption({ merchants: { is_demo: true } }))).toBe(false);
  });

  it("excludes a fee whose DEAL parent is demo", () => {
    // The live production shape: a non-demo merchant can hold a demo deal, and
    // `claim_deal` never sets `redemptions.is_demo`, so redemption-level
    // tagging says genuine while the deal says otherwise.
    const q = scopedQuery();
    genuineTagged(q);
    expect(admits(q, redemption({ deals: { is_demo: true } }))).toBe(false);
  });

  /**
   * The arithmetic itself moved to `ledger-fee-semantics.test.ts` when D211
   * split the figure into gross, reversals and net. It is not duplicated here:
   * a second copy of the money rules is a second place for them to drift, which
   * is the mistake this whole file exists to guard. What stays here is the
   * QUERY shape — the D188 scope above, and the two structural guards below.
   */

  it("builds the pilot fee read from genuine redemptions, not the raw ledger", () => {
    // Asserted as structure, not as a token: an earlier guard in this PR used
    // `toContain("success_fee_charged")` and a mutation left the string alive
    // in a type annotation while the defect was fully restored.
    const code = pilotSource();
    // The page no longer builds the fee query at all. Every part of it — the
    // D188 parent chain, the reference_id link, the row cap and the ledger
    // contract — lives in `readLedgerFeeTotals`, so this asserts delegation
    // rather than re-asserting the query here in a second, drifting copy.
    expect(code).toMatch(/readLedgerFeeTotals\(service, \{/);
    expect(code).not.toMatch(/from\("merchant_transactions"\)/);
    // The type filter that used to sit here is the thing D211 removed: a
    // correctness rule in the caller, repeated at three call sites, none of
    // which had an opinion about a reversal.
    expect(code).not.toMatch(/transaction_type/);
    expect(code).not.toMatch(/FEE_LEDGER_TYPES/);
    // And no page-local reduction may return alongside it.
    expect(code).not.toMatch(/r\.amount \?\? 0/);
    expect(code).not.toMatch(/Math\.abs/);
  });

  it("windows the fee read on the ledger movement's own timestamp", () => {
    // D211: a reversal posted in the window against an older redemption belongs
    // to this window's reversals — that is when the money moved. Windowing it
    // by its redemption's date would hide every correction made to older
    // activity, which is exactly what a fee KPI exists to surface. The page
    // states the window and the reader applies it to `created_at`.
    expect(pilotSource()).toMatch(
      /readLedgerFeeTotals\(service, \{[\s\S]{0,120}?window: \{ since \}/
    );
  });
});

describe("P2-2 — the cohort KPI and the rows describe one node", () => {
  it("pins Node 0 to a real, live node in the registry", () => {
    const entry = NODES.find((n) => n.id === NODE_0);
    expect(entry, `NODE_0 (${NODE_0}) must exist in the node registry`).toBeDefined();
    expect(entry!.live).toBe(true);
    expect(NODE_0).not.toBe(ALL_NODES);
  });

  it("scopes the cohort query to Node 0 unconditionally", () => {
    // Previously `if (scoped) …`, so the default all-nodes view listed every
    // node's merchants beneath a Node 0 enrolment count.
    const code = pilotSource();
    expect(code).toMatch(/const node = NODE_0;/);
    expect(code).toMatch(/\.eq\("node", node\)/);
    expect(code).not.toMatch(/if \(scoped\)/);
  });

  it("offers no node switcher on this surface", () => {
    // The switcher was the defect, not a victim of it: this page's evidence
    // cards are read from the Node 0 manifest, so any other selection makes
    // the page describe two populations at once.
    const code = pilotSource();
    expect(code).not.toMatch(/nodeSwitcherTargets/);
    expect(code).not.toMatch(/resolveNodeParam/);
    expect(code).not.toMatch(/isNodeScoped/);
    expect(code).not.toMatch(/node=\$\{encodeURIComponent/);
  });

  it("does not read a node from the URL at all", () => {
    // A `?node=` that is accepted and then ignored is worse than one that is
    // absent: a bookmarked CBD link would render BBS data under a CBD address.
    expect(pilotSource()).not.toMatch(/searchParams\.node/);
    expect(pilotSource()).toMatch(/searchParams:\s*\{\s*window\?:\s*string\s*\}/);
  });

  it("says on the page which node it is fixed to", () => {
    const code = pilotSource();
    expect(code).toMatch(/Fixed to Node 0/);
    expect(code).toMatch(/nodeLabel\(node\)/);
  });

  it("never attributes enrolment to a node the manifest does not describe", () => {
    // The manifest is the Node 0 allow-list and carries no node column. The
    // guard against cross-node attribution is that the only surface rendering
    // its size is locked to Node 0 — asserted above — and that nobody quietly
    // gives the manifest a node of its own, which would be a hand-maintained
    // second copy of `merchants.node`, free to disagree with it silently.
    for (const entry of NODE0_COHORT_MANIFEST) {
      expect(entry).not.toHaveProperty("node");
    }
    // And it still fails closed: external is an allow-list, 0 until Merchant 01.
    expect(externalCohortSize()).toBe(
      NODE0_COHORT_MANIFEST.filter((e) => e.classification === "external").length
    );
  });
});

describe("P2-2 fallout — no copy survives that points at the removed control", () => {
  it("does not tell the reader to scope to a node", () => {
    // The row-cap notice used to end "scope to a node to narrow the cohort".
    // Locking the page to Node 0 removed that control, and an instruction
    // pointing at a control that no longer exists is its own small lie — the
    // reader goes looking for it and concludes the page is broken.
    const code = pilotSource();
    expect(code).not.toMatch(/scope to\s+a node/);
    expect(code).not.toMatch(/at this node/);
  });

  it("names Node 0 in the states a reader lands on when the table is short", () => {
    const code = pilotSource();
    expect(code).toMatch(/non-demo merchants at Node 0 yet/);
    expect(code).toMatch(/merchants at Node 0\./);
  });
});
