import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Phone-required-at-claim gate (S2 ruling 2026-07-23). Launch auth allows
// email-only sign-in, but a claim needs a verified phone. This locks the server
// gate: a phone-less session is rejected with a typed `phone_required` 403 and
// the claim RPC is NEVER reached; a session with a verified phone passes through
// to claim_deal.

const ensureAppUserMock = vi.fn();
const hasPhoneMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  ensureAppUser: () => ensureAppUserMock(),
  currentClerkUserId: () => Promise.resolve(null),
  currentUserHasVerifiedPhone: () => hasPhoneMock(),
}));

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

// Chainable service `.from().select().eq().maybeSingle()` for the claim-code
// email's deal/merchant lookup; `.update().eq()` stays unused (no GPS here).
const maybeSingleMock = vi.fn();
const serviceFromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
  update: () => ({ eq: vi.fn() }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: vi.fn(), from: serviceFromMock }),
}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/resend", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

vi.mock("@/lib/what3words", () => ({
  convertWhat3WordsToCoordinates: vi.fn(),
  distanceMeters: vi.fn(),
}));

vi.mock("@/lib/geo", () => ({
  // No GPS in these tests → parseGpsCoords returns null.
  parseGpsCoords: () => null,
}));

vi.mock("@/lib/analytics", () => ({
  captureDealClaimed: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  CLAIM_RATE_LIMIT: 5,
  CLAIM_RATE_WINDOW_SECONDS: 60,
}));

function req(body: unknown) {
  return new Request("http://localhost/api/redemptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/redemptions — phone-required-at-claim gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppUserMock.mockResolvedValue({ id: "user-1" });
  });

  it("rejects an email-only (phone-less) session with a typed 403 and skips the RPC", async () => {
    hasPhoneMock.mockResolvedValue(false);

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("phone_required");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("lets a session with a verified phone through to claim_deal", async () => {
    hasPhoneMock.mockResolvedValue(true);
    rpcSingleMock.mockResolvedValue({
      data: {
        redemption_id: "red-1",
        otp_code: "123456",
        redemption_expires_at: "2026-07-24T12:00:00Z",
        merchant_id: "merchant-1",
        what3words_address: "stove.cactus.rally",
      },
      error: null,
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("claim_deal", expect.objectContaining({
      p_user_id: "user-1",
      p_deal_id: "deal-1",
    }));
    await expect(res.json()).resolves.toEqual({
      redemptionId: "red-1",
      expiresAt: "2026-07-24T12:00:00Z",
      codeEmailed: false,
    });
  });

  it("maps deal_paused to a 409 with a clear shopper message", async () => {
    hasPhoneMock.mockResolvedValue(true);
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "deal_paused" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "This deal is paused — no new claims right now.",
      code: "deal_paused",
    });
  });
});

// Pre-launch tester option (D74): opt-in email copy of the claim code.
// The claim is the product action; the email is a convenience — nothing on
// this path may fail the claim.
describe("POST /api/redemptions — email code delivery (pre-launch, D74)", () => {
  const claimData = {
    redemption_id: "red-1",
    otp_code: "123456",
    redemption_expires_at: "2026-07-24T12:00:00Z",
    merchant_id: "merchant-1",
    what3words_address: "stove.cactus.rally",
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hasPhoneMock.mockResolvedValue(true);
    ensureAppUserMock.mockResolvedValue({
      id: "user-1",
      email: "tester@example.com",
    });
    rpcSingleMock.mockResolvedValue({ data: claimData, error: null });
    maybeSingleMock.mockResolvedValue({
      data: {
        deals: { title: "2-for-1 lunch" },
        merchants: { merchant_name: "Java House" },
      },
    });
  });

  it("emails the code to the account email when the shopper opts in", async () => {
    sendEmailMock.mockResolvedValue(true);

    const res = await POST(req({ dealId: "deal-1", emailCode: true }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
    };
    expect(sent.to).toBe("tester@example.com");
    expect(sent.subject).toContain("2-for-1 lunch");
    // Code appears in the display format the ticket uses.
    expect(sent.text).toContain("123 456");
    await expect(res.json()).resolves.toMatchObject({ codeEmailed: true });
  });

  it("does not email when the shopper does not opt in", async () => {
    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ codeEmailed: false });
  });

  it("ignores the opt-in when the pre-launch flag is off", async () => {
    vi.stubEnv("MAANTA_EMAIL_CODE_DELIVERY", "off");

    const res = await POST(req({ dealId: "deal-1", emailCode: true }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ codeEmailed: false });
  });

  it("skips sending when the account has no email on file", async () => {
    ensureAppUserMock.mockResolvedValue({ id: "user-1", email: null });

    const res = await POST(req({ dealId: "deal-1", emailCode: true }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ codeEmailed: false });
  });

  it("never fails the claim when the email send throws", async () => {
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await POST(req({ dealId: "deal-1", emailCode: true }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      redemptionId: "red-1",
      codeEmailed: false,
    });
  });
});
