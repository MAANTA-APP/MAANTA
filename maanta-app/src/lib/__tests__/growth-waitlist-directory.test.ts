import { describe, it, expect } from "vitest";
import {
  attributionRollup,
  filterEntries,
  markDuplicates,
  segmentCounts,
  signupsByDay,
  toCsv,
  toWaitlistEntry,
} from "@/lib/growth/waitlist-directory";
import type { ResendContactSummary } from "@/lib/resend";

const summary = (over: Partial<ResendContactSummary> = {}): ResendContactSummary => ({
  id: "c1",
  email: "a@example.com",
  first_name: "A",
  last_name: "M",
  unsubscribed: false,
  created_at: "2026-09-04T08:00:00Z",
  ...over,
});

const props = (over: Record<string, unknown> = {}) => ({
  segment_type: "shopper",
  phone: "0712345678",
  node_interest: "BBS Mall",
  source_channel: "instagram",
  source_medium: "social",
  source_campaign: "node0-teaser",
  consent_at: "2026-09-04T08:00:00Z",
  ...over,
});

describe("waitlist directory — normalization", () => {
  it("normalizes a Kenyan number to E.164", () => {
    expect(toWaitlistEntry(summary(), props(), false).phone).toBe("+254712345678");
  });

  it("reads the segment only when it is a real segment", () => {
    expect(toWaitlistEntry(summary(), props(), false).segment).toBe("shopper");
    expect(toWaitlistEntry(summary(), props({ segment_type: "vip" }), false).segment).toBeNull();
  });

  it("flags a missing consent record", () => {
    const entry = toWaitlistEntry(summary(), props({ consent_at: undefined }), false);
    expect(entry.flags).toContain("no_consent");
  });

  // The distinction this module exists to preserve: "we could not read it" must
  // never render as "the field is empty", which would look like a compliance
  // defect nobody actually has.
  it("does not accuse an unreadable row of missing consent", () => {
    const entry = toWaitlistEntry(summary(), null, true);
    expect(entry.propertiesUnreadable).toBe(true);
    expect(entry.flags).not.toContain("no_consent");
    expect(entry.flags).not.toContain("unattributed");
  });

  it("reads the test marker and its label", () => {
    const entry = toWaitlistEntry(
      summary(),
      props({ is_test: true, test_label: "smoke-test" }),
      false
    );
    expect(entry.isTest).toBe(true);
    expect(entry.testLabel).toBe("smoke-test");
    expect(entry.flags).toContain("test");
  });

  it("treats an absent test marker as a real signup", () => {
    expect(toWaitlistEntry(summary(), props(), false).isTest).toBe(false);
  });
});

describe("waitlist directory — duplicates are found by phone", () => {
  it("flags both rows sharing a number, and leaves a unique one alone", () => {
    const entries = markDuplicates([
      toWaitlistEntry(summary({ id: "a" }), props(), false),
      toWaitlistEntry(summary({ id: "b", email: "b@example.com" }), props(), false),
      toWaitlistEntry(summary({ id: "c" }), props({ phone: "0722222222" }), false),
    ]);
    expect(entries[0].flags).toContain("duplicate");
    expect(entries[1].flags).toContain("duplicate");
    expect(entries[2].flags).not.toContain("duplicate");
  });

  it("does not treat two unreadable numbers as duplicates of each other", () => {
    const entries = markDuplicates([
      toWaitlistEntry(summary({ id: "a" }), null, true),
      toWaitlistEntry(summary({ id: "b" }), null, true),
    ]);
    expect(entries.every((e) => !e.flags.includes("duplicate"))).toBe(true);
  });
});

describe("waitlist directory — filtering", () => {
  const entries = [
    toWaitlistEntry(summary({ id: "real" }), props(), false),
    toWaitlistEntry(summary({ id: "test" }), props({ is_test: true }), false),
    toWaitlistEntry(
      summary({ id: "merchant" }),
      props({ segment_type: "merchant", source_channel: "whatsapp" }),
      false
    ),
  ];

  it("excludes test rows by default", () => {
    const ids = filterEntries(entries, { population: "real" }).map((e) => e.id);
    expect(ids).toEqual(["real", "merchant"]);
  });

  it("returns only test rows under Test", () => {
    expect(filterEntries(entries, { population: "test" }).map((e) => e.id)).toEqual(["test"]);
  });

  it("filters by segment and by source", () => {
    expect(
      filterEntries(entries, { population: "all", segment: "merchant" }).map((e) => e.id)
    ).toEqual(["merchant"]);
    expect(
      filterEntries(entries, { population: "all", source: "whatsapp" }).map((e) => e.id)
    ).toEqual(["merchant"]);
  });
});

describe("waitlist directory — roll-ups", () => {
  it("counts roles, and counts an unreadable role separately", () => {
    const counts = segmentCounts([
      toWaitlistEntry(summary({ id: "1" }), props(), false),
      toWaitlistEntry(summary({ id: "2" }), props({ segment_type: "merchant" }), false),
      toWaitlistEntry(summary({ id: "3" }), null, true),
    ]);
    expect(counts).toEqual({ shopper: 1, merchant: 1, mall_operator: 0, unknown: 1 });
  });

  it("buckets signups into a fixed window, oldest first", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const days = signupsByDay(
      [
        toWaitlistEntry(summary({ created_at: "2026-09-04T08:00:00Z" }), props(), false),
        toWaitlistEntry(summary({ created_at: "2026-09-03T08:00:00Z" }), props(), false),
      ],
      3,
      now
    );
    expect(days.map((d) => d.day)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(days[2].shopper).toBe(1);
    expect(days[1].shopper).toBe(1);
  });

  it("counts unattributed entries apart from attributed ones", () => {
    const rollup = attributionRollup([
      toWaitlistEntry(summary({ id: "1" }), props(), false),
      toWaitlistEntry(summary({ id: "2" }), props(), false),
      toWaitlistEntry(summary({ id: "3" }), props({ source_channel: undefined }), false),
    ]);
    expect(rollup.rows).toHaveLength(1);
    expect(rollup.rows[0].count).toBe(2);
    expect(rollup.unattributed).toBe(1);
  });
});

describe("waitlist directory — CSV", () => {
  it("quotes every cell and doubles inner quotes", () => {
    const csv = toCsv([toWaitlistEntry(summary({ first_name: 'A"B', last_name: null }), props(), false)]);
    expect(csv).toContain('"A""B"');
  });

  // A waitlist note is attacker-supplied free text, and this file gets opened in
  // Excel. A leading `=` there is a formula, not a name.
  it("neutralises a formula-shaped value so a spreadsheet reads it as text", () => {
    const csv = toCsv([
      toWaitlistEntry(summary({ first_name: "=cmd|'/c calc'!A1", last_name: null }), props(), false),
    ]);
    expect(csv).toContain("\"'=cmd");
    expect(csv).not.toContain('"=cmd');
  });

  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv([]);
    expect(csv.startsWith("joined_at,segment,name,email,phone")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
