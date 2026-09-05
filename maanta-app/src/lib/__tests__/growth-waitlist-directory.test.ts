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

/** A `waitlist_signups` row, as PostgREST returns it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "a@example.com",
  full_name: "A M",
  phone: "+254712345678",
  segment: "shopper",
  node_interest: "BBS Mall",
  utm_source: "instagram",
  utm_medium: "social",
  utm_campaign: "node0-teaser",
  consent_at: "2026-09-04T08:00:00Z",
  is_test: false,
  test_label: null,
  properties_unreadable: false,
  unsubscribed: false,
  resend_synced_at: "2026-09-04T08:00:05Z",
  joined_at: "2026-09-04T08:00:00Z",
  created_at: "2026-09-04T08:00:01Z",
  ...over,
});

describe("waitlist directory — normalization", () => {
  it("maps a mirror row onto a console row", () => {
    const e = toWaitlistEntry(row());
    expect(e.phone).toBe("+254712345678");
    expect(e.segment).toBe("shopper");
    expect(e.source).toBe("instagram");
    expect(e.flags).toEqual([]);
  });

  it("reads the segment only when it is a real segment", () => {
    expect(toWaitlistEntry(row({ segment: "vip" })).segment).toBeNull();
  });

  it("flags a missing consent record", () => {
    expect(toWaitlistEntry(row({ consent_at: null })).flags).toContain("no_consent");
  });

  // The distinction the whole module exists to preserve: "we could not read it"
  // must never render as "they did not provide it", which would show a
  // compliance defect nobody actually has.
  it("does not accuse an unreadable row of missing consent or attribution", () => {
    const e = toWaitlistEntry(
      row({ properties_unreadable: true, consent_at: null, utm_source: null })
    );
    expect(e.flags).toContain("unreadable");
    expect(e.flags).not.toContain("no_consent");
    expect(e.flags).not.toContain("unattributed");
  });

  it("flags a row the sync has never confirmed", () => {
    expect(toWaitlistEntry(row({ resend_synced_at: null })).flags).toContain("unsynced");
  });

  it("treats an absent test marker as a real signup", () => {
    expect(toWaitlistEntry(row()).isTest).toBe(false);
    expect(toWaitlistEntry(row({ is_test: true, test_label: "smoke-test" })).testLabel).toBe(
      "smoke-test"
    );
  });

  // Resend's create response carries no created_at, and an already_exists row
  // may be months old — so an unread join date is null, never our own clock.
  it("keeps an unread join date null rather than substituting the record date", () => {
    const e = toWaitlistEntry(row({ joined_at: null }));
    expect(e.joinedAt).toBeNull();
    expect(e.recordedAt).toBe("2026-09-04T08:00:01Z");
  });
});

describe("waitlist directory — an opt-out is a signup you must not email (D267)", () => {
  it("flags an unsubscribed row and keeps it in the console", () => {
    const e = toWaitlistEntry(row({ unsubscribed: true }));
    expect(e.unsubscribed).toBe(true);
    expect(e.flags).toContain("unsubscribed");
    expect(filterEntries([e], { population: "real" })).toHaveLength(1);
    expect(filterEntries([e], { population: "real", unsubscribed: "include" })).toHaveLength(1);
  });

  it("drops an unsubscribed row only when asked to, which is what the export does", () => {
    const entries = [toWaitlistEntry(row({ unsubscribed: true })), toWaitlistEntry(row({ id: "2", email: "b@example.com", phone: null }))];
    const sendable = filterEntries(entries, { population: "real", unsubscribed: "exclude" });
    expect(sendable.map((e) => e.email)).toEqual(["b@example.com"]);
  });

  it("treats an absent flag as not opted out, matching the column default", () => {
    const legacy: Record<string, unknown> = row();
    delete legacy.unsubscribed;
    expect(toWaitlistEntry(legacy).unsubscribed).toBe(false);
  });

  it("writes the flag into the CSV so an included opt-out is visible in the file", () => {
    const csv = toCsv([toWaitlistEntry(row({ unsubscribed: true }))]);
    expect(csv.split("\r\n")[0]).toContain("unsubscribed");
    expect(csv).toContain('"true","unsubscribed"');
  });
});

describe("waitlist directory — duplicates are found by phone", () => {
  it("flags both rows sharing a number and leaves a unique one alone", () => {
    const entries = markDuplicates([
      toWaitlistEntry(row({ id: "a" })),
      toWaitlistEntry(row({ id: "b", email: "b@example.com" })),
      toWaitlistEntry(row({ id: "c", phone: "+254722222222" })),
    ]);
    expect(entries[0].flags).toContain("duplicate");
    expect(entries[1].flags).toContain("duplicate");
    expect(entries[2].flags).not.toContain("duplicate");
  });

  it("does not treat two missing numbers as duplicates of each other", () => {
    const entries = markDuplicates([
      toWaitlistEntry(row({ id: "a", phone: null })),
      toWaitlistEntry(row({ id: "b", phone: null })),
    ]);
    expect(entries.every((e) => !e.flags.includes("duplicate"))).toBe(true);
  });
});

describe("waitlist directory — filtering", () => {
  const entries = [
    toWaitlistEntry(row({ id: "real" })),
    toWaitlistEntry(row({ id: "test", is_test: true })),
    toWaitlistEntry(row({ id: "merchant", segment: "merchant", utm_source: "whatsapp" })),
  ];

  it("excludes test rows by default", () => {
    expect(filterEntries(entries, { population: "real" }).map((e) => e.id)).toEqual([
      "real",
      "merchant",
    ]);
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
    expect(
      segmentCounts([
        toWaitlistEntry(row({ id: "1" })),
        toWaitlistEntry(row({ id: "2", segment: "merchant" })),
        toWaitlistEntry(row({ id: "3", segment: null })),
      ])
    ).toEqual({ shopper: 1, merchant: 1, mall_operator: 0, unknown: 1 });
  });

  it("buckets signups by their Resend join date, oldest first", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const { buckets } = signupsByDay(
      [
        toWaitlistEntry(row({ id: "1", joined_at: "2026-09-04T08:00:00Z" })),
        toWaitlistEntry(row({ id: "2", joined_at: "2026-09-03T08:00:00Z" })),
      ],
      3,
      now
    );
    expect(buckets.map((d) => d.day)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(buckets[2].shopper).toBe(1);
    expect(buckets[1].shopper).toBe(1);
  });

  // Dropping these silently is how a person disappears from a figure with
  // nothing on screen admitting it.
  it("counts people with no join date instead of silently dropping them", () => {
    const { buckets, unknownJoinDate } = signupsByDay(
      [
        toWaitlistEntry(row({ id: "1", joined_at: null, resend_synced_at: null })),
        toWaitlistEntry(row({ id: "2", joined_at: "2026-09-04T08:00:00Z" })),
      ],
      3,
      new Date("2026-09-04T12:00:00Z")
    );
    expect(unknownJoinDate).toBe(1);
    expect(buckets.reduce((n, d) => n + d.shopper, 0)).toBe(1);
  });

  it("counts unattributed entries apart from attributed ones", () => {
    const rollup = attributionRollup([
      toWaitlistEntry(row({ id: "1" })),
      toWaitlistEntry(row({ id: "2" })),
      toWaitlistEntry(row({ id: "3", utm_source: null })),
    ]);
    expect(rollup.rows).toHaveLength(1);
    expect(rollup.rows[0].count).toBe(2);
    expect(rollup.unattributed).toBe(1);
  });
});

describe("waitlist directory — CSV", () => {
  it("quotes every cell and doubles inner quotes", () => {
    expect(toCsv([toWaitlistEntry(row({ full_name: 'A"B' }))])).toContain('"A""B"');
  });

  // A waitlist name is attacker-supplied free text, and this file gets opened
  // in Excel. A leading `=` there is a formula, not a name.
  it("neutralises a formula-shaped value so a spreadsheet reads it as text", () => {
    const csv = toCsv([toWaitlistEntry(row({ full_name: "=cmd|'/c calc'!A1" }))]);
    expect(csv).toContain("\"'=cmd");
    expect(csv).not.toContain('"=cmd');
  });

  it("leaves an unread join date empty rather than fabricating one", () => {
    const csv = toCsv([toWaitlistEntry(row({ joined_at: null }))]);
    expect(csv.split("\r\n")[1].startsWith('"",')).toBe(true);
  });

  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv([]);
    expect(csv.startsWith("joined_at,recorded_at,segment,name,email,phone")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
