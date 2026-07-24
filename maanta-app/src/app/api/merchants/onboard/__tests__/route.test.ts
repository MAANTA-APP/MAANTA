import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Agent-attribution wiring (walkthrough G1). The route no longer hardcodes
// p_onboarding_agent_id: null — it forwards the wizard's captured agent id as
// attribution, or null for a self-serve "No". The merchant (appUser.id) is
// always the authenticated submitter (p_user_id). The DB-side attribution rules
// are covered by supabase/tests/onboard_agent_attribution_test.sql.

const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ rpc: rpcMock }),
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
    ensureAppUserMock.mockResolvedValue({ id: "merchant-user-1", role: "customer" });
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
