import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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
    status: "pending",
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
    expect(fastVisitChipLabel(s)).toBe("Fast Visit reward eligible");
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

describe("a completed redemption can never show an open window", () => {
  /**
   * `record_shopper_arrival` raises `arrival_claim_not_pending` for any
   * non-pending redemption, so once a claim is success, failed or flagged, no
   * arrival can be recorded and no qualification can ever happen. "Fast Visit
   * open" on such a row promises something the database will refuse — a
   * shopper could be told to hurry to a shop for a reward already impossible.
   */
  const completed = ["success", "failed", "flagged"] as const;

  it("pending inside the window is open", () => {
    expect(
      fastVisitChipState(input({ featureEnabled: true, status: "pending", claimedAt: at(-5) }))
    ).toBe("window-open");
  });

  it("pending after the window is closed", () => {
    expect(
      fastVisitChipState(input({ featureEnabled: true, status: "pending", claimedAt: at(-20) }))
    ).toBe("missed");
  });

  it("never says open for a completed redemption, even inside the 15 minutes", () => {
    // The sharp case: verified at the counter four minutes after claiming,
    // with no persisted verdict. The clock says there is time; the database
    // says the window is unreachable.
    for (const status of completed) {
      const s = fastVisitChipState(
        input({ featureEnabled: true, status, claimedAt: at(-4), qualifiedAt: null })
      );
      expect(s).not.toBe("window-open");
      expect(s).toBe("missed");
    }
  });

  it("preserves a qualified verdict through completion", () => {
    // D198 in its strongest form: earned, then redeemed, then the lever
    // flipped off. The chip still says earned.
    for (const status of completed) {
      expect(
        fastVisitChipState(
          input({ featureEnabled: false, status, qualifiedAt: at(-6), arrivedAt: at(-6) })
        )
      ).toBe("qualified");
    }
  });

  it("shows nothing for a completed, non-qualified claim while the flag is off", () => {
    for (const status of completed) {
      expect(
        fastVisitChipState(input({ featureEnabled: false, status, qualifiedAt: null }))
      ).toBe("hidden");
    }
  });
});

describe("the chip never claims a reward the ledger has not paid", () => {
  /**
   * Codex, on PR #288 head a7ae90f. The chip labelled the `qualified` state
   * "Fast Visit earned" from `fast_visit_qualified_at` alone.
   *
   * That column is the ARRIVAL verdict — necessary for a reward, not
   * sufficient for one. `award_fast_visit_points` (read from production, not
   * assumed) inserts the `reward_events` row only when:
   *
   *   v_points > 0 AND v_status = 'success' AND v_qualified_at IS NOT NULL
   *   AND v_claimed_at IS NOT NULL AND v_arrived_at IS NOT NULL
   *   AND v_arrived_at <= v_claimed_at + INTERVAL '15 minutes'
   *
   * So a shopper who checked in on time but has not yet been verified at the
   * counter was told they had earned a reward that does not exist — and one
   * whose redemption ends `failed` or `flagged` was told it permanently.
   * `fast_visit_points` set to 0 (the operator's kill switch for new awards)
   * produces the same false claim even on success.
   *
   * This surface reads the redemption, not the reward ledger, so it cannot
   * truthfully say "earned" in ANY case. The ticket screen can, because it
   * reads the ledger row — and the Fast Visit panel already says "reward
   * eligible" for exactly this state. Two shopper surfaces describing one
   * fact differently, with the weaker-evidenced one making the stronger
   * claim, is the defect.
   */
  it("says eligible, not earned, for a qualified claim", () => {
    expect(fastVisitChipLabel("qualified")).toBe("Fast Visit reward eligible");
    expect(fastVisitChipLabel("qualified")).not.toMatch(/earned/i);
  });

  it("uses the same wording as the Fast Visit panel for the same state", () => {
    // The panel says "Fast Visit reward eligible" with "Points pending".
    // Divergent copy for one fact is how a shopper learns not to trust either.
    const panel = readFileSync(
      path.join(__dirname, "../../app/(shopper)/tickets/[id]/fast-visit-panel.tsx"),
      "utf8"
    );
    expect(panel).toMatch(/reward eligible/);
    expect(fastVisitChipLabel("qualified")).toMatch(/reward eligible/i);
  });

  it("makes no claim about points anywhere in the chip vocabulary", () => {
    // The chip has no access to the ledger, so no state may imply a balance.
    for (const state of ["qualified", "window-open", "missed", "hidden"] as const) {
      const label = fastVisitChipLabel(state);
      if (label === null) continue;
      expect(label).not.toMatch(/earned|points|balance|awarded/i);
    }
  });
});
