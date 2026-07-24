import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// The verify route surfaces the shopper's YOU PAY amount ("Collect from
// shopper") by reading the amount_kes column snapshotted onto the redemption at
// claim time. This is a read-only display value threaded into the success
// response — it does NOT change the money path (fee/arrears/wallet are untouched
// by this test's assertions). Legacy rows without a snapshot must degrade to
// collectAmount: null.

vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: () =>
    Promise.resolve({ ctx: { merchant: { id: "merchant-1" } } }),
}));

vi.mock("@/lib/otp", () => ({
  isValidOtpCode: () => true,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  OTP_CHECK_RATE_LIMIT: 5,
  OTP_CHECK_RATE_WINDOW_SECONDS: 60,
}));

vi.mock("@/lib/analytics", () => ({
  captureGuardianOutcome: vi.fn(),
}));

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

// Service client: a fluent from().select().eq().maybeSingle() chain. We return a
// deal row for the `deals` table and a redemption row (with amount_kes) for the
// `redemptions` table, keyed by the table name passed to from().
let redemptionRow: { amount_kes: number | string | null; user_id?: string | null } | null;
let usersRow: { phone: string | null } | null;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === "deals"
                  ? { title: "20% off abayas" }
                  : table === "users"
                    ? usersRow
                    : redemptionRow,
              error: null,
            }),
        }),
      }),
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

describe("POST /api/redemptions/verify — Collect-from-shopper amount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redemptionRow = { amount_kes: 2400, user_id: "user-1" };
    usersRow = { phone: "+254712345678" };
    rpcSingleMock.mockResolvedValue(successRpc);
  });

  it("threads the redemption's amount_kes through as collectAmount", async () => {
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collectAmount).toBe(2400);
    // The fee stays a separate field — the two are never conflated.
    expect(body.feeAmount).toBe(30);
    expect(body.feeChargeStatus).toBe("charged");
  });

  it("coerces a numeric-string amount_kes to a number", async () => {
    redemptionRow = { amount_kes: "1950" };
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.collectAmount).toBe(1950);
  });

  it("returns collectAmount: null for a legacy row with no snapshot", async () => {
    redemptionRow = { amount_kes: null };
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.collectAmount).toBeNull();
  });

  it("returns collectAmount: null when the redemption row is missing", async () => {
    redemptionRow = null;
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.collectAmount).toBeNull();
  });

  it("surfaces a server-masked shopper phone and issues a server verifiedAt", async () => {
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.maskedPhone).toBe("+254 7xx xxx 678");
    expect(JSON.stringify(body)).not.toContain("712345678"); // full phone never sent
    // verifiedAt is a server-issued ISO-8601 UTC instant.
    expect(typeof body.verifiedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.verifiedAt))).toBe(false);
    expect(body.verifiedAt).toMatch(/\dT\d.*Z$/);
  });

  it("returns maskedPhone: null when the shopper has no stored phone", async () => {
    usersRow = { phone: null };
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.maskedPhone).toBeNull();
    // A server timestamp is still issued regardless.
    expect(typeof body.verifiedAt).toBe("string");
  });
});
