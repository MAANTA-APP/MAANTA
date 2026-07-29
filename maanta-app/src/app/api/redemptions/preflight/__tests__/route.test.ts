import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// The preflight route feeds the pre-confirm disclosure screen. It must surface
// the shopper's YOU PAY amount ("Collect from shopper") by reading the amount_kes
// column snapshotted on the redemption at claim — the same read-only value the
// success takeover uses. No money path is touched. Legacy rows without a
// snapshot must degrade to collectAmount: null.

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

// Fluent service-client chain per table: from("redemptions") → the redemption
// row; from("users") → the shopper row (for the masked-phone lookup).
let redemptionRow: Record<string, unknown> | null;
let usersRow: Record<string, unknown> | null;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) {
        builder[m] = () => builder;
      }
      builder.maybeSingle = () =>
        Promise.resolve({ data: table === "users" ? usersRow : redemptionRow, error: null });
      return builder;
    },
  }),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/redemptions/preflight", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Far-future expiry so the route's not-expired check always passes.
const FUTURE = "2999-01-01T00:00:00Z";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "red-1",
    status: "pending",
    expires_at: FUTURE,
    fraud_flags: [],
    review_required: false,
    distance_from_shop: null,
    amount_kes: 2400,
    user_id: "user-1",
    deals: { title: "20% off abayas" },
    ...overrides,
  };
}

describe("POST /api/redemptions/preflight — Collect-from-shopper amount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redemptionRow = row();
    usersRow = { phone: "+254712345678" };
  });

  it("threads the redemption's amount_kes through as collectAmount", async () => {
    const res = await POST(req({ otpCode: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.found).toBe(true);
    expect(body.collectAmount).toBe(2400);
    // Deal detail still flows; the collect amount is a separate field (never the
    // KES 30 fee, which the disclosure's FeeDisclosure renders on its own).
    expect(body.dealTitle).toBe("20% off abayas");
  });

  it("coerces a numeric-string amount_kes to a number", async () => {
    redemptionRow = row({ amount_kes: "1950" });
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.collectAmount).toBe(1950);
  });

  it("returns collectAmount: null for a legacy row with no snapshot", async () => {
    redemptionRow = row({ amount_kes: null });
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.found).toBe(true);
    expect(body.collectAmount).toBeNull();
  });

  it("does not resolve a code with no matching pending redemption", async () => {
    redemptionRow = null;
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.found).toBe(false);
    expect(body.collectAmount).toBeUndefined();
  });

  it("surfaces a server-masked shopper phone (full number never sent)", async () => {
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.maskedPhone).toBe("+254 7xx xxx 678");
    // The raw phone is never present anywhere in the response.
    expect(JSON.stringify(body)).not.toContain("712345678");
  });

  it("returns maskedPhone: null when the shopper has no stored phone", async () => {
    usersRow = { phone: null };
    const res = await POST(req({ otpCode: "123456" }));
    const body = await res.json();
    expect(body.maskedPhone).toBeNull();
  });
});

/**
 * Verify-anyway on a location mismatch — founder ruling 2026-07-29, drift D-07
 * resolved (design/current-reality/frames.json → R-VERIFY-ANYWAY, frame 10a
 * state `location-mismatch`).
 *
 * A mismatch is DISCLOSED, never a rejection. Preflight must still resolve the
 * code (`found: true`) and hand the merchant the mismatch plus the distance, so
 * the counter can confirm with the customer in front of them and the dispute
 * routes to Guardian afterwards. An earlier design showed wrong-shop as a hard
 * rejection with no fee; that branch is superseded and must not come back.
 */
describe("POST /api/redemptions/preflight — verify-anyway on location mismatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersRow = { phone: null };
  });

  it("still resolves the code when the claim carries a geofence flag", async () => {
    redemptionRow = row({ fraud_flags: ["geofence"], distance_from_shop: 420 });
    const body = await (await POST(req({ otpCode: "123456" }))).json();

    expect(body.found).toBe(true); // NOT a rejection
    expect(body.expired).toBe(false);
    expect(body.locationMismatch).toBe(true);
    expect(body.distanceMeters).toBe(420);
    // The fee is still disclosed and the amount still collectable — a
    // mismatched redemption is a real redemption.
    expect(body.collectAmount).toBe(2400);
  });

  it("flags a mismatch on distance alone, past the warn threshold", async () => {
    redemptionRow = row({ fraud_flags: [], distance_from_shop: 900 });
    const body = await (await POST(req({ otpCode: "123456" }))).json();
    expect(body.found).toBe(true);
    expect(body.locationMismatch).toBe(true);
  });

  it("does not flag a shopper standing inside the shop", async () => {
    redemptionRow = row({ fraud_flags: [], distance_from_shop: 10 });
    const body = await (await POST(req({ otpCode: "123456" }))).json();
    expect(body.found).toBe(true);
    expect(body.locationMismatch).toBe(false);
  });

  it("treats a missing distance as no mismatch, not as suspicious", async () => {
    // Legacy rows and shops without GPS must not be punished at the counter.
    redemptionRow = row({ fraud_flags: [], distance_from_shop: null });
    const body = await (await POST(req({ otpCode: "123456" }))).json();
    expect(body.locationMismatch).toBe(false);
  });
});
