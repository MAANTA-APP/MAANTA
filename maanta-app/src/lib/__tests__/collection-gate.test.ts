import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { COLLECTION_GATE, COLLECTION_OPEN, collectionAllowed } from "@/lib/marketing/collection-gate";

/**
 * The collection gate (founder ruling 2026-09-05, D274). The first test pins
 * the gate's current state so a flip cannot ride in unnoticed: opening
 * collection is a recorded governance act, and the commit that does it must
 * change this expectation on purpose.
 */
const SRC = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => stripComments(readFileSync(path.join(SRC, ...p), "utf8"));

describe("collection gate — state", () => {
  it("is CLOSED", () => {
    expect(COLLECTION_GATE).toBe("closed");
    expect(COLLECTION_OPEN).toBe(false);
  });

  it("lets a verified test entry through, and nothing else, while closed", () => {
    expect(collectionAllowed(true)).toBe(true);
    expect(collectionAllowed(false)).toBe(COLLECTION_OPEN);
  });
});

describe("collection gate — enforced before anything is stored", () => {
  // In both endpoints the gate check must come after the TEST verdict and
  // before validation, the rate limit and any write.
  for (const [label, file, validate, write] of [
    ["waitlist", ["app", "api", "waitlist", "route.ts"], "= validateWaitlistSubmission(body", "addWaitlistContact("],
    ["merchant interest", ["app", "api", "merchants", "interest", "route.ts"], "= validateMerchantInterest(body", ".insert("],
  ] as const) {
    it(`${label}: refuses with 403 before validation, rate limit and write`, () => {
      const src = read(...file);
      const gate = src.indexOf("collectionAllowed(isTest)");
      expect(gate, "gate check present").toBeGreaterThan(-1);
      expect(src.indexOf("isWaitlistTestToken("), "after the test verdict").toBeLessThan(gate);
      for (const later of [validate, "checkRateLimit(", write]) {
        expect(src.indexOf(later), `${later} comes after the gate`).toBeGreaterThan(gate);
      }
      expect(src.slice(gate, gate + 300)).toContain("status: 403");
    });
  }

  it("renders no form on either funnel page while closed", () => {
    for (const file of [
      ["app", "(funnel)", "waitlist", "page.tsx"],
      ["app", "(funnel)", "merchants", "join", "page.tsx"],
    ]) {
      const src = read(...file);
      expect(src, file.join("/")).toContain("collectionAllowed(isTest)");
      expect(src, file.join("/")).toContain("<CollectionClosed");
    }
    const closed = read("components", "funnel", "collection-closed.tsx");
    expect(closed).not.toMatch(/<form|<input|fetch\(|bg-brand/);
    expect(closed).toContain("Nothing is collected here until then");
  });

  it("shows the gate's state on the Growth console", () => {
    expect(read("app", "admin", "growth", "page.tsx")).toContain("COLLECTION_OPEN");
    expect(read("app", "admin", "growth", "waitlist", "page.tsx")).toContain("COLLECTION_OPEN");
  });
});
