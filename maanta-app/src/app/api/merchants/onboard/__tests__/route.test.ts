import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Agent-attribution wiring (walkthrough G1). The route no longer hardcodes
// p_onboarding_agent_id: null — it forwards the wizard's captured agent id as
// attribution, or null for a self-serve "No". The merchant (appUser.id) is
// always the authenticated submitter (p_user_id). The DB-side attribution rules
// are covered by supabase/tests/onboard_agent_attribution_test.sql.

const rpcMock = vi.fn();
// `from` is mocked so a stray table write is OBSERVABLE rather than a thrown
// "not a function". Since D162 the route must not touch `merchants` directly at
// all: the location is written inside onboard_merchant, in the same statement
// as the shop row.
const fromMock = vi.fn();
// The route runs onboard_merchant via the service client (it promotes the
// user's role, which the prevent_self_role_escalation trigger only allows for
// service_role/admin); ensureAppUser is the trust boundary. See the route.
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: rpcMock, from: fromMock }),
}));

// what3words is enrichment since D162 and must never be reached on a path that
// already has coordinates plus an address. Where it IS reached, the tests below
// drive it explicitly.
const convertTo3WordsMock = vi.fn();
vi.mock("@/lib/what3words", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/what3words")>();
  return { ...actual, convertTo3Words: (...args: unknown[]) => convertTo3WordsMock(...args) };
});

const ensureAppUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  ensureAppUser: () => ensureAppUserMock(),
  currentClerkUserId: () => Promise.resolve(null),
}));

vi.mock("@/lib/analytics", () => ({
  captureMerchantOnboarded: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  ONBOARD_RATE_LIMIT: 5,
  ONBOARD_RATE_WINDOW_SECONDS: 3600,
}));

function req(body: unknown) {
  return new Request("http://localhost/api/merchants/onboard", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Coordinates are required on this route since D162 — the shop's location is
// what the merchant confirms on the map, and what3words is optional enrichment.
const baseBody = {
  merchantName: "Shop",
  what3wordsAddress: "stove.cactus.rally",
  phone: "+254700000000",
  lat: -1.2746,
  lng: 36.8501,
};

describe("POST /api/merchants/onboard — agent attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppUserMock.mockResolvedValue({
      id: "merchant-user-1",
      role: "customer",
      email: null,
    });
    rpcMock.mockResolvedValue({ data: "merchant-1", error: null });
  });

  const AGENT_UUID = "22222222-2222-2222-2222-222222222222";

  it("forwards the selected agent id as p_onboarding_agent_id (merchant stays submitter)", async () => {
    const res = await POST(req({ ...baseBody, onboardingAgentId: AGENT_UUID }));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({
        p_user_id: "merchant-user-1",
        p_onboarding_agent_id: AGENT_UUID,
      })
    );
  });

  it("rejects a malformed (non-UUID) agent id with 400 before the RPC", async () => {
    const res = await POST(req({ ...baseBody, onboardingAgentId: "agent-9" }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sends null when no agent was selected (self-serve 'No')", async () => {
    const res = await POST(req(baseBody));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_onboarding_agent_id: null })
    );
  });

  it("treats a blank/whitespace agent id as null", async () => {
    await POST(req({ ...baseBody, onboardingAgentId: "   " }));
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_onboarding_agent_id: null })
    );
  });

  it("maps the RPC's invalid_attribution to a 400 (valid-format id, rejected by the RPC)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "invalid_attribution: p_onboarding_agent_id does not reference an active agent" },
    });
    const res = await POST(req({ ...baseBody, onboardingAgentId: AGENT_UUID }));
    expect(res.status).toBe(400);
    expect(rpcMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D158 (founder ruling 2026-08-23, option B): owner phone is optional when the
// submitting ACCOUNT carries a verified email. The route is the gate — the
// wizard's disabled-Continue is only a convenience — so these assert the
// server's behaviour directly, including that a client cannot claim the
// exemption for itself.
// ---------------------------------------------------------------------------
describe("POST /api/merchants/onboard — D158 optional owner phone", () => {
  const bodyNoPhone = {
    merchantName: "Shop",
    what3wordsAddress: "stove.cactus.rally",
    lat: -1.2746,
    lng: 36.8501,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: "merchant-1", error: null });
  });

  function signedInAs(email: string | null) {
    ensureAppUserMock.mockResolvedValue({
      id: "merchant-user-1",
      role: "customer",
      email,
    });
  }

  it("onboards with no phone when the account has a verified email", async () => {
    signedInAs("owner@example.com");
    const res = await POST(req(bodyNoPhone));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_phone: null })
    );
  });

  it("falls back to the verified address as the shop contact when no phone is given", async () => {
    // merchants_contact_present requires at least one channel; an email-only
    // onboarding that also left the contact email null would hit the CHECK.
    signedInAs("owner@example.com");
    await POST(req(bodyNoPhone));
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_phone: null, p_email: "owner@example.com" })
    );
  });

  it("prefers an email the merchant typed over the account address", async () => {
    signedInAs("owner@example.com");
    await POST(req({ ...bodyNoPhone, email: "shop@example.com" }));
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_email: "shop@example.com" })
    );
  });

  it("rejects a missing phone when the account has NO verified email", async () => {
    signedInAs(null);
    const res = await POST(req(bodyNoPhone));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("treats a blank or whitespace phone as absent, not as a value to validate", async () => {
    signedInAs(null);
    const res = await POST(req({ ...bodyNoPhone, phone: "   " }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied hasVerifiedEmail claim", async () => {
    // The exemption is derived from the session, never asserted by the caller.
    signedInAs(null);
    const res = await POST(req({ ...bodyNoPhone, hasVerifiedEmail: true }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("still format-checks a phone that IS supplied, verified email or not", async () => {
    signedInAs("owner@example.com");
    const res = await POST(req({ ...bodyNoPhone, phone: "+4712345678" }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("keeps a valid supplied phone, and does not overwrite email with the account address", async () => {
    signedInAs("owner@example.com");
    const res = await POST(req({ ...bodyNoPhone, phone: "+254700000000" }));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_phone: "+254700000000", p_email: null })
    );
  });

  it("maps the RPC's contact_required to a 400", async () => {
    signedInAs("owner@example.com");
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "contact_required: a phone or an email is required" },
    });
    const res = await POST(req(bodyNoPhone));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// D162 (founder ruling 2026-08-24): browser geolocation replaces mandatory
// what3words. Coordinates are the canonical store location and are required
// here; what3words is optional enrichment whose failure must not be felt.
// ---------------------------------------------------------------------------
describe("POST /api/merchants/onboard — D162 coordinate-first location", () => {
  const NAIROBI = { lat: -1.2746, lng: 36.8501 };
  const coordsOnlyBody = {
    merchantName: "Shop",
    phone: "+254700000000",
    ...NAIROBI,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppUserMock.mockResolvedValue({
      id: "merchant-user-1",
      role: "customer",
      email: "owner@example.com",
    });
    rpcMock.mockResolvedValue({ data: "merchant-1", error: null });
    convertTo3WordsMock.mockResolvedValue({
      ok: false,
      code: "upstream_rejected",
      error: "Address lookup is temporarily unavailable.",
    });
  });

  it("onboards on coordinates alone, with no what3words address anywhere", async () => {
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_lat: NAIROBI.lat, p_lng: NAIROBI.lng, p_w3w_address: null })
    );
  });

  it("stores the coordinates it was given — the confirmed pin, not a re-derived one", async () => {
    // The wizard sends the pin the merchant confirmed, which may be one they
    // dragged after a poor reading. The server must not substitute anything.
    const dragged = { lat: -1.27512, lng: 36.85077 };
    const res = await POST(req({ ...coordsOnlyBody, ...dragged }));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_lat: dragged.lat, p_lng: dragged.lng })
    );
  });

  it("writes the location through the RPC, never as a second update on merchants", async () => {
    // It used to be a post-insert UPDATE whose failure was logged and swallowed,
    // so a shop with no location was one swallowed error away.
    await POST(req(coordsOnlyBody));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a submission with no coordinates, before the RPC", async () => {
    const res = await POST(req({ merchantName: "Shop", phone: "+254700000000" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "location_required" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a what3words-only submission — the address is no longer the location", async () => {
    const res = await POST(
      req({ merchantName: "Shop", phone: "+254700000000", what3wordsAddress: "stove.cactus.rally" })
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects half a coordinate pair", async () => {
    expect((await POST(req({ ...coordsOnlyBody, lng: null }))).status).toBe(400);
    expect((await POST(req({ ...coordsOnlyBody, lat: null }))).status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range and non-numeric coordinates", async () => {
    expect((await POST(req({ ...coordsOnlyBody, lat: 91 }))).status).toBe(400);
    expect((await POST(req({ ...coordsOnlyBody, lng: -181 }))).status).toBe(400);
    expect((await POST(req({ ...coordsOnlyBody, lat: "-1.2746", lng: "36.8501" }))).status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("completes onboarding when what3words is unavailable — quota, outage or no key", async () => {
    // This is the D162 defect in one assertion: a provider MAANTA does not
    // control must never be able to stop a merchant signing up.
    convertTo3WordsMock.mockResolvedValue({
      ok: false,
      code: "upstream_rejected",
      error: "Address lookup is temporarily unavailable.",
    });
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_w3w_address: null })
    );
  });

  it("completes onboarding when the what3words call throws outright", async () => {
    convertTo3WordsMock.mockRejectedValue(new Error("ECONNRESET"));
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_w3w_address: null })
    );
  });

  it("keeps the derived address when what3words does answer", async () => {
    convertTo3WordsMock.mockResolvedValue({
      ok: true,
      words: "stored.riches.shine",
      ...NAIROBI,
    });
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_w3w_address: "stored.riches.shine" })
    );
  });

  it("bounds the enrichment call so a hung provider cannot hold the request", async () => {
    await POST(req(coordsOnlyBody));
    const [, , timeoutMs] = convertTo3WordsMock.mock.calls[0] as [number, number, number];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(5000);
  });

  it("does not call what3words at all when the caller supplied an address", async () => {
    const res = await POST(req({ ...coordsOnlyBody, what3wordsAddress: "///stove.cactus.rally" }));
    expect(res.status).toBe(200);
    expect(convertTo3WordsMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith(
      "onboard_merchant",
      expect.objectContaining({ p_w3w_address: "stove.cactus.rally" })
    );
  });

  it("onboards the AUTHENTICATED user's shop and no one else's", async () => {
    // The location can only ever land on a shop this account is creating: the
    // route passes p_user_id from the session, and onboard_merchant refuses a
    // second shop for a user. A merchantId, userId or shop id in the body is
    // not read at all, so there is no request shape that points this write at
    // another merchant's row.
    const res = await POST(
      req({
        ...coordsOnlyBody,
        userId: "someone-else",
        merchantId: "another-merchants-shop",
        p_user_id: "another-merchants-shop",
      })
    );
    expect(res.status).toBe(200);
    const [, params] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(params.p_user_id).toBe("merchant-user-1");
    expect(Object.values(params)).not.toContain("another-merchants-shop");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("maps the RPC's location_required to an actionable 400, not a 500", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "location_required: shop coordinates or a what3words address are required" },
    });
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(400);
  });

  it("maps the RPC's invalid_coordinates to a 400", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "invalid_coordinates: outside the WGS84 range" },
    });
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(400);
  });

  it("still leaves the shop pending — approval is untouched by this ruling", async () => {
    const res = await POST(req(coordsOnlyBody));
    expect(res.status).toBe(200);
    const [, params] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    // onboard_merchant hardcodes status='pending'; the route must not be able
    // to ask for anything else.
    expect(Object.keys(params)).not.toContain("p_status");
  });
});
