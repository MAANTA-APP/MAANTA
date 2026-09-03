import { describe, expect, it } from "vitest";
import {
  visitStage,
  countStages,
  reachedColumns,
  minutesSinceArrival,
  VISIT_STAGE_META,
  FUNNEL_COLUMNS,
} from "@/lib/visit-funnel";

const now = new Date("2026-09-03T12:00:00Z");
const later = "2026-09-03T14:00:00Z";
const earlier = "2026-09-03T11:00:00Z";

describe("visitStage — a claim is not an arrival is not a redemption", () => {
  it("a pending claim with no arrival is claimed", () => {
    expect(visitStage({ status: "pending", expires_at: later }, now)).toBe("claimed");
  });

  it("a QR check-in is arrived, not redeemed", () => {
    expect(visitStage({ status: "pending", expires_at: later, arrived_at: earlier }, now)).toBe("arrived");
  });

  it("a waiting, unexpired queue row is in_queue, not redeemed", () => {
    expect(
      visitStage(
        {
          status: "pending",
          expires_at: later,
          arrived_at: earlier,
          merchant_presentations: [{ status: "waiting", expires_at: later }],
        },
        now
      )
    ).toBe("in_queue");
  });

  it("a lapsed or dismissed queue row falls back to arrived", () => {
    expect(
      visitStage(
        {
          status: "pending",
          expires_at: later,
          arrived_at: earlier,
          merchant_presentations: [{ status: "waiting", expires_at: earlier }],
        },
        now
      )
    ).toBe("arrived");
    expect(
      visitStage(
        {
          status: "pending",
          expires_at: later,
          arrived_at: earlier,
          merchant_presentations: [{ status: "dismissed", expires_at: later }],
        },
        now
      )
    ).toBe("arrived");
  });

  it("only success is redeemed; flagged is held; failed is rejected", () => {
    expect(visitStage({ status: "success", expires_at: earlier }, now)).toBe("redeemed");
    expect(visitStage({ status: "flagged", expires_at: later }, now)).toBe("held");
    expect(visitStage({ status: "failed", expires_at: later }, now)).toBe("rejected");
  });

  it("a terminal status wins over arrival and queue evidence", () => {
    expect(
      visitStage(
        {
          status: "success",
          expires_at: later,
          arrived_at: earlier,
          merchant_presentations: [{ status: "waiting", expires_at: later }],
        },
        now
      )
    ).toBe("redeemed");
  });

  it("an expired pending ticket is expired even with a stale queue row", () => {
    expect(
      visitStage(
        {
          status: "pending",
          expires_at: earlier,
          arrived_at: earlier,
          merchant_presentations: [{ status: "waiting", expires_at: later }],
        },
        now
      )
    ).toBe("expired");
  });
});

describe("funnel presentation", () => {
  it("marks exactly one stage as the money event", () => {
    const money = Object.entries(VISIT_STAGE_META).filter(([, m]) => m.money).map(([k]) => k);
    expect(money).toEqual(["redeemed"]);
  });

  it("gives every stage an icon and a word", () => {
    for (const m of Object.values(VISIT_STAGE_META)) {
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(1);
    }
  });

  it("keeps the five physical columns in order", () => {
    expect(FUNNEL_COLUMNS.map((c) => c.id)).toEqual([
      "claim",
      "arrival",
      "queue",
      "verification",
      "redemption",
    ]);
  });
});

describe("counts", () => {
  const rows = [
    { status: "pending", expires_at: later },
    { status: "pending", expires_at: later, arrived_at: earlier },
    {
      status: "pending",
      expires_at: later,
      arrived_at: earlier,
      merchant_presentations: [{ status: "waiting", expires_at: later }],
    },
    { status: "success", expires_at: later, arrived_at: earlier, merchant_presentations: [{ status: "waiting", expires_at: earlier }] },
    { status: "success", expires_at: later },
    { status: "failed", expires_at: later },
    { status: "flagged", expires_at: later },
    { status: "pending", expires_at: earlier },
  ];

  it("places each row in exactly one stage", () => {
    const c = countStages(rows, now);
    expect(c).toEqual({
      claimed: 1,
      arrived: 1,
      in_queue: 1,
      held: 1,
      rejected: 1,
      redeemed: 2,
      expired: 1,
    });
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it("reads cumulative reach from each column's own evidence", () => {
    const r = reachedColumns(rows, now);
    expect(r.claim).toBe(8);
    expect(r.arrival).toBe(3); // three rows carry arrived_at
    expect(r.queue).toBe(2); // two rows ever had a queue row
    expect(r.verification).toBe(4); // held + rejected + 2 redeemed
    expect(r.redemption).toBe(2);
    // A keypad redemption with no QR scan is a redemption with no arrival —
    // true, and reach must say so rather than inferring an arrival.
    expect(r.arrival).toBeLessThan(r.verification);
  });
});

describe("minutesSinceArrival", () => {
  it("measures only arrived-or-queued pending rows", () => {
    expect(minutesSinceArrival({ status: "pending", expires_at: later, arrived_at: earlier }, now)).toBe(60);
    expect(minutesSinceArrival({ status: "success", expires_at: later, arrived_at: earlier }, now)).toBeNull();
    expect(minutesSinceArrival({ status: "pending", expires_at: later }, now)).toBeNull();
  });
});
