import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Fast Visit award wiring on the verify route. The award happens HERE — at
// the moment staff confirm — via the idempotent award_fast_visit_points RPC
// on the SERVICE client, and three properties must hold:
//
//   1. the award RPC is called with the verified redemption id;
//   2. the merchant-facing RESPONSE IS UNCHANGED — the shopper's points are
//      not the till's business (identity minimisation, §26);
//   3. a reward failure never fails the counter — verify's response is
//      identical whether the award RPC works, refuses, or throws.
//
// The tenant-isolation-critical verify_redemption call stays on createClient
// (anon key + Clerk JWT); only the award uses the service client.

vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: () =>
    Promise.resolve({ ctx: { merchant: { id: "merchant-1", node: "BBS Mall" } } }),
}));

vi.mock("@/lib/otp", () => ({ isValidOtpCode: () => true }));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  OTP_CHECK_RATE_LIMIT: 5,
  OTP_CHECK_RATE_WINDOW_SECONDS: 60,
}));

const fastVisitCapture = vi.fn();
vi.mock("@/lib/analytics", () => ({
  captureGuardianOutcome: vi.fn(),
  captureFastVisitAwarded: (...args: unknown[]) => {
    fastVisitCapture(...args);
    return Promise.resolve();
  },
}));

const verifyRpcSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: () => ({ single: verifyRpcSingle }) }),
}));

const awardRpcSingle = vi.fn();
const serviceRpc = vi.fn(() => ({ single: awardRpcSingle }));
// Generic chainable table mock: eq/order/limit return the chain, maybeSingle
// resolves by table + selected columns (the P2 repair path reads
// redemptions.id through a longer chain than the collect-amount read).
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: serviceRpc,
    from: (table: string) => ({
      select: (cols: string) => {
        const data =
          table === "deals"
            ? { title: "20% off abayas" }
            : table === "users"
              ? { phone: "+254712345678" }
              : cols === "id"
                ? { id: "red-earlier-success" }
                : { amount_kes: 2400, user_id: "user-1" };
        type Chain = {
          eq: () => Chain;
          order: () => Chain;
          limit: () => Chain;
          maybeSingle: () => Promise<{ data: unknown; error: null }>;
        };
        const chain: Chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => Promise.resolve({ data, error: null }),
        };
        return chain;
      },
    }),
  }),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/redemptions/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const successRpc = {
  data: {
    redemption_id: "red-1",
    redemption_status: "success",
    fee_charge_status: "charged",
    fee_amount: 30,
    new_balance: 510,
    new_arrears: 0,
    deal_id: "deal-1",
    deal_claims_count: 1,
    disputed: false,
    guardian_recommendation: "clear",
    guardian_severity: "info",
  },
  error: null,
};

describe("POST /api/redemptions/verify — Fast Visit award wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRpcSingle.mockResolvedValue(successRpc);
    awardRpcSingle.mockResolvedValue({
      data: { awarded: true, points: 50, balance: 50 },
      error: null,
    });
  });

  it("calls the award RPC with the verified redemption id", async () => {
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith("award_fast_visit_points", {
      p_redemption_id: "red-1",
    });
  });

  it("keeps the merchant response free of shopper points", async () => {
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toContain("points");
    expect(json).not.toMatch(/fastVisit/i);
    // The money fields the till DOES need are untouched.
    expect(body.feeChargeStatus).toBe("charged");
    expect(body.collectAmount).toBe(2400);
  });

  it("emits the award analytics event, attributed to the shopper", async () => {
    await POST(req({ otpCode: "123456" }));
    expect(fastVisitCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        redemptionId: "red-1",
        merchantId: "merchant-1",
        points: 50,
      })
    );
  });

  it("emits nothing when the RPC refuses the award", async () => {
    awardRpcSingle.mockResolvedValue({
      data: { awarded: false, points: 0, balance: 0 },
      error: null,
    });
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(200);
    expect(fastVisitCapture).not.toHaveBeenCalled();
  });

  it("verify still succeeds identically when the award RPC throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    awardRpcSingle.mockRejectedValue(new Error("network"));
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feeChargeStatus).toBe("charged");
    expect(body.redemptionId).toBe("red-1");
    consoleError.mockRestore();
  });

  it("repairs a missed award when a merchant retry hits redemption_already_verified", async () => {
    // Codex P2: verify committed on an earlier call that died before its
    // award. The retry exits 409 — and must re-run the idempotent award for
    // the already-verified redemption so the shopper's points do not depend
    // on them reopening the ticket. The response stays the plain 409.
    verifyRpcSingle.mockResolvedValue({
      data: null,
      error: { message: "redemption_already_verified" },
    });
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(409);
    expect(serviceRpc).toHaveBeenCalledWith("award_fast_visit_points", {
      p_redemption_id: "red-earlier-success",
    });
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("points");
  });

  it("never calls the award RPC for a guardian-blocked redemption", async () => {
    verifyRpcSingle.mockResolvedValue({
      data: { ...successRpc.data, redemption_status: "blocked" },
      error: null,
    });
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(409);
    expect(serviceRpc).not.toHaveBeenCalledWith(
      "award_fast_visit_points",
      expect.anything()
    );
  });
});
