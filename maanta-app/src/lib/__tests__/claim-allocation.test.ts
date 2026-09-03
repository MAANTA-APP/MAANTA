import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isFullyClaimed, claimsRemaining } from "@/lib/ending-soon";
import { interpretClaimResponse } from "@/lib/claim-response";
import {
  claimAllocation,
  claimAllocationLine,
  formatAllocation,
  formatRemaining,
  CLAIM_ALLOCATION_LABELS,
} from "@/lib/claim-allocation";

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * D236 (register D223) — `max_claims` is a CLAIM ALLOCATION (founder ruling
 * 2026-09-03), enforced at issuance against `claims_reserved`, the derived
 * occupancy (D224: an expired claim frees its place).
 *
 * The database is the authority and is covered end to end by
 * `supabase/tests/claim_allocation_cap_test.sql` (cap at issuance, atomicity,
 * lowering, pause, expiry, the counter invariant). These are the APP-side
 * guards: one helper, one vocabulary, and every surface reading the RESERVED
 * count — because reading `claims_count` is precisely the defect: it only
 * moves at the counter, so a deal with every code handed out still advertised
 * itself as claimable.
 */

const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("claimAllocation — the one helper", () => {
  it("reports allocation, issued and remaining for a capped deal", () => {
    expect(claimAllocation({ maxClaims: 10, claimsReserved: 7 })).toEqual({
      allocation: 10,
      issued: 7,
      remaining: 3,
      fullyClaimed: false,
    });
  });

  it("is fully claimed at exactly the cap, mirroring claim_deal's >=", () => {
    expect(claimAllocation({ maxClaims: 10, claimsReserved: 10 }).fullyClaimed).toBe(true);
    expect(claimAllocation({ maxClaims: 10, claimsReserved: 9 }).fullyClaimed).toBe(false);
  });

  it("never reports negative remaining when the allocation was lowered below what is held", () => {
    const a = claimAllocation({ maxClaims: 5, claimsReserved: 8 });
    expect(a.remaining).toBe(0);
    expect(a.fullyClaimed).toBe(true);
    expect(a.issued).toBe(8);
  });

  it("treats NULL as no cap, never as zero", () => {
    const a = claimAllocation({ maxClaims: null, claimsReserved: 4 });
    expect(a.allocation).toBeNull();
    expect(a.remaining).toBeNull();
    expect(a.fullyClaimed).toBe(false);
    expect(formatAllocation(a)).toBe(CLAIM_ALLOCATION_LABELS.uncapped);
    expect(formatRemaining(a)).toBe("—");
  });

  it("tolerates undefined and non-numeric inputs without inventing a cap", () => {
    expect(claimAllocation({ maxClaims: undefined, claimsReserved: undefined })).toEqual({
      allocation: null,
      issued: 0,
      remaining: null,
      fullyClaimed: false,
    });
  });

  it("speaks the ruling's vocabulary and never calls it a redemption limit", () => {
    expect(claimAllocationLine(claimAllocation({ maxClaims: 10, claimsReserved: 7 }))).toBe(
      "Claims issued 7 of 10 · 3 remaining"
    );
    expect(claimAllocationLine(claimAllocation({ maxClaims: 10, claimsReserved: 10 }))).toBe(
      "Fully claimed · 10 of 10 issued"
    );
    expect(claimAllocationLine(claimAllocation({ maxClaims: null, claimsReserved: 3 }))).toBe(
      "Claims issued 3 · no cap"
    );
    for (const label of Object.values(CLAIM_ALLOCATION_LABELS)) {
      expect(label.toLowerCase()).not.toContain("redemption");
      expect(label.toLowerCase()).not.toContain("stock");
    }
  });

  it("takes claims_reserved by name, so claims_count cannot be passed by accident", () => {
    const src = read("lib/claim-allocation.ts");
    expect(src).toContain("claimsReserved:");
    expect(src).not.toMatch(/claimsCount/);
  });
});

describe("D236 — the allocation predicate (shopper helpers delegate to the one helper)", () => {
  it("is exhausted when reserved reaches the limit, matching claim_deal's >=", () => {
    expect(isFullyClaimed({ max_claims: 10, claims_reserved: 9 })).toBe(false);
    expect(isFullyClaimed({ max_claims: 10, claims_reserved: 10 })).toBe(true);
    // Over-issue cannot occur (the trigger forbids it) but must never read
    // as "still claimable" if it somehow did.
    expect(isFullyClaimed({ max_claims: 10, claims_reserved: 11 })).toBe(true);
  });

  it("treats a null limit as unlimited, exactly as the RPC does", () => {
    expect(isFullyClaimed({ max_claims: null, claims_reserved: 9999 })).toBe(false);
    expect(claimsRemaining({ max_claims: null, claims_reserved: 3 })).toBeNull();
  });

  it("reports claims left, clamped at zero", () => {
    expect(claimsRemaining({ max_claims: 10, claims_reserved: 4 })).toBe(6);
    expect(claimsRemaining({ max_claims: 10, claims_reserved: 10 })).toBe(0);
    expect(claimsRemaining({ max_claims: 10, claims_reserved: 12 })).toBe(0);
  });

  it("has exactly one arithmetic: ending-soon delegates rather than re-deriving", () => {
    const src = read("lib/ending-soon.ts");
    expect(src).toContain('from "@/lib/claim-allocation"');
    expect(src).not.toMatch(/deal\.max_claims - deal\.claims_reserved/);
  });
});

describe("D236 — shopper surfaces read the reserved counter, not redemptions", () => {
  it("deal detail decides claimability and 'fully claimed' from claims_reserved", () => {
    const page = read("app/(shopper)/deals/[id]/page.tsx");
    expect(page).toContain("isFullyClaimed(deal)");
    // The pre-D236 inline predicate must not come back.
    expect(page).not.toContain("deal.claims_count >= deal.max_claims");
  });

  it("the feed and search cards carry claims_reserved into the scarcity KPI", () => {
    for (const rel of ["app/(shopper)/feed/page.tsx", "app/(shopper)/search/page.tsx"]) {
      const src = read(rel);
      expect(src).toContain("claimsReserved: d.claims_reserved");
      expect(src).not.toContain("claimsReserved: d.claims_count");
    }
  });

  it("the ending-soon rail's membership carries the reserved counter", () => {
    const rail = read("components/shopper/ending-soon-rail.tsx");
    expect(rail).toContain("claims_reserved: number");
    expect(rail).not.toContain("claims_count: number");
  });

  it("every deal read selects claims_reserved, or the surfaces get undefined", () => {
    const data = read("lib/data.ts");
    const selects = data
      .split("\n")
      .filter((l) => l.includes("max_claims, claims_count"));
    expect(selects.length).toBeGreaterThan(0);
    for (const line of selects) expect(line).toContain("claims_reserved");
  });
});

describe("D236 — every surface that prints the cap uses the vocabulary and the reserved count", () => {
  it.each([
    "app/admin/deals/page.tsx",
    "app/admin/merchants/[id]/page.tsx",
    "app/merchant/(app)/deals/[id]/page.tsx",
  ])("%s renders the cap through the shared helper from claims_reserved", (rel) => {
    const src = read(rel);
    expect(src).toContain('from "@/lib/claim-allocation"');
    expect(src).toContain("claimsReserved:");
    expect(src).toContain("claims_reserved");
    // A bare fraction says nothing about what the cap means; it must not return.
    expect(src).not.toMatch(/\$\{[^}]*claims_count\}\/\$\{[^}]*max_claims\}/);
    expect(src).not.toMatch(/\$\{[^}]*claims_reserved\}\/\$\{[^}]*max_claims\}/);
  });

  it("the merchant deal page separates claims issued from redemptions", () => {
    const page = read("app/merchant/(app)/deals/[id]/page.tsx");
    expect(page).toContain("CLAIM_ALLOCATION_LABELS.issued");
    expect(page).toContain("CLAIM_ALLOCATION_LABELS.remaining");
    expect(page).toContain('label="Redeemed"');
    expect(page).not.toContain("`${deal.claims_count}/${deal.max_claims}`");
  });

  it("an archived snapshot states allocation and redeemed, never a fraction read as issued", () => {
    const src = read("app/merchant/(app)/deals/archived/page.tsx");
    expect(src).toContain("CLAIM_ALLOCATION_LABELS.allocation");
    expect(src).toContain("Redeemed");
    expect(src).not.toMatch(/Claimed: \{/);
  });

  it("the wizard names the allocation, explains it, and names both stock levers", () => {
    const wiz = read("app/merchant/(app)/deals/new/new-deal-wizard.tsx");
    expect(wiz).toContain('label="Claim allocation"');
    expect(wiz).toMatch(/most shoppers who can hold a claim/i);
    expect(wiz).toMatch(/pause the deal/i);
    // D224: a merchant who is not told that an unused claim comes back will
    // read a few no-shows as a permanently sold-out deal.
    expect(wiz).toMatch(/expires and frees its place/i);
    expect(wiz).toMatch(/claim allocation/i);
    // "Max claims" was the misleading label the ruling replaced.
    expect(wiz).not.toContain('label="Max claims"');
    expect(wiz).not.toContain('label="Claim limit"');
  });

  it("lowering the allocation below claims currently held is refused with the real number", () => {
    const route = read("app/api/deals/[id]/route.ts");
    expect(route).toContain("nextMax < deal.claims_reserved");
    expect(route).toContain("below_claims_reserved");
    // This route is the only guard on the merchant-facing rule, because
    // occupancy changes with the clock and cannot be a CHECK constraint
    // (D224). The database still refuses to over-ISSUE at any allocation,
    // which is the invariant that protects shoppers.
    expect(route).toContain("claimsReserved: deal.claims_reserved");
  });
});

describe("D236 — an exhausted allocation is a stated state, never a server error", () => {
  it("the claim route maps deal_claim_limit_reached to a plain sold-out answer", () => {
    const route = read("app/api/redemptions/route.ts");
    expect(route).toContain("deal_claim_limit_reached");
    expect(route).toContain('userMessage = "This deal is fully claimed."');
    expect(route).toContain('code: "deal_claim_limit_reached"');
  });
});

describe("D236 — a race loser's page corrects itself", () => {
  it("marks an exhausted allocation as stale so the deal re-renders sold out", async () => {
    const out = await interpretClaimResponse(
      jsonRes(410, { error: "This deal is fully claimed.", code: "deal_claim_limit_reached" })
    );
    expect(out).toEqual({
      kind: "error",
      message: "This deal is fully claimed.",
      stale: true,
    });
  });

  it("marks paused and expired the same way — the deal moved on, not the shopper", async () => {
    for (const code of ["deal_paused", "deal_expired"]) {
      const out = await interpretClaimResponse(jsonRes(410, { error: "No.", code }));
      expect(out).toMatchObject({ kind: "error", stale: true });
    }
  });

  it("never marks an unknown outcome stale", async () => {
    const timeout = await interpretClaimResponse(new Response("<html>502</html>", { status: 502 }));
    expect(timeout).not.toHaveProperty("stale");

    const other = await interpretClaimResponse(
      jsonRes(409, { error: "You already have an active claim on this deal." })
    );
    expect(other).not.toHaveProperty("stale");
  });

  it("the claim flow acts on the signal instead of leaving a contradiction", () => {
    const flow = read("app/(shopper)/deals/[id]/claim-flow.tsx");
    expect(flow).toContain("if (outcome.stale) router.refresh()");
  });
});
