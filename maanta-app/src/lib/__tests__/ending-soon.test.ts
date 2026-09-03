import { describe, expect, it } from "vitest";
import {
  endingSoonDeals,
  isFullyClaimed,
  NEAR_EXPIRY_MS,
  ENDING_SOON_LIMIT,
  ENDING_SOON_SUBTITLE,
} from "@/lib/ending-soon";
import { isNearExpiry } from "@/lib/ui";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString();
/** Uncapped by default, so existing expiry cases keep testing only expiry. */
const deal = (
  id: string,
  msFromNow: number,
  cap: { max_claims: number | null; claims_issued: number } = {
    max_claims: null,
    claims_issued: 0,
  }
) => ({ id, expires_at: at(msFromNow), ...cap });

describe("Ending soon selects on real expiry and nothing else", () => {
  it("includes only deals inside the near-expiry threshold", () => {
    const picked = endingSoonDeals(
      [deal("in-10m", 10 * 60_000), deal("in-3h", 3 * 3600_000)],
      NOW
    );
    expect(picked.map((d) => d.id)).toEqual(["in-10m"]);
  });

  it("excludes deals that have already expired", () => {
    // A lapsed deal is not "ending soon", it is over — and surfacing it would
    // send a shopper to a claim they cannot make.
    expect(endingSoonDeals([deal("gone", -60_000)], NOW)).toEqual([]);
    expect(endingSoonDeals([deal("exactly-now", 0)], NOW)).toEqual([]);
  });

  it("includes the boundary and excludes just past it", () => {
    const picked = endingSoonDeals(
      [deal("on-boundary", NEAR_EXPIRY_MS), deal("just-outside", NEAR_EXPIRY_MS + 1000)],
      NOW
    );
    expect(picked.map((d) => d.id)).toEqual(["on-boundary"]);
  });

  it("orders by soonest first, deterministically", () => {
    const picked = endingSoonDeals(
      [deal("c", 50 * 60_000), deal("a", 5 * 60_000), deal("b", 20 * 60_000)],
      NOW
    );
    expect(picked.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by id so the order never wobbles between renders", () => {
    const picked = endingSoonDeals([deal("z", 600_000), deal("a", 600_000)], NOW);
    expect(picked.map((d) => d.id)).toEqual(["a", "z"]);
  });

  it("caps the section so it stays a glance", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      deal(`d${String(i).padStart(2, "0")}`, (i + 1) * 60_000)
    );
    expect(endingSoonDeals(many, NOW)).toHaveLength(ENDING_SOON_LIMIT);
  });

  it("returns empty rather than inventing something to show", () => {
    // The section renders nothing when nothing is genuinely ending. An
    // "Ending soon" rail that always has content is manufacturing urgency,
    // not reporting it.
    expect(endingSoonDeals([deal("later", 6 * 3600_000)], NOW)).toEqual([]);
    expect(endingSoonDeals([], NOW)).toEqual([]);
  });

  it("never treats an unusable expiry as urgent", () => {
    expect(
      endingSoonDeals(
        [
          { id: "null-expiry", expires_at: null, max_claims: null, claims_issued: 0 },
          { id: "unparseable", expires_at: "not a date", max_claims: null, claims_issued: 0 },
        ],
        NOW
      )
    ).toEqual([]);
  });
});

describe("one definition of urgency, not two", () => {
  it("agrees with the countdown chip's near-expiry rule", () => {
    // If these drifted, the feed would call a deal "ending soon" while its own
    // chip still rendered calm — two claims about one deal on one screen.
    // Real-clock relative on both sides: isNearExpiry() reads Date.now()
    // internally, so comparing it against a frozen NOW would compare two
    // different clocks and prove nothing about whether the rules agree.
    const inside = new Date(Date.now() + 30 * 60_000).toISOString();
    const outside = new Date(Date.now() + 90 * 60_000).toISOString();
    expect(isNearExpiry(inside)).toBe(true);
    expect(isNearExpiry(outside)).toBe(false);
    expect(endingSoonDeals([{ id: "x", expires_at: inside, max_claims: null, claims_issued: 0 }]).length).toBe(1);
    expect(endingSoonDeals([{ id: "x", expires_at: outside, max_claims: null, claims_issued: 0 }]).length).toBe(0);
  });

  it("uses the same 60-minute threshold the frozen rust state uses", () => {
    expect(NEAR_EXPIRY_MS).toBe(60 * 60 * 1000);
  });
});

describe("no fabricated urgency in the copy", () => {
  it("states the rule instead of shouting", () => {
    expect(ENDING_SOON_SUBTITLE).toMatch(/within the hour/i);
    expect(ENDING_SOON_SUBTITLE).not.toMatch(/!|hurry|last chance|don't miss|selling fast/i);
  });

  it("makes no claim about other shoppers", () => {
    // The product has no popularity signal, so any such claim would be invented.
    expect(ENDING_SOON_SUBTITLE).not.toMatch(/popular|trending|people|viewing|others|\bnearly gone\b/i);
  });
});

describe("Ending soon means the claim window is open, not merely expiring", () => {
  /**
   * `claim_deal`, read from production, refuses a capped deal outright:
   *
   *   IF v_deal.max_claims IS NOT NULL
   *      AND v_deal.claims_issued >= v_deal.max_claims THEN
   *     RAISE EXCEPTION 'deal_claim_limit_reached';
   *
   * The section subtitle promises "claim windows closing within the hour",
   * which is a stronger claim than "expires soon". A deal at its cap has no
   * claim window left to close, so advertising it sends a shopper to a claim
   * the database will refuse — and the deal page already renders that row as
   * "Fully claimed" with claiming disabled.
   *
   * `getLiveDeals` deliberately still returns capped deals (browsing one is
   * legitimate), so the exclusion belongs here, in the surface making the
   * stronger claim, not in the global live-deal contract.
   */
  const soon = 10 * 60_000;

  it("includes a deal under its cap", () => {
    const picked = endingSoonDeals([deal("has-room", soon, { max_claims: 10, claims_issued: 9 })], NOW);
    expect(picked.map((d) => d.id)).toEqual(["has-room"]);
  });

  it("excludes a deal exactly at its cap", () => {
    // The boundary the RPC uses is `>=`, so equality is already refused.
    expect(endingSoonDeals([deal("at-cap", soon, { max_claims: 10, claims_issued: 10 })], NOW)).toEqual([]);
  });

  it("excludes a deal over its cap", () => {
    // Defensive: a concurrent claim can overshoot a stale read.
    expect(endingSoonDeals([deal("over-cap", soon, { max_claims: 10, claims_issued: 11 })], NOW)).toEqual([]);
  });

  it("includes a deal with no cap at all", () => {
    // NULL max_claims is unlimited, never "zero allowed".
    const picked = endingSoonDeals([deal("uncapped", soon, { max_claims: null, claims_issued: 999 })], NOW);
    expect(picked.map((d) => d.id)).toEqual(["uncapped"]);
  });

  it("still excludes an under-cap deal outside the threshold", () => {
    // Room to claim is not urgency. The 60-minute rule is unchanged.
    expect(
      endingSoonDeals([deal("far-off", 3 * 3600_000, { max_claims: 10, claims_issued: 1 })], NOW)
    ).toEqual([]);
  });

  it("still excludes an expired deal, capped or not", () => {
    expect(
      endingSoonDeals(
        [
          deal("gone-uncapped", -60_000, { max_claims: null, claims_issued: 0 }),
          deal("gone-capped", -60_000, { max_claims: 10, claims_issued: 10 }),
        ],
        NOW
      )
    ).toEqual([]);
  });

  it("keeps soonest-first ordering once capped deals are dropped", () => {
    // The cap filter must not disturb the locked ordering of what remains.
    const picked = endingSoonDeals(
      [
        deal("third", 30 * 60_000, { max_claims: 5, claims_issued: 1 }),
        deal("capped", 1 * 60_000, { max_claims: 5, claims_issued: 5 }),
        deal("first", 5 * 60_000, { max_claims: null, claims_issued: 0 }),
        deal("second", 20 * 60_000, { max_claims: 5, claims_issued: 4 }),
      ],
      NOW
    );
    expect(picked.map((d) => d.id)).toEqual(["first", "second", "third"]);
  });
});

describe("the cap predicate matches claim_deal exactly", () => {
  it("treats a null cap as unlimited", () => {
    expect(isFullyClaimed({ max_claims: null, claims_issued: 10_000 })).toBe(false);
  });

  it("is >= and not >, so the cap itself is full", () => {
    expect(isFullyClaimed({ max_claims: 3, claims_issued: 2 })).toBe(false);
    expect(isFullyClaimed({ max_claims: 3, claims_issued: 3 })).toBe(true);
    expect(isFullyClaimed({ max_claims: 3, claims_issued: 4 })).toBe(true);
  });

  it("treats a zero cap as full rather than unlimited", () => {
    expect(isFullyClaimed({ max_claims: 0, claims_issued: 0 })).toBe(true);
  });
});
