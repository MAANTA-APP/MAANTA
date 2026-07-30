import { describe, expect, it } from "vitest";
import {
  dealLimitForTier,
  dealLimitLabel,
  dealLimitReachedMessage,
  getDealLimitState,
} from "@/lib/deal-limits";

/**
 * Mirrors `enforce_deal_limit` (supabase/migrations/20260630231915…): Standard
 * 1 active deal, Elite 2, counted over `is_active = TRUE`. These tests exist so
 * the UI gate can never drift away from the DB trigger — if the frozen limit
 * ever changes, both this file and the migration must change together.
 */

describe("dealLimitForTier", () => {
  it("matches the frozen plan limits", () => {
    expect(dealLimitForTier("standard")).toBe(1);
    expect(dealLimitForTier("elite")).toBe(2);
  });
});

describe("getDealLimitState", () => {
  it("lets a Standard merchant with no active deals publish", () => {
    const s = getDealLimitState("standard", 0);
    expect(s).toMatchObject({ limit: 1, atLimit: false, remaining: 1 });
  });

  it("blocks a Standard merchant at one active deal", () => {
    const s = getDealLimitState("standard", 1);
    expect(s.atLimit).toBe(true);
    expect(s.remaining).toBe(0);
  });

  it("lets an Elite merchant publish a second deal but not a third", () => {
    expect(getDealLimitState("elite", 1)).toMatchObject({
      atLimit: false,
      remaining: 1,
    });
    expect(getDealLimitState("elite", 2).atLimit).toBe(true);
  });

  it("stays blocked when the count somehow exceeds the limit", () => {
    // Legacy rows or a manual insert can leave a merchant over the limit; the
    // trigger uses `>=`, so the UI must not report a free slot.
    const s = getDealLimitState("standard", 3);
    expect(s.atLimit).toBe(true);
    expect(s.remaining).toBe(0);
  });

  it("treats a negative count as zero rather than inventing capacity", () => {
    expect(getDealLimitState("elite", -5)).toMatchObject({
      activeCount: 0,
      remaining: 2,
    });
  });

  it("reports flash publishing as Elite-only", () => {
    expect(getDealLimitState("standard", 0).canPublishFlash).toBe(false);
    expect(getDealLimitState("elite", 0).canPublishFlash).toBe(true);
  });
});

describe("copy", () => {
  it("pluralises the plan line correctly", () => {
    expect(dealLimitLabel("standard")).toBe("Standard plan · 1 active deal at a time");
    expect(dealLimitLabel("elite")).toBe("Elite plan · 2 active deals at a time");
  });

  it("offers Standard merchants the upgrade and never leaks the raw trigger text", () => {
    const standard = dealLimitReachedMessage("standard");
    expect(standard).toMatch(/upgrade to Elite/i);
    expect(standard).not.toMatch(/Deal limit reached/);

    const elite = dealLimitReachedMessage("elite");
    expect(elite).toMatch(/Elite maximum/);
    expect(elite).not.toMatch(/upgrade/i);
  });
});
