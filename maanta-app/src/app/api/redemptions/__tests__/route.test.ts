import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Phone-required-at-claim gate (S2 ruling 2026-07-23). Launch auth allows
// email-only sign-in, but a claim needs a verified phone. This locks the server
// gate at THIS ROUTE: a phone-less session is rejected with a typed
// `phone_required` 403 and claim_deal is not called; a verified-phone session
// passes through. The gate is app-layer only — claim_deal has no phone check of
// its own (D84) — so this guards the enforcement point, not an RPC-level invariant.

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

const serviceRpcMock = vi.fn();
const serviceFromMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: serviceRpcMock, from: serviceFromMock }),
}));

const w3wMock = vi.fn();
vi.mock("@/lib/what3words", () => ({
  convertWhat3WordsToCoordinates: (...args: unknown[]) => w3wMock(...args),
  distanceMeters: () => 12,
}));

// Most tests run without GPS, so the post-claim enrichment block is skipped
// entirely. The enrichment-deadline suite below flips this on.
let gpsResult: { lat: number; lng: number } | null = null;
vi.mock("@/lib/geo", () => ({
  parseGpsCoords: () => gpsResult,
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

/**
 * Error mapping (P0, 2026-08-14).
 *
 * Two RPC failures reached the shopper as an unexplained 500 before this:
 * `deal_not_active`, which claim_deal raises and nothing here matched, and
 * "permission denied for function claim_deal", which is what Postgres returns
 * when the request arrives as `anon` — a missing or rejected Clerk token. The
 * second is the worse of the two: an expired session was presented as a server
 * fault, so the one action that would have fixed it was never suggested.
 *
 * Every case also asserts the DB's own wording does not escape to the client.
 */
describe("POST /api/redemptions — RPC error mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppUserMock.mockResolvedValue({ id: "user-1" });
    hasPhoneMock.mockResolvedValue(true);
  });

  it("maps deal_not_active to 410 instead of a generic 500", async () => {
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "deal_not_active" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("This deal isn't running right now.");
    expect(body.error).not.toMatch(/could not start redemption/i);
  });

  it("maps a permission-denied RPC error to a typed 401, not a 500", async () => {
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function claim_deal' },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("sign_in_required");
    expect(body.error).toBe("Your session has expired — sign in again to claim.");
    // The database's wording names a function and a role. It must not ship.
    expect(JSON.stringify(body)).not.toMatch(/permission denied|claim_deal/i);
  });

  it("maps the RPC's own unauthorized to the same typed 401", async () => {
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "unauthorized: no authenticated caller identity" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: "sign_in_required" });
  });

  it("types the signed-out 401 so the client can route to login", async () => {
    ensureAppUserMock.mockResolvedValue(null);

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: "sign_in_required" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("keeps duplicate-claim protection: a second claim is a 409, never a new ticket", async () => {
    // Idempotency evidence. claim_deal refuses a second pending, unexpired
    // redemption for the same (deal, user) — so a shopper who retries after a
    // lost response is told about the ticket they already have rather than
    // being issued a second one. No schema or RPC change was needed for this;
    // the constraint already existed and this locks the mapping to it.
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "active_claim_already_exists: red-1" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "You already have an active claim on this deal.",
    });
  });

  it("leaves an unrecognised RPC error as a generic 500 with no internals", async () => {
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "syntax error at or near \"$1\"" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Could not start redemption. Please try again.");
    expect(JSON.stringify(body)).not.toMatch(/syntax error/i);
  });
});

/**
 * Post-claim enrichment must never cost the shopper their ticket (P0, 2026-08-14).
 *
 * This is the incident's mechanism, not a hypothetical. The redemption row is
 * committed by `claim_deal` before any enrichment runs, but the enrichment used
 * to sit between that commit and the HTTP response — and it opened with an
 * unbounded call to what3words. A slow provider therefore ran the invocation
 * into the platform timeout, and the shopper received a non-JSON 504 for a
 * claim that had already succeeded.
 *
 * The enrichment now runs under a hard deadline, so the case below — a provider
 * that never answers at all — still yields the ticket.
 */
describe("POST /api/redemptions — enrichment cannot fail a committed claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppUserMock.mockResolvedValue({ id: "user-1" });
    hasPhoneMock.mockResolvedValue(true);
    gpsResult = { lat: 59.91, lng: 10.75 };
    rpcSingleMock.mockResolvedValue({
      data: {
        redemption_id: "red-1",
        otp_code: "123456",
        redemption_expires_at: "2026-08-14T12:00:00Z",
        merchant_id: "merchant-1",
        what3words_address: "stove.cactus.rally",
      },
      error: null,
    });
  });

  afterEach(() => {
    gpsResult = null;
  });

  it("returns the ticket even when what3words never answers", async () => {
    // Never resolves — the worst case, and the one that used to take the whole
    // invocation down with it.
    w3wMock.mockImplementation(() => new Promise(() => {}));

    const res = await POST(req({ dealId: "deal-1", lat: 59.91, lng: 10.75 }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      redemptionId: "red-1",
      expiresAt: "2026-08-14T12:00:00Z",
    });
    // The claim RPC still ran and committed; only the enrichment was abandoned.
    expect(rpcMock).toHaveBeenCalledWith("claim_deal", expect.anything());
  }, 10_000);

  it("returns the ticket when the provider throws", async () => {
    w3wMock.mockRejectedValue(new Error("upstream exploded"));
    serviceRpcMock.mockResolvedValue({ data: [], error: null });
    serviceFromMock.mockReturnValue({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    });

    const res = await POST(req({ dealId: "deal-1", lat: 59.91, lng: 10.75 }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ redemptionId: "red-1" });
  });

  it("still enriches on the happy path — the control is bounded, not removed", async () => {
    w3wMock.mockResolvedValue({ lat: -1.28, lng: 36.85 });
    serviceRpcMock.mockResolvedValue({ data: ["distance_anomaly"], error: null });
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    serviceFromMock.mockReturnValue({ update: updateSpy });

    const res = await POST(req({ dealId: "deal-1", lat: 59.91, lng: 10.75 }));

    expect(res.status).toBe(200);
    expect(serviceRpcMock).toHaveBeenCalledWith("guardian_check", expect.anything());
    // review_required is a fraud control — moving enrichment off the critical
    // path must not stop it being written when the provider is healthy.
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ review_required: true, fraud_flags: ["distance_anomaly"] })
    );
  });
});
