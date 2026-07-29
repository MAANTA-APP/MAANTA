import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

/**
 * Payment-rail reality (docs/notion-refresh/what-is-real-vs-staged-vs-planned):
 * Stripe Checkout is the Phase 1 top-up rail; IntaSend M-Pesa is planned and
 * blocked on credentials. Without keys this route must fail CLOSED and say so —
 * it must never reach IntaSend, and it must not return a transient-sounding
 * error that invites a retry of a rail this deployment doesn't have.
 */

const requireMerchantMock = vi.fn();
vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: (permission?: string) => requireMerchantMock(permission),
}));

const isMpesaTopupConfiguredMock = vi.fn();
const initiateMpesaStkPushMock = vi.fn();
vi.mock("@/lib/intasend", () => ({
  isMpesaTopupConfigured: () => isMpesaTopupConfiguredMock(),
  initiateMpesaStkPush: (p: unknown) => initiateMpesaStkPushMock(p),
}));

vi.mock("@/lib/auth", () => ({ currentClerkUserId: async () => null }));
vi.mock("@/lib/analytics", () => ({ captureTopupInitiated: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => true,
  TOPUP_MPESA_RATE_LIMIT: 5,
  TOPUP_RATE_WINDOW_SECONDS: 60,
}));

function req(body: unknown) {
  return new Request("http://localhost/api/topup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ctx = {
  ctx: {
    merchant: { id: "m-1", node: "bbs" },
    user: { full_name: "Test", email: "t@example.com" },
  },
};

describe("POST /api/topup — M-Pesa rail availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMerchantMock.mockResolvedValue(ctx);
  });

  it("returns 503 and never calls IntaSend when the rail is unconfigured", async () => {
    isMpesaTopupConfiguredMock.mockReturnValue(false);

    const res = await POST(req({ amount: 3000, phoneNumber: "+254712345678" }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/M-Pesa top-up isn't available yet/i);
    // Points the merchant at the rail that actually works.
    expect(body.error).toMatch(/card/i);
    expect(body).toMatchObject({ rail: "mpesa", available: false });
    expect(initiateMpesaStkPushMock).not.toHaveBeenCalled();
  });

  it("still requires can_topup before disclosing rail availability", async () => {
    isMpesaTopupConfiguredMock.mockReturnValue(false);
    const denied = new Response(JSON.stringify({ error: "no" }), { status: 403 });
    requireMerchantMock.mockResolvedValue({ error: denied });

    const res = await POST(req({ amount: 3000, phoneNumber: "+254712345678" }));

    expect(res.status).toBe(403);
    expect(requireMerchantMock).toHaveBeenCalledWith("can_topup");
  });

  it("drives the STK push unchanged when IntaSend IS configured", async () => {
    isMpesaTopupConfiguredMock.mockReturnValue(true);
    initiateMpesaStkPushMock.mockResolvedValue({
      invoiceId: "inv_1",
      state: "PENDING",
    });

    const res = await POST(req({ amount: 3000, phoneNumber: "+254712345678" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ invoiceId: "inv_1" });
    expect(initiateMpesaStkPushMock).toHaveBeenCalledTimes(1);
  });
});
