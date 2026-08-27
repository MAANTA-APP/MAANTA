import { describe, expect, it } from "vitest";
import {
  fastVisitChipState,
  fastVisitChipLabel,
  type FastVisitChipInput,
} from "@/lib/fast-visit-chip";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const at = (minsFromNow: number) =>
  new Date(NOW.getTime() + minsFromNow * 60_000).toISOString();

function input(over: Partial<FastVisitChipInput> = {}): FastVisitChipInput {
  return {
    featureEnabled: false,
    claimedAt: at(-5),
    arrivedAt: null,
    qualifiedAt: null,
    windowMinutes: 15,
    now: NOW,
    ...over,
  };
}

describe("nothing dark becomes visible because this PR ships", () => {
  it("shows nothing at all with the feature off and nothing earned", () => {
    // Production today: fast_visit_enabled is false and no claim has ever
    // qualified. Every row must render nothing.
    expect(fastVisitChipState(input())).toBe("hidden");
    expect(fastVisitChipLabel(fastVisitChipState(input()))).toBeNull();
  });

  it("stays hidden with the feature off even mid-window", () => {
    expect(fastVisitChipState(input({ claimedAt: at(-1) }))).toBe("hidden");
  });

  it("stays hidden with the feature off even after an arrival that did not qualify", () => {
    expect(fastVisitChipState(input({ arrivedAt: at(-2) }))).toBe("hidden");
  });
});

describe("earned eligibility survives the gate (D198)", () => {
  it("shows a qualified claim even when the feature is switched off", () => {
    // The award RPC never re-reads the gate, so the UI must not either.
    // Flipping the lever off must not erase what a shopper already earned.
    const s = fastVisitChipState(
      input({ featureEnabled: false, qualifiedAt: at(-3), arrivedAt: at(-3) })
    );
    expect(s).toBe("qualified");
    expect(fastVisitChipLabel(s)).toBe("Fast Visit earned");
  });

  it("checks the persisted verdict before the flag, not after", () => {
    const off = fastVisitChipState(input({ featureEnabled: false, qualifiedAt: at(-3) }));
    const on = fastVisitChipState(input({ featureEnabled: true, qualifiedAt: at(-3) }));
    expect(off).toBe(on);
  });
});

describe("the verdict is read, never re-derived (D191)", () => {
  it("does not call an arrival qualified just because it was inside the window", () => {
    // Arrived one minute after claiming, but no persisted verdict: the server
    // decided this was not a qualifying arrival, and the UI must not overrule
    // it by recomputing from timestamps.
    const s = fastVisitChipState(
      input({ featureEnabled: true, claimedAt: at(-2), arrivedAt: at(-1), qualifiedAt: null })
    );
    expect(s).not.toBe("qualified");
    expect(s).toBe("missed");
  });
});

describe("window states, with the feature on", () => {
  const on = (over: Partial<FastVisitChipInput> = {}) =>
    fastVisitChipState(input({ featureEnabled: true, ...over }));

  it("reports an open window while time remains", () => {
    expect(on({ claimedAt: at(-5) })).toBe("window-open");
  });

  it("reports closed once the window has passed", () => {
    expect(on({ claimedAt: at(-20) })).toBe("missed");
  });

  it("treats the exact boundary as closed", () => {
    expect(on({ claimedAt: at(-15) })).toBe("missed");
  });

  it("says nothing for a claim with no recorded claim time", () => {
    // Historical rows predate claimed_at. No window ever existed, so a "missed"
    // chip would be inventing a failure the shopper never had.
    expect(on({ claimedAt: null })).toBe("hidden");
    expect(on({ claimedAt: "not a date" })).toBe("hidden");
  });
});

describe("copy never implies the ticket became invalid", () => {
  it("calls a closed window closed, never expired", () => {
    const label = fastVisitChipLabel("missed")!;
    expect(label).toMatch(/reward window closed/i);
    expect(label).not.toMatch(/expired|invalid|too late|lost/i);
  });

  it("keeps every visible state word-first, so it survives greyscale", () => {
    for (const s of ["qualified", "window-open", "missed"] as const) {
      const label = fastVisitChipLabel(s)!;
      expect(label).toBeTruthy();
      expect(label).toMatch(/[A-Za-z]/);
    }
  });

  it("promises no KES equivalence, transfer or marketplace", () => {
    const all = (["qualified", "window-open", "missed"] as const)
      .map((s) => fastVisitChipLabel(s) ?? "")
      .join(" ");
    expect(all).not.toMatch(/KES|cash|redeem for|transfer|shop with|spend/i);
  });
});
