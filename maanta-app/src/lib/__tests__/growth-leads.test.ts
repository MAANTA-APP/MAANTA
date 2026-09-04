import { describe, it, expect } from "vitest";
import { RESPONSE_TIMES } from "@/lib/marketing/facts";
import {
  businessDaysElapsed,
  isOverdue,
  leadAddress,
  leadAgeLabel,
  onboardingStepsLeft,
  pipelineFrom,
  coverageByFloor,
  LEAD_REPLY_SLA_BUSINESS_DAYS,
  type MerchantLead,
} from "@/lib/growth/leads";

const lead = (over: Partial<MerchantLead> = {}): MerchantLead => ({
  id: "l1",
  floor: "GF",
  unit: "12",
  category: "Kids' shoes",
  contactName: "J. K.",
  contactPhone: null,
  stage: "new",
  lostReason: null,
  agentUserId: null,
  visitAt: null,
  accountCreated: false,
  staffAdded: false,
  walletToppedUp: false,
  isTest: false,
  createdAt: "2026-09-01T08:00:00Z", // a Tuesday
  firstContactedAt: null,
  ...over,
});

describe("leads — the SLA is the published promise, not an internal target", () => {
  it("reads its threshold out of the copy the site actually shows", () => {
    expect(RESPONSE_TIMES.form).toBe("1 business day");
    expect(LEAD_REPLY_SLA_BUSINESS_DAYS).toBe(1);
  });
});

describe("leads — business days skip the weekend", () => {
  it("counts a plain weekday gap", () => {
    // Tue 08:00 -> Thu 08:00 is two business days.
    expect(
      businessDaysElapsed("2026-09-01T08:00:00Z", new Date("2026-09-03T08:00:00Z"))
    ).toBeCloseTo(2, 5);
  });

  // The reason this function exists: a naive 24-hour clock marks every
  // Friday-afternoon lead overdue on Sunday, and an alert that cries wolf every
  // weekend is one the operator learns to ignore.
  it("does not age a lead across Saturday and Sunday", () => {
    // Fri 2026-09-04 12:00 -> Sun 2026-09-06 12:00 is half a business day.
    expect(
      businessDaysElapsed("2026-09-04T12:00:00Z", new Date("2026-09-06T12:00:00Z"))
    ).toBeCloseTo(0.5, 5);
  });

  it("resumes on Monday", () => {
    // Fri 12:00 -> Mon 12:00 is half of Friday plus half of Monday: the two
    // weekend days contribute nothing, so it is 1.0, not the 3.0 a wall clock
    // would give.
    expect(
      businessDaysElapsed("2026-09-04T12:00:00Z", new Date("2026-09-07T12:00:00Z"))
    ).toBeCloseTo(1, 5);
  });

  it("never returns a negative age for a future timestamp", () => {
    expect(businessDaysElapsed("2026-09-10T08:00:00Z", new Date("2026-09-01T08:00:00Z"))).toBe(0);
  });
});

describe("leads — overdue", () => {
  it("marks a new lead past the promise", () => {
    expect(isOverdue(lead(), new Date("2026-09-03T09:00:00Z"))).toBe(true);
  });

  it("leaves a lead inside the promise alone", () => {
    expect(isOverdue(lead(), new Date("2026-09-01T20:00:00Z"))).toBe(false);
  });

  // The promise is about the FIRST reply. Once someone has replied, the lead can
  // be slow but it can no longer be a broken promise.
  it("never marks a contacted lead overdue", () => {
    expect(
      isOverdue(lead({ stage: "contacted" }), new Date("2026-10-01T09:00:00Z"))
    ).toBe(false);
    expect(
      isOverdue(
        lead({ firstContactedAt: "2026-09-01T09:00:00Z" }),
        new Date("2026-10-01T09:00:00Z")
      )
    ).toBe(false);
  });

  it("never marks a lost lead overdue", () => {
    expect(
      isOverdue(
        lead({ stage: "lost", lostReason: "unit_vacant" }),
        new Date("2026-10-01T09:00:00Z")
      )
    ).toBe(false);
  });
});

describe("leads — identity and presentation", () => {
  it("addresses a lead by floor and unit, never by a name", () => {
    expect(leadAddress(lead())).toBe("GF · Unit 12");
  });

  it("shows hours under a day and days above it", () => {
    expect(leadAgeLabel(lead(), new Date("2026-09-01T12:00:00Z"))).toBe("4h");
    expect(leadAgeLabel(lead(), new Date("2026-09-03T08:00:00Z"))).toBe("2d");
  });

  it("counts outstanding onboarding steps", () => {
    expect(onboardingStepsLeft(lead())).toBe(3);
    expect(onboardingStepsLeft(lead({ accountCreated: true, staffAdded: true }))).toBe(1);
  });
});

describe("leads — the board", () => {
  it("pins overdue leads to the top of their stage", () => {
    const fresh = lead({ id: "fresh", unit: "08", createdAt: "2026-09-03T08:00:00Z" });
    const late = lead({ id: "late", unit: "12", createdAt: "2026-09-01T08:00:00Z" });
    const board = pipelineFrom([fresh, late]);
    const newColumn = board.find((c) => c.stage === "new");
    expect(newColumn?.leads[0].id).toBe("late");
  });

  it("returns every stage, including the empty ones", () => {
    const board = pipelineFrom([]);
    expect(board.map((c) => c.stage)).toEqual([
      "new",
      "contacted",
      "visit_booked",
      "onboarding",
      "ready_to_publish",
      "lost",
    ]);
    expect(board.every((c) => c.count === 0)).toBe(true);
  });

  it("excludes lost leads from floor coverage", () => {
    const coverage = coverageByFloor([
      lead({ floor: "GF" }),
      lead({ floor: "GF", stage: "lost", lostReason: "unit_vacant" }),
      lead({ floor: "2F" }),
    ]);
    expect(coverage).toEqual({ GF: 1, "1F": 0, "2F": 1 });
  });
});
