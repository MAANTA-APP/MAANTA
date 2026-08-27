import { describe, it, expect } from "vitest";
import {
  NODE0_COHORT_MANIFEST,
  classifyMerchant,
  cohortEntry,
  cohortPosition,
  externalCohort,
  externalCohortSize,
  internalMerchantIds,
  evidenceClassLabel,
} from "@/lib/pilot-cohort";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("Node 0 cohort manifest — external is an allow-list, never a default", () => {
  it("classifies an unknown non-demo merchant as unclassified, NOT external", () => {
    // The founder rule this pins (2026-08-27): external field validation is an
    // explicit enrolment. Under the inverse rule — "external = not known
    // internal" — a forgotten internal account, a support fixture or a
    // half-finished signup would silently promote itself into the evidence
    // that decides whether Node 0 works.
    const unknown = "00000000-0000-4000-a000-999999999999";
    expect(classifyMerchant(unknown)).toBe("unclassified");
    expect(classifyMerchant(unknown)).not.toBe("external");
    expect(cohortEntry(unknown)).toBeNull();
    expect(cohortPosition(unknown)).toBeNull();
  });

  it("classifies both known internal merchants as internal", () => {
    // D184: SKANDI SKAN is a founder registration exercise; E2E Full Sweep Shop
    // was created by the E2E sweep and owns the one genuine-tagged success.
    expect(classifyMerchant("bf66a041-fb06-46a9-bcb0-2146e68d278d")).toBe("internal");
    expect(classifyMerchant("67fe233d-563c-4d56-b81e-27ed78eb160f")).toBe("internal");
    expect(internalMerchantIds()).toHaveLength(2);
  });

  it("reports external field validation as 0 until Merchant 01 is enrolled", () => {
    // This is the live state and it must stay honest: no real merchant has been
    // enrolled at Node 0. If this test fails because an external entry was
    // added, that is only correct if a real merchant actually onboarded.
    expect(externalCohortSize()).toBe(0);
    expect(externalCohort()).toEqual([]);
  });

  it("never gives an internal merchant a cohort position", () => {
    // Internal accounts are not rungs on the 1 -> 5 -> 10 ladder (D174).
    for (const entry of NODE0_COHORT_MANIFEST) {
      if (entry.classification === "internal") {
        expect(entry.position).toBeNull();
      }
    }
  });

  it("requires every entry to carry a real id and a cited source", () => {
    for (const entry of NODE0_COHORT_MANIFEST) {
      expect(entry.merchantId).toMatch(UUID);
      expect(entry.source.trim().length).toBeGreaterThan(20);
      if (entry.onboardedAt !== null) {
        expect(entry.onboardedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("keeps external positions unique and gapless from 1", () => {
    const positions = externalCohort().map((e) => e.position);
    expect(new Set(positions).size).toBe(positions.length);
    positions.forEach((p, i) => expect(p).toBe(i + 1));
  });

  it("holds no duplicate merchant ids", () => {
    const ids = NODE0_COHORT_MANIFEST.map((e) => e.merchantId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels each class distinctly", () => {
    expect(evidenceClassLabel("external")).toBe("External");
    expect(evidenceClassLabel("internal")).toBe("Internal");
    expect(evidenceClassLabel("unclassified")).toBe("Unclassified");
  });
});
