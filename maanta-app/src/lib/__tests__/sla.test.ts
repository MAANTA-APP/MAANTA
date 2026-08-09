import { describe, it, expect } from "vitest";
import {
  SUPPORT_SLA_HOURS,
  SUPPORT_SLA_DUE_SOON_HOURS,
  computeSla,
  slaDeadline,
  slaAgeHours,
  resolvedAtFromAuditLine,
} from "../sla";

/**
 * D81 — the 72-hour support SLA clock (founder ruling 2026-08-09).
 *
 * Everything here runs on fixed timestamps passed in explicitly — computeSla
 * takes `now` as an argument and has no wall-clock default — so nothing in
 * this suite can flake with the machine clock.
 */

const OPENED = "2026-08-01T10:00:00.000Z";
const DEADLINE = "2026-08-04T10:00:00.000Z"; // exactly +72h
const at = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;
const hoursAfterOpen = (n: number) => new Date(new Date(OPENED).getTime() + n * HOUR);

describe("D81 support SLA clock", () => {
  it("keeps the frozen thresholds: a 72-hour promise, a 24-hour internal warning", () => {
    expect(SUPPORT_SLA_HOURS).toBe(72);
    expect(SUPPORT_SLA_DUE_SOON_HOURS).toBe(24);
  });

  it("puts the deadline exactly 72 hours after the case entered its queue", () => {
    expect(slaDeadline(OPENED).toISOString()).toBe(DEADLINE);
    expect(computeSla(OPENED, { now: at(OPENED) }).deadline.toISOString()).toBe(DEADLINE);
  });

  it("is on track with the full window ahead", () => {
    const sla = computeSla(OPENED, { now: hoursAfterOpen(1) });
    expect(sla.state).toBe("on_track");
    expect(sla.label).toBe("Due in 71 hours");
  });

  it("turns due-soon at 24 hours remaining or less — never earlier", () => {
    // 24h + 1min remaining: still on track.
    const before = computeSla(OPENED, {
      now: new Date(new Date(DEADLINE).getTime() - 24 * HOUR - 60_000),
    });
    expect(before.state).toBe("on_track");
    expect(before.label).toBe("Due in 25 hours");

    // Exactly 24h remaining: due soon.
    const boundary = computeSla(OPENED, {
      now: new Date(new Date(DEADLINE).getTime() - 24 * HOUR),
    });
    expect(boundary.state).toBe("due_soon");
    expect(boundary.label).toBe("Due in 24 hours");

    // 9h remaining, written out in full — no "in 9 h…" truncation.
    const inside = computeSla(OPENED, {
      now: new Date(new Date(DEADLINE).getTime() - 9 * HOUR),
    });
    expect(inside.state).toBe("due_soon");
    expect(inside.label).toBe("Due in 9 hours");
  });

  it("goes overdue past the deadline, with the hours written out", () => {
    const sla = computeSla(OPENED, { now: hoursAfterOpen(78) });
    expect(sla.state).toBe("overdue");
    expect(sla.label).toBe("Overdue by 6 hours");
  });

  it("resolves on time within 72 hours — the boundary itself is on time", () => {
    const early = computeSla(OPENED, { resolvedAt: hoursAfterOpen(71), now: hoursAfterOpen(100) });
    expect(early.state).toBe("resolved_on_time");
    expect(early.label).toBe("Resolved in 71 hours");

    const boundary = computeSla(OPENED, { resolvedAt: at(DEADLINE), now: hoursAfterOpen(100) });
    expect(boundary.state).toBe("resolved_on_time");
    expect(boundary.label).toBe("Resolved in 72 hours");
  });

  it("resolves late past 72 hours and stays observable as late", () => {
    const sla = computeSla(OPENED, { resolvedAt: hoursAfterOpen(80), now: hoursAfterOpen(200) });
    expect(sla.state).toBe("resolved_late");
    expect(sla.label).toBe("Resolved in 80 hours");
    // The verdict is a pure function of opened/resolved — re-rendering later
    // never softens a missed commitment.
    const later = computeSla(OPENED, { resolvedAt: hoursAfterOpen(80), now: hoursAfterOpen(999) });
    expect(later.state).toBe("resolved_late");
  });

  it("starts a case raised on an old redemption at zero operational hours", () => {
    // The redemption is five days old; the case enters its queue at OPENED.
    // The clock keys on queue entry, so at entry the full 72 hours remain and
    // the age is zero — the old redemption timestamp plays no part.
    const oldRedemption = "2026-07-27T10:00:00.000Z";
    const sla = computeSla(OPENED, { now: at(OPENED) });
    expect(sla.state).toBe("on_track");
    expect(sla.label).toBe("Due in 72 hours");
    expect(slaAgeHours(OPENED, at(OPENED))).toBe(0);
    expect(sla.deadline.getTime() - at(OPENED).getTime()).toBe(72 * HOUR);
    expect(sla.deadline.getTime()).not.toBe(slaDeadline(oldRedemption).getTime());
  });

  it("never resets: start and deadline are stable across renders and reassignment", () => {
    // computeSla's only inputs are openedAt, resolvedAt and now — assignment,
    // viewing, retrying and refreshing are not inputs, so they cannot move the
    // clock. Different render instants agree on the same deadline.
    const first = computeSla(OPENED, { now: hoursAfterOpen(2) });
    const second = computeSla(OPENED, { now: hoursAfterOpen(50) });
    expect(first.deadline.toISOString()).toBe(second.deadline.toISOString());
    expect(first.deadline.toISOString()).toBe(DEADLINE);
  });

  it("parses the override audit line, and returns null rather than guessing", () => {
    const line = `[override by admin user-1 at 2026-08-02T09:30:00.000Z]`;
    expect(resolvedAtFromAuditLine(`Original description\n${line}`)).toBe(
      "2026-08-02T09:30:00.000Z"
    );
    expect(resolvedAtFromAuditLine("No audit line here")).toBeNull();
    expect(resolvedAtFromAuditLine(null)).toBeNull();
    expect(resolvedAtFromAuditLine("[override by admin u at not-a-date]")).toBeNull();
  });
});
