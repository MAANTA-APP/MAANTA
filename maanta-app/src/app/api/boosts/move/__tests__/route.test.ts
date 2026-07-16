import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Companion to the purchase_boost route test. The Elite-only gate lives in
// the move_boost SECURITY DEFINER RPC; these tests lock the JS-side
// contract: an Elite merchant can move a boost (200), and a non-Elite
// merchant's BOOST_ELITE_ONLY error surfaces as a specific 403.

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
  return new Request("http://localhost/api/boosts/move", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/boosts/move (move_boost)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMerchantMock.mockResolvedValue({ ctx: { merchant: { id: "merchant-1" } } });
  });

  it("lets an Elite merchant move a boost to another deal (200)", async () => {
    rpcSingleMock.mockResolvedValue({
      data: { boost_id: "boost-1", boost_ends_at: "2026-07-16T12:00:00Z" },
      error: null,
    });

    const res = await POST(req({ fromDealId: "deal-1", toDealId: "deal-2" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      boostId: "boost-1",
      endsAt: "2026-07-16T12:00:00Z",
    });
    expect(rpcMock).toHaveBeenCalledWith("move_boost", {
      p_merchant_id: "merchant-1",
      p_from_deal_id: "deal-1",
      p_to_deal_id: "deal-2",
    });
  });

  it("rejects a non-Elite (Standard) merchant with a specific Elite-only 403", async () => {
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "BOOST_ELITE_ONLY: Boost is available to Elite merchants only" },
    });

    const res = await POST(req({ fromDealId: "deal-1", toDealId: "deal-2" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/elite/i);
  });
});
