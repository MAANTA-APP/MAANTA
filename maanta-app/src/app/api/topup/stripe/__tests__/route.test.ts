import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Stripe wallet top-up mirrors the M-Pesa route: owner-only billing action.
// A non-owner must be rejected with 403 before any Stripe checkout session is
// created, regardless of merchant_staff.can_topup.

const requireMerchantMock = vi.fn();
vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: (...args: unknown[]) => requireMerchantMock(...args),
}));

const sessionsCreateMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({ checkout: { sessions: { create: sessionsCreateMock } } }),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/topup/stripe", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/topup/stripe — owner-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the owner start a Stripe checkout (200)", async () => {
    requireMerchantMock.mockResolvedValue({
      ctx: {
        merchant: { id: "merchant-1", merchant_name: "Shop" },
        isOwner: true,
        permissions: { can_verify: true, can_deals: true, can_topup: true, can_purchase: true },
      },
    });
    sessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.test/s/1" });

    const res = await POST(req({ amount: 3000, currency: "KES" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.test/s/1",
    });
    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
  });

  it("rejects staff (non-owner) with 403 and never creates a checkout session", async () => {
    requireMerchantMock.mockResolvedValue({
      ctx: {
        merchant: { id: "merchant-1", merchant_name: "Shop" },
        isOwner: false,
        permissions: { can_verify: true, can_deals: false, can_topup: true, can_purchase: false },
      },
    });

    const res = await POST(req({ amount: 3000, currency: "KES" }));

    expect(res.status).toBe(403);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});
