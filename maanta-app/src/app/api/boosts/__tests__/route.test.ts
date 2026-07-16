import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// The Elite-only gate itself lives in the purchase_boost SECURITY DEFINER
// RPC (frozen rule: "Boost is Elite-only — gate must be server-side"), and
// the eligibility logic is verified live against the DB. These tests lock
// the JS-side contract: an Elite merchant's successful purchase passes
// through as 200, and the RPC's BOOST_ELITE_ONLY error surfaces as a
// specific 403 — never a generic 500.

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

const requireMerchantMock = vi.fn();
vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: (...args: unknown[]) => requireMerchantMock(...args),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/boosts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/boosts (purchase_boost)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMerchantMock.mockResolvedValue({ ctx: { merchant: { id: "merchant-1" } } });
  });

  it("lets an Elite merchant with balance purchase a boost (200)", async () => {
    rpcSingleMock.mockResolvedValue({
      data: { boost_id: "boost-1", new_balance: 2500, boost_ends_at: "2026-07-16T12:00:00Z" },
      error: null,
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      boostId: "boost-1",
      newBalance: 2500,
      endsAt: "2026-07-16T12:00:00Z",
    });
    expect(rpcMock).toHaveBeenCalledWith("purchase_boost", {
      p_merchant_id: "merchant-1",
      p_deal_id: "deal-1",
    });
  });

  it("rejects a non-Elite (Standard) merchant with a specific Elite-only 403", async () => {
    // Standard merchant with sufficient balance: the RPC's tier gate fires
    // before any debit, returning the stable BOOST_ELITE_ONLY error.
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "BOOST_ELITE_ONLY: Boost is available to Elite merchants only" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/elite/i);
  });
});
