import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { summariseAgentLeads, lockHoursLeft } from "@/lib/agent-summary";

const NOW = Date.parse("2026-08-16T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 24 * 3600_000).toISOString();

describe("summariseAgentLeads", () => {
  it("counts every lead status, not just the interesting ones", () => {
    const s = summariseAgentLeads(
      [
        { status: "locked", created_at: daysAgo(1) },
        { status: "converted", created_at: daysAgo(2) },
        { status: "converted", created_at: daysAgo(3) },
        { status: "expired", created_at: daysAgo(4) },
        { status: "lost", created_at: daysAgo(5) },
      ],
      NOW
    );
    expect(s).toMatchObject({ total: 5, locked: 1, converted: 2, expired: 1, lost: 1 });
  });

  it("reads the weekly figure against the trailing 7 days", () => {
    const s = summariseAgentLeads(
      [
        { status: "converted", created_at: daysAgo(1) },
        { status: "converted", created_at: daysAgo(6) },
        // Outside the window — counts toward all-time, not toward the target.
        { status: "converted", created_at: daysAgo(9) },
      ],
      NOW
    );
    expect(s.convertedThisWeek).toBe(2);
    expect(s.converted).toBe(3);
  });

  it("returns a null conversion rate with no leads, rather than asserting 0%", () => {
    // "0% conversion" is a claim about performance; "no leads yet" is the truth.
    const s = summariseAgentLeads([], NOW);
    expect(s.conversionRate).toBeNull();
    expect(s.total).toBe(0);
  });

  it("computes the rate over all leads once there are any", () => {
    const s = summariseAgentLeads(
      [
        { status: "converted", created_at: daysAgo(1) },
        { status: "lost", created_at: daysAgo(1) },
        { status: "locked", created_at: daysAgo(1) },
        { status: "expired", created_at: daysAgo(1) },
      ],
      NOW
    );
    expect(s.conversionRate).toBe(0.25);
  });

  it("ignores a status it does not know instead of miscounting it", () => {
    const s = summariseAgentLeads([{ status: "something_new", created_at: daysAgo(1) }], NOW);
    expect(s.total).toBe(1);
    expect(s.locked + s.converted + s.expired + s.lost).toBe(0);
  });
});

describe("lockHoursLeft", () => {
  it("rounds to whole hours", () => {
    expect(lockHoursLeft(new Date(NOW + 36 * 3600_000).toISOString(), NOW)).toBe(36);
  });

  it("floors at zero — an elapsed lock is not negative hours", () => {
    // The row keeps status 'locked' until something expires it, so the screen
    // must not render "Locked -3h".
    expect(lockHoursLeft(new Date(NOW - 3 * 3600_000).toISOString(), NOW)).toBe(0);
  });
});

describe("the agents list opens the detail screen", () => {
  it("links each agent row to its own page", () => {
    // The ask was to click through from the list; the rows were plain divs.
    const list = readFileSync(
      path.resolve(__dirname, "..", "..", "app", "admin", "agents", "page.tsx"),
      "utf8"
    );
    expect(list).toContain("href={`/admin/agents/${a.id}`}");
  });

  it("shows the agent's assisted merchants, which nothing else surfaced", () => {
    const detail = readFileSync(
      path.resolve(__dirname, "..", "..", "app", "admin", "agents", "[id]", "page.tsx"),
      "utf8"
    );
    expect(detail).toContain("assisted_by_agent_id");
    // Both formatters come from the shared module, so the list and the detail
    // screen cannot disagree about what "this week" means.
    expect(detail).toContain("summariseAgentLeads");
  });
});
