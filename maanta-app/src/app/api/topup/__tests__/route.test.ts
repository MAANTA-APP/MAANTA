import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Wallet top-up (M-Pesa STK) is an owner-only billing action. These tests lock
// the frozen rule "staff cannot touch billing/top-ups/boosts": the route must
// resolve merchant context and reject any non-owner with a 403 BEFORE any
// payment is initiated — regardless of the merchant_staff.can_topup toggle.

const requireMerchantMock = vi.fn();
vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: (...args: unknown[]) => requireMerchantMock(...args),
}));

const stkMock = vi.fn();
vi.mock("@/lib/intasend", () => ({
  initiateMpesaStkPush: (...args: unknown[]) => stkMock(...args),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/topup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ownerCtx = {
  ctx: {
    user: { full_name: "Owner", email: "owner@example.com" },
    merchant: { id: "merchant-1", merchant_name: "Shop" },
    isOwner: true,
    permissions: { can_verify: true, can_deals: true, can_topup: true, can_purchase: true },
  },
};

describe("POST /api/topup (M-Pesa STK) — owner-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the owner initiate a top-up (200)", async () => {
    requireMerchantMock.mockResolvedValue(ownerCtx);
    stkMock.mockResolvedValue({ invoiceId: "inv-1", state: "PENDING" });

    const res = await POST(req({ amount: 3000, phoneNumber: "254700000000" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ invoiceId: "inv-1", state: "PENDING" });
    expect(stkMock).toHaveBeenCalledTimes(1);
  });

  it("rejects staff (non-owner) with 403 and never initiates payment — even if can_topup is true", async () => {
    // can_topup=true here proves the gate is ownership, not the toggle: an
    // owner-set flag must not grant a staff member billing access.
    requireMerchantMock.mockResolvedValue({
      ctx: {
        user: { full_name: "Staff", email: "staff@example.com" },
        merchant: { id: "merchant-1", merchant_name: "Shop" },
        isOwner: false,
        permissions: { can_verify: true, can_deals: false, can_topup: true, can_purchase: false },
      },
    });

    const res = await POST(req({ amount: 3000, phoneNumber: "254700000000" }));

    expect(res.status).toBe(403);
    expect(stkMock).not.toHaveBeenCalled();
  });

  it("propagates the auth guard's own error (e.g. signed-out 401)", async () => {
    requireMerchantMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 }),
    });

    const res = await POST(req({ amount: 3000, phoneNumber: "254700000000" }));

    expect(res.status).toBe(401);
    expect(stkMock).not.toHaveBeenCalled();
  });
});
