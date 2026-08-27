import { describe, expect, it } from "vitest";
import {
  endingSoonDeals,
  NEAR_EXPIRY_MS,
  ENDING_SOON_LIMIT,
  ENDING_SOON_SUBTITLE,
} from "@/lib/ending-soon";
import { isNearExpiry } from "@/lib/ui";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString();
const deal = (id: string, msFromNow: number) => ({ id, expires_at: at(msFromNow) });

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
          { id: "null-expiry", expires_at: null },
          { id: "unparseable", expires_at: "not a date" },
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
    expect(endingSoonDeals([{ id: "x", expires_at: inside }]).length).toBe(1);
    expect(endingSoonDeals([{ id: "x", expires_at: outside }]).length).toBe(0);
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
