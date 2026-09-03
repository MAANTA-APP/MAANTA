import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  claimAllocation,
  claimAllocationLine,
  formatAllocation,
  formatRemaining,
  CLAIM_ALLOCATION_LABELS,
} from "@/lib/claim-allocation";

/**
 * D236 — `max_claims` is the number of shopper claims that may be ISSUED. The
 * helper must mirror `claim_deal`'s own gate (`claims_count >= max_claims`,
 * NULL = unlimited) exactly, or an admin page and the RPC disagree about
 * whether a shopper can still claim.
 */
describe("claimAllocation — the D236 semantic", () => {
  it("reports allocation, issued and remaining for a capped deal", () => {
    const a = claimAllocation({ maxClaims: 10, claimsCount: 7 });
    expect(a).toEqual({ allocation: 10, issued: 7, remaining: 3, fullyClaimed: false });
  });

  it("is fully claimed at exactly the cap, mirroring claim_deal's >=", () => {
    expect(claimAllocation({ maxClaims: 10, claimsCount: 10 }).fullyClaimed).toBe(true);
    expect(claimAllocation({ maxClaims: 10, claimsCount: 9 }).fullyClaimed).toBe(false);
  });

  it("never reports negative remaining when the allocation was lowered below issued", () => {
    // Lowering the allocation stops new claims and touches no existing ticket.
    const a = claimAllocation({ maxClaims: 5, claimsCount: 8 });
    expect(a.remaining).toBe(0);
    expect(a.fullyClaimed).toBe(true);
    expect(a.issued).toBe(8);
  });

  it("treats NULL as no cap, never as zero", () => {
    const a = claimAllocation({ maxClaims: null, claimsCount: 4 });
    expect(a.allocation).toBeNull();
    expect(a.remaining).toBeNull();
    expect(a.fullyClaimed).toBe(false);
    expect(formatAllocation(a)).toBe(CLAIM_ALLOCATION_LABELS.uncapped);
    expect(formatRemaining(a)).toBe("—");
  });

  it("tolerates undefined and non-numeric inputs without inventing a cap", () => {
    expect(claimAllocation({ maxClaims: undefined, claimsCount: undefined })).toEqual({
      allocation: null,
      issued: 0,
      remaining: null,
      fullyClaimed: false,
    });
  });

  it("speaks the ruling's vocabulary and never calls it a redemption limit", () => {
    expect(claimAllocationLine(claimAllocation({ maxClaims: 10, claimsCount: 7 }))).toBe(
      "Claims issued 7 of 10 · 3 remaining"
    );
    expect(claimAllocationLine(claimAllocation({ maxClaims: 10, claimsCount: 10 }))).toBe(
      "Fully claimed · 10 of 10 issued"
    );
    expect(claimAllocationLine(claimAllocation({ maxClaims: null, claimsCount: 3 }))).toBe(
      "Claims issued 3 · no cap"
    );
    for (const label of Object.values(CLAIM_ALLOCATION_LABELS)) {
      expect(label.toLowerCase()).not.toContain("redemption");
      expect(label.toLowerCase()).not.toContain("stock");
    }
  });
});

describe("D236 — the vocabulary is used on every surface that prints the cap", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it.each([
    "src/app/admin/deals/page.tsx",
    "src/app/admin/merchants/[id]/page.tsx",
    "src/app/merchant/(app)/deals/[id]/page.tsx",
    "src/app/merchant/(app)/deals/archived/page.tsx",
  ])("%s renders the cap through the shared helper", (rel) => {
    const src = read(rel);
    expect(src).toContain('from "@/lib/claim-allocation"');
    // The old `${claims_count}/${max_claims}` fraction said nothing about what
    // the cap meant; it must not come back beside the helper.
    expect(src).not.toMatch(/\$\{[^}]*claims_count\}\/\$\{[^}]*max_claims\}/);
  });

  it("the merchant wizard summary calls it a claim allocation", () => {
    const src = read("src/app/merchant/(app)/deals/new/new-deal-wizard.tsx");
    expect(src).toMatch(/claim allocation/i);
  });
});
