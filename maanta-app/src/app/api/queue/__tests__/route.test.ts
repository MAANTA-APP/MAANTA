import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

// The staff queue read. Two properties carry the tenant boundary and the
// privacy rule, and both are asserted here because the service client
// bypasses RLS — the query predicates ARE the isolation:
//
//   1. the query is scoped to the authenticated merchant's id (from
//      requireMerchant, never the request);
//   2. the payload is minimised — first name + last initial, deal title,
//      arrival, eligibility, code. No full name, no phone, no email, no
//      shopper id.

vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: vi.fn(() =>
    Promise.resolve({ ctx: { merchant: { id: "merchant-1" } } })
  ),
}));

let rows: unknown[];
const eqCalls = vi.fn();
const inCalls = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (...args: unknown[]) => {
        eqCalls(args);
        return chain;
      };
      chain.in = (...args: unknown[]) => {
        inCalls(args);
        return chain;
      };
      chain.gt = () => chain;
      chain.order = () => Promise.resolve({ data: rows, error: null });
      return chain;
    },
  }),
}));

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    arrived_at: "2026-08-26T12:08:00.000Z",
    fast_visit_eligible: true,
    status: "waiting",
    called_at: null,
    users: { full_name: "Amina Hassan" },
    redemptions: {
      otp_code: "136456",
      status: "pending",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      deals: { title: "Summer Abaya" },
    },
    ...overrides,
  };
}

describe("GET /api/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [entry()];
  });

  it("scopes the read to the authenticated merchant", async () => {
    await GET();
    expect(eqCalls).toHaveBeenCalledWith(["merchant_id", "merchant-1"]);
    expect(inCalls).toHaveBeenCalledWith(["status", ["waiting", "called"]]);
  });

  it("minimises shopper identity to first name + last initial", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.entries[0].name).toBe("Amina H.");
    const json = JSON.stringify(body);
    expect(json).not.toContain("Hassan");
    expect(json).not.toContain("full_name");
    expect(json).not.toMatch(/phone/i);
    expect(json).not.toMatch(/email/i);
    expect(json).not.toContain("shopper_id");
  });

  it("carries what the counter needs: deal, arrival, eligibility, code", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.entries[0]).toMatchObject({
      dealTitle: "Summer Abaya",
      fastVisitEligible: true,
      code: "136456",
      status: "waiting",
      calledAt: null,
    });
    expect(body.count).toBe(1);
  });

  it("drops entries whose ticket has been redeemed since check-in", async () => {
    rows = [
      entry(),
      entry({
        id: "p-2",
        redemptions: {
          otp_code: "222222",
          status: "success",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          deals: { title: "Shoe Deal" },
        },
      }),
    ];
    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(JSON.stringify(body)).not.toContain("Shoe Deal");
  });

  it("drops entries whose underlying claim has expired", async () => {
    rows = [
      entry({
        redemptions: {
          otp_code: "136456",
          status: "pending",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          deals: { title: "Summer Abaya" },
        },
      }),
    ];
    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(0);
  });
});
