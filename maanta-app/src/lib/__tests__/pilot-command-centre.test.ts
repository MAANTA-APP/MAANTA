import { describe, it, expect } from "vitest";
import {
  queueAlertState,
  pilotMerchantStatus,
  merchantConversion,
  cohortTotals,
  buildPilotAlerts,
  MIN_CLAIMS_FOR_MERCHANT_RATIO,
  type PilotMerchantRow,
} from "@/lib/pilot-command-centre";

function row(over: Partial<PilotMerchantRow> = {}): PilotMerchantRow {
  return {
    merchantId: "m1",
    name: "Test Shop",
    position: null,
    evidence: "unclassified",
    tier: "standard",
    status: "active",
    isVisible: true,
    isShadowBanned: false,
    activeDeals: 1,
    dealCap: 1,
    shopperVisibleDeals: 1,
    claims: 0,
    arrivals: 0,
    verified: 0,
    verifiedCohort: 0,
    fastVisits: 0,
    successFeesKes: 0,
    ...over,
  };
}

describe("pilot status — deterministic, and every status states its condition", () => {
  it("reports an unreadable row as unavailable before diagnosing anything", () => {
    // D164/D185: a failed read is not a zero. A merchant whose counts failed
    // must not be reported as "no supply" — that is a diagnosis drawn from an
    // error, which is exactly how a console starts lying.
    const s = pilotMerchantStatus(row({ shopperVisibleDeals: null }));
    expect(s.id).toBe("read-failed");
    expect(s.severity).toBe("unknown");
    expect(s.reason).toMatch(/read failure/i);
  });

  it("does not diagnose supply when claims failed to read", () => {
    expect(pilotMerchantStatus(row({ claims: null })).id).toBe("read-failed");
    expect(pilotMerchantStatus(row({ verifiedCohort: null })).id).toBe("read-failed");
  });

  it("never reports a HEALTHY status when the slot count failed to read", () => {
    // The gate originally omitted activeDeals, so a failed slot read skipped
    // the at-cap rule and fell through to "Awaiting first claim" or "Active" —
    // a healthy diagnosis manufactured by an error. Every count the rules
    // consult must be readable before any of them may speak.
    for (const over of [
      { activeDeals: null },
      { activeDeals: null, claims: 0 },
      { activeDeals: null, claims: 4, verifiedCohort: 2 },
    ]) {
      const s = pilotMerchantStatus(row(over));
      expect(s.id).toBe("read-failed");
      expect(["awaiting-first-claim", "active", "at-cap"]).not.toContain(s.id);
    }
  });

  it("reports suspension before supply, so a suspended shop is not read as starved", () => {
    const s = pilotMerchantStatus(row({ status: "suspended", shopperVisibleDeals: 0 }));
    expect(s.id).toBe("merchant-not-visible");
    expect(s.reason).toMatch(/suspended/);
  });

  it("treats not-visible the same way, with its own reason", () => {
    const s = pilotMerchantStatus(row({ isVisible: false, shopperVisibleDeals: 0 }));
    expect(s.id).toBe("merchant-not-visible");
    expect(s.reason).toMatch(/not visible/);
  });

  it("flags zero shopper-visible supply as urgent", () => {
    const s = pilotMerchantStatus(row({ shopperVisibleDeals: 0 }));
    expect(s.id).toBe("no-supply");
    expect(s.severity).toBe("urgent");
  });

  it("flags claims with no verified visits, quoting the counts", () => {
    const s = pilotMerchantStatus(row({ claims: 4, verified: 0, verifiedCohort: 0 }));
    expect(s.id).toBe("claims-no-visits");
    expect(s.reason).toContain("4 claim");
    // The wording changed with the cohort fix: it now says none of THIS
    // window's claims verified, which is the claim the rule actually makes.
    expect(s.reason).toContain("none of them verified");
  });

  it("flags a merchant sitting at its plan cap", () => {
    const s = pilotMerchantStatus(row({ activeDeals: 2, dealCap: 2, claims: 3, verified: 1, verifiedCohort: 1 }));
    expect(s.id).toBe("at-cap");
    expect(s.reason).toContain("2/2");
  });

  it("distinguishes awaiting-first-claim from active", () => {
    expect(pilotMerchantStatus(row({ claims: 0, activeDeals: 0 })).id).toBe(
      "awaiting-first-claim"
    );
    expect(
      pilotMerchantStatus(row({ claims: 3, verified: 2, verifiedCohort: 2, activeDeals: 0 })).id
    ).toBe("active");
  });

  it("never returns a status without a non-empty reason", () => {
    const cases = [
      row(),
      row({ shopperVisibleDeals: null }),
      row({ status: "suspended" }),
      row({ shopperVisibleDeals: 0 }),
      row({ claims: 9, verified: 0, verifiedCohort: 0 }),
      row({ activeDeals: 2, dealCap: 2, claims: 1, verified: 1, verifiedCohort: 1 }),
      row({ claims: 5, verified: 5, verifiedCohort: 5, activeDeals: 0 }),
    ];
    for (const c of cases) {
      expect(pilotMerchantStatus(c).reason.trim().length).toBeGreaterThan(10);
    }
  });
});

describe("conversion — no causal claims from tiny samples", () => {
  it("refuses to compute a ratio below the minimum sample", () => {
    // A 1-of-1 is not a 100% conversion. At Node 0 volumes this is the common
    // case, and the honest render is a dash.
    expect(merchantConversion(row({ claims: 1, verified: 1, verifiedCohort: 1 }))).toBeNull();
    expect(
      merchantConversion(row({ claims: MIN_CLAIMS_FOR_MERCHANT_RATIO - 1, verified: 2, verifiedCohort: 2 }))
    ).toBeNull();
  });

  it("computes only at or above the floor", () => {
    expect(
      merchantConversion(row({ claims: MIN_CLAIMS_FOR_MERCHANT_RATIO, verified: 1, verifiedCohort: 1 }))
    ).toBeCloseTo(1 / MIN_CLAIMS_FOR_MERCHANT_RATIO);
  });

  it("returns null when either side failed to read", () => {
    expect(merchantConversion(row({ claims: null, verified: 3, verifiedCohort: 3 }))).toBeNull();
    expect(merchantConversion(row({ claims: 10, verified: 5, verifiedCohort: null }))).toBeNull();
  });
});

describe("funnel figures use the claim cohort, never throughput", () => {
  /**
   * The shape that makes this a real defect rather than a nicety.
   *
   * A shopper claims on day 1 (outside a 7-day window) and walks in on day 8
   * (inside it). That redemption's `redeemed_at` is in the window; its
   * `claimed_at` is not. So it lands in `verified` (throughput) and in NO
   * claim count. Feeding throughput into a cohort denominator produces
   * arithmetic that cannot be true.
   */
  const carryOver = () =>
    row({
      claims: 2, // both made inside the window
      verified: 3, // 2 of those + 1 older claim redeemed during the window
      verifiedCohort: 0, // ...and NONE of the window's own claims converted
    });

  it("cannot report a conversion above 100% from a carried-over redemption", () => {
    const r = row({ claims: 5, verified: 9, verifiedCohort: 2 });
    const conv = merchantConversion(r);
    expect(conv).not.toBeNull();
    expect(conv!).toBeLessThanOrEqual(1);
    // 2/5, not 9/5.
    expect(conv!).toBeCloseTo(0.4);
  });

  it("still flags claims-with-no-visits when only an older claim converted", () => {
    // Throughput says 3 verifications happened; the cohort says none of THIS
    // window's claims completed. The merchant needs attention, and reading
    // throughput here would have silenced the alert entirely.
    const s = pilotMerchantStatus(carryOver());
    expect(s.id).toBe("claims-no-visits");
    expect(s.reason).toContain("none of them verified");
  });

  it("carries the throughput count separately rather than discarding it", () => {
    const t = cohortTotals([carryOver()]);
    expect(t.verified).toBe(3);
    expect(t.verifiedCohort).toBe(0);
    expect(t.verified).not.toBe(t.verifiedCohort);
  });

  it("gates the unreadable check on the cohort count, the one the rules use", () => {
    // If only throughput failed, the funnel rules can still be evaluated
    // honestly; if the cohort count failed, they cannot.
    expect(pilotMerchantStatus(row({ verified: null })).id).not.toBe("read-failed");
    expect(pilotMerchantStatus(row({ verifiedCohort: null })).id).toBe("read-failed");
  });
});

describe("cohort totals — a null poisons its column rather than shrinking it", () => {
  it("sums clean rows", () => {
    const t = cohortTotals([
      row({ claims: 2, verified: 1, verifiedCohort: 1, arrivals: 1, fastVisits: 0, successFeesKes: 30 }),
      row({ claims: 3, verified: 2, verifiedCohort: 2, arrivals: 2, fastVisits: 1, successFeesKes: 60 }),
    ]);
    expect(t.claims).toBe(5);
    expect(t.verified).toBe(3);
    expect(t.successFeesKes).toBe(90);
    expect(t.merchants).toBe(2);
  });

  it("returns null for a column where any row is unreadable", () => {
    // The alternative — skipping the unreadable row — produces a smaller number
    // that looks entirely real. That is the D164 failure in aggregate form.
    const t = cohortTotals([row({ claims: 2 }), row({ claims: null })]);
    expect(t.claims).toBeNull();
    expect(t.verified).toBe(0);
  });

  it("counts the three evidence classes separately", () => {
    const t = cohortTotals([
      row({ evidence: "internal" }),
      row({ evidence: "internal" }),
      row({ evidence: "unclassified" }),
    ]);
    expect(t.internal).toBe(2);
    expect(t.unclassified).toBe(1);
    // The number the 1 -> 5 -> 10 ladder counts. Genuine-tagged data does not
    // make a merchant external.
    expect(t.external).toBe(0);
  });
});

describe("alerts — deterministic, consistent with the table, and never a diagnosis from an error", () => {
  it("raises one read alert and no diagnosis for unreadable rows", () => {
    const alerts = buildPilotAlerts([row({ name: "Broken", shopperVisibleDeals: null })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe("read-failed");
    expect(alerts.some((a) => a.id.startsWith("no-supply"))).toBe(false);
  });

  it("raises supply and conversion alerts that quote the same reason as the row", () => {
    const starved = row({ merchantId: "m2", name: "Starved", shopperVisibleDeals: 0 });
    const stalled = row({ merchantId: "m3", name: "Stalled", claims: 6, verified: 0, verifiedCohort: 0 });
    const alerts = buildPilotAlerts([starved, stalled]);

    const supply = alerts.find((a) => a.id === "no-supply:m2");
    const conv = alerts.find((a) => a.id === "claims-no-visits:m3");
    expect(supply?.severity).toBe("urgent");
    expect(supply?.reason).toBe(pilotMerchantStatus(starved).reason);
    expect(conv?.severity).toBe("attention");
    expect(conv?.reason).toBe(pilotMerchantStatus(stalled).reason);
  });

  it("stays silent for a healthy cohort", () => {
    expect(buildPilotAlerts([row({ claims: 3, verified: 2, verifiedCohort: 2, activeDeals: 0 })])).toEqual([]);
  });

  it("gives every alert a non-empty reason", () => {
    const alerts = buildPilotAlerts([
      row({ merchantId: "a", shopperVisibleDeals: 0 }),
      row({ merchantId: "b", claims: 7, verified: 0, verifiedCohort: 0 }),
      row({ merchantId: "c", claims: null }),
    ]);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) expect(a.reason.trim().length).toBeGreaterThan(10);
  });
});

describe("queue alerts fail closed — a failed read is never an all-clear", () => {
  it("renders an explicit unavailable state when the queue read failed", () => {
    // Forcing the failure directly: this is the case the first draft got
    // wrong, where `(count ?? 0) > 0` turned an errored read into "no alert"
    // and the brief looked clear while a real queue sat unread.
    expect(queueAlertState(null)).toBe("unavailable");
    expect(queueAlertState(null)).not.toBe("silent");
  });

  it("stays silent only for a genuine zero", () => {
    expect(queueAlertState(0)).toBe("silent");
  });

  it("raises for any positive count", () => {
    for (const n of [1, 2, 99]) expect(queueAlertState(n)).toBe("raise");
  });

  it("never maps a failed read and a genuine zero to the same state", () => {
    expect(queueAlertState(null)).not.toBe(queueAlertState(0));
  });
});

describe("P2-3 — a merchant that cannot be public is diagnosed as such, before supply", () => {
  /**
   * The defect, exactly.
   *
   * `pilotMerchantStatus` gated visibility on `status === "suspended" || !isVisible`
   * — two of the canonical rule's three conditions, and the wrong two. A
   * `pending` merchant (approved into the system, not yet live), a `churned`
   * one, and every shadow-banned one passed straight through. Their
   * shopper-visible deal count is necessarily 0, so the very next rule fired
   * and the page emitted the URGENT "No shopper-visible supply".
   *
   * That is not a rounding error in a KPI. It is an operator being told to go
   * chase a merchant about publishing deals, when the reason nothing is visible
   * is that the merchant itself is not live — a true sentence pointing at the
   * wrong problem, on the surface whose job is to say what to do next.
   *
   * Each case below sets `shopperVisibleDeals: 0`, which is what production
   * would return for these merchants, so the test fails on the old code by
   * returning `no-supply` rather than by not compiling.
   */
  const notPublic: [string, Partial<PilotMerchantRow>][] = [
    ["pending", { status: "pending" }],
    ["churned", { status: "churned" }],
    ["suspended", { status: "suspended" }],
    ["rejected", { status: "rejected" }],
    ["hidden", { isVisible: false }],
    ["shadow-banned", { isShadowBanned: true }],
  ];

  for (const [label, over] of notPublic) {
    it(`classifies a ${label} merchant as not visible, never as no-supply`, () => {
      const s = pilotMerchantStatus(row({ ...over, shopperVisibleDeals: 0 }));
      expect(s.id).toBe("merchant-not-visible");
      expect(s.id).not.toBe("no-supply");
      expect(s.severity).not.toBe("urgent");
      // The reason must say this is about the merchant, not about its supply,
      // or the operator draws the same wrong conclusion from prose instead.
      expect(s.reason).toMatch(/merchant-state problem, not a supply problem/);
    });
  }

  it("names WHICH condition failed, so the next action differs per case", () => {
    // "Not visible" alone is not actionable: awaiting approval, hidden by trust
    // metric, and shadow-banned are three different situations.
    expect(pilotMerchantStatus(row({ status: "pending" })).reason).toMatch(/pending/);
    expect(pilotMerchantStatus(row({ isVisible: false })).reason).toMatch(/not visible/);
    expect(pilotMerchantStatus(row({ isShadowBanned: true })).reason).toMatch(
      /shadow-banned/
    );
  });

  it("still diagnoses no-supply for a merchant that IS public", () => {
    // The fix must not swallow the real finding: an active, visible,
    // un-banned merchant with nothing live is precisely the urgent case.
    const s = pilotMerchantStatus(
      row({ status: "active", isVisible: true, isShadowBanned: false, shopperVisibleDeals: 0 })
    );
    expect(s.id).toBe("no-supply");
    expect(s.severity).toBe("urgent");
  });

  it("puts the read-failure gate ahead of the visibility rule", () => {
    // A pending merchant whose counts failed to read is still a read failure:
    // we do not know enough to say anything, and "not visible" is a claim.
    const s = pilotMerchantStatus(row({ status: "pending", shopperVisibleDeals: null }));
    expect(s.id).toBe("read-failed");
  });

  it("reports an unreadable slot count as unavailable, not as a healthy row", () => {
    // Carried from the previous round and re-asserted here because P2-3 moved
    // the rule that sits directly after the gate.
    const s = pilotMerchantStatus(row({ activeDeals: null }));
    expect(s.id).toBe("read-failed");
    expect(["active", "awaiting-first-claim", "at-cap"]).not.toContain(s.id);
  });

  it("does not raise a supply alert for a merchant that cannot be public", () => {
    // buildPilotAlerts derives from the status, so the alert list must move
    // with it rather than keeping its own copy of the rule.
    const alerts = buildPilotAlerts([
      row({ merchantId: "pending-1", status: "pending", shopperVisibleDeals: 0 }),
      row({ merchantId: "banned-1", isShadowBanned: true, shopperVisibleDeals: 0 }),
    ]);
    expect(alerts.filter((a) => a.id.startsWith("no-supply"))).toHaveLength(0);
  });
});
