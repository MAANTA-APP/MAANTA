import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Agent-attribution wiring (walkthrough G1). The route no longer hardcodes
// p_onboarding_agent_id: null — it forwards the wizard's captured agent id as
// attribution, or null for a self-serve "No". The merchant (appUser.id) is
// always the authenticated submitter (p_user_id). The DB-side attribution rules
// are covered by supabase/tests/onboard_agent_attribution_test.sql.

const rpcMock = vi.fn();
// The route runs onboard_merchant via the service client (it promotes the
// user's role, which the prevent_self_role_escalation trigger only allows for
// service_role/admin); ensureAppUser is the trust boundary. See the route.
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));

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

const baseBody = {
  merchantName: "Shop",
  what3wordsAddress: "stove.cactus.rally",
  phone: "+254700000000",
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
