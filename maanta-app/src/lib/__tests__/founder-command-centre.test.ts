import { describe, expect, it } from "vitest";
import {
  killCriterionClock,
  ladderPosition,
  pilotNextMove,
  tripwireReading,
  KILL_CRITERION_WEEKS,
  LADDER_RUNGS,
} from "@/lib/founder-command-centre";
import { MIN_CLAIMS_FOR_MERCHANT_RATIO } from "@/lib/pilot-command-centre";

describe("ladderPosition", () => {
  it("reports no rung at zero and the first rung as next", () => {
    expect(ladderPosition(0)).toEqual({ reached: null, next: 1 });
  });
  it("walks the rungs in order", () => {
    expect(ladderPosition(1)).toEqual({ reached: 1, next: 5 });
    expect(ladderPosition(4)).toEqual({ reached: 1, next: 5 });
    expect(ladderPosition(5)).toEqual({ reached: 5, next: 10 });
    expect(ladderPosition(12)).toEqual({ reached: 10, next: null });
  });
  it("treats an unread ladder as unknown, not zero", () => {
    expect(ladderPosition(null)).toEqual({ reached: null, next: LADDER_RUNGS[0] });
  });
});

describe("killCriterionClock", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  it("is not started until Merchant 01 has a live date", () => {
    expect(killCriterionClock(null, now).state).toBe("not_started");
  });
  it("counts weeks from the live date", () => {
    expect(killCriterionClock("2026-09-01", now)).toEqual({ state: "running", weeks: 0, label: `Week 1 of ${KILL_CRITERION_WEEKS}` });
    expect(killCriterionClock("2026-08-01", now).weeks).toBe(4);
  });
  it("reports elapsed after eight weeks and never a verdict", () => {
    const c = killCriterionClock("2026-06-01", now);
    expect(c.state).toBe("elapsed");
    expect(c.label).not.toMatch(/unsupported|fail|kill/i);
  });
});

describe("tripwireReading", () => {
  it("refuses to compute below the minimum sample", () => {
    expect(tripwireReading({ claims: MIN_CLAIMS_FOR_MERCHANT_RATIO - 1, successes: 1 }).state).toBe("not_computable");
    expect(tripwireReading({ claims: 1, successes: 1 }).ratio).toBeNull();
  });
  it("trips under roughly one in three", () => {
    expect(tripwireReading({ claims: 6, successes: 1 }).state).toBe("tripped");
    expect(tripwireReading({ claims: 6, successes: 2 }).state).toBe("clear");
  });
  it("treats a failed read as not computable, never as tripped", () => {
    expect(tripwireReading({ claims: null, successes: 0 }).state).toBe("not_computable");
  });
});

describe("pilotNextMove — the written sequence, not advice", () => {
  it("starts at Merchant 01 with nobody enrolled", () => {
    const m = pilotNextMove({ enrolled: 0, ladder: 0 });
    expect(m.title).toMatch(/Merchant 01/);
    expect(m.detail).toMatch(/no phone/);
    expect(m.requiresDemoOff).toBe(true);
  });
  it("moves to the first genuine success once enrolled", () => {
    expect(pilotNextMove({ enrolled: 1, ladder: 0 }).title).toMatch(/First genuine success/);
  });
  it("names the credit wall at rung 10 and never tells anyone to raise it", () => {
    const m = pilotNextMove({ enrolled: 1, ladder: 10 });
    expect(m.title).toMatch(/credit wall/);
    expect(m.detail).toMatch(/unprompted/);
    expect(pilotNextMove({ enrolled: 1, ladder: 6 }).detail).toMatch(/Nobody raises the wall/);
  });
  it("says so when the ladder is unreadable", () => {
    expect(pilotNextMove({ enrolled: 1, ladder: null }).title).toMatch(/unreadable/);
  });
});
