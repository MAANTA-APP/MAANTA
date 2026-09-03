import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isFullyClaimed, claimsRemaining } from "@/lib/ending-soon";
import { interpretClaimResponse } from "@/lib/claim-response";

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * D236 — `max_claims` is a CLAIM ALLOCATION (founder ruling 2026-09-03).
 *
 * The database is the authority and is covered end to end by
 * `supabase/tests/claim_allocation_cap_test.sql` (cap at issuance, atomicity,
 * lowering, pause, expiry, the counter invariant). These are the APP-side
 * guards: the surfaces must read the ISSUED counter, because reading
 * `claims_count` is precisely the defect — it only moves at the counter, so a
 * deal with every code handed out still advertised itself as claimable.
 */

const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("D236 — the allocation predicate", () => {
  it("is exhausted when issued reaches the limit, matching claim_deal's >=", () => {
    expect(isFullyClaimed({ max_claims: 10, claims_issued: 9 })).toBe(false);
    expect(isFullyClaimed({ max_claims: 10, claims_issued: 10 })).toBe(true);
    // Over-issue cannot occur (the DB CHECK forbids it) but must never read
    // as "still claimable" if it somehow did.
    expect(isFullyClaimed({ max_claims: 10, claims_issued: 11 })).toBe(true);
  });

  it("treats a null limit as unlimited, exactly as the RPC does", () => {
    expect(isFullyClaimed({ max_claims: null, claims_issued: 9999 })).toBe(false);
    expect(claimsRemaining({ max_claims: null, claims_issued: 3 })).toBeNull();
  });

  it("reports claims left, clamped at zero", () => {
    expect(claimsRemaining({ max_claims: 10, claims_issued: 4 })).toBe(6);
    expect(claimsRemaining({ max_claims: 10, claims_issued: 10 })).toBe(0);
    expect(claimsRemaining({ max_claims: 10, claims_issued: 12 })).toBe(0);
  });
});

describe("D236 — shopper surfaces read the issued counter, not redemptions", () => {
  it("deal detail decides claimability and 'fully claimed' from claims_issued", () => {
    const page = read("app/(shopper)/deals/[id]/page.tsx");
    expect(page).toContain("isFullyClaimed(deal)");
    // The pre-D236 inline predicate must not come back.
    expect(page).not.toContain("deal.claims_count >= deal.max_claims");
  });

  it("the feed and search cards carry claims_issued into the scarcity KPI", () => {
    for (const rel of ["app/(shopper)/feed/page.tsx", "app/(shopper)/search/page.tsx"]) {
      const src = read(rel);
      expect(src).toContain("claimsIssued: d.claims_issued");
      expect(src).not.toContain("claimsIssued: d.claims_count");
    }
  });

  it("the ending-soon rail's membership carries the issued counter", () => {
    const rail = read("components/shopper/ending-soon-rail.tsx");
    expect(rail).toContain("claims_issued: number");
    expect(rail).not.toContain("claims_count: number");
  });

  it("every deal read selects claims_issued, or the surfaces get undefined", () => {
    const data = read("lib/data.ts");
    const selects = data
      .split("\n")
      .filter((l) => l.includes("max_claims, claims_count"));
    expect(selects.length).toBeGreaterThan(0);
    for (const line of selects) expect(line).toContain("claims_issued");
  });
});

describe("D236 — the merchant can see and steer the allocation", () => {
  it("the deal page separates claims issued from redemptions", () => {
    const page = read("app/merchant/(app)/deals/[id]/page.tsx");
    expect(page).toContain("claims_issued");
    expect(page).toContain('label="Claims left"');
    expect(page).toContain('label="Redeemed"');
    // The old single KPI conflated the two under one word.
    expect(page).not.toContain("`${deal.claims_count}/${deal.max_claims}`");
  });

  it("the wizard explains what the limit does, and names both stock levers", () => {
    const wiz = read("app/merchant/(app)/deals/new/new-deal-wizard.tsx");
    expect(wiz).toContain('label="Claim limit"');
    expect(wiz).toMatch(/most shoppers who can claim/i);
    expect(wiz).toMatch(/pause the deal/i);
    // "Max claims" was the misleading label the ruling replaced.
    expect(wiz).not.toContain('label="Max claims"');
  });

  it("lowering the limit below claims already issued is refused with the real number", () => {
    const route = read("app/api/deals/[id]/route.ts");
    expect(route).toContain("nextMax < deal.claims_issued");
    expect(route).toContain("below_claims_issued");
    // And the database constraint's own error is translated, not swallowed as
    // a generic 500 — a claim can land between the read and the write.
    expect(route).toContain("claims_issued_within_allocation");
  });
});

describe("D236 — an exhausted allocation is a stated state, never a server error", () => {
  it("the claim route maps deal_claim_limit_reached to a plain sold-out answer", () => {
    const route = read("app/api/redemptions/route.ts");
    expect(route).toContain("deal_claim_limit_reached");
    // Race losers land here too: nine of ten simultaneous claimants get this
    // branch, so it must read as a state and not as a failure. Anchored on the
    // assignment rather than a character window, which a later comment can
    // silently push the message out of.
    expect(route).toContain('userMessage = "This deal is fully claimed."');
    // And it must carry the code, or the shopper is left looking at a live
    // Claim button under a sold-out message.
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
    // Refreshing here would replace an honest "check My Deals before trying
    // again" with a page that may look claimable and invite a second claim.
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
