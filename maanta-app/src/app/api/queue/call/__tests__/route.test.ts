import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const { rpc, notifyShopper } = vi.hoisted(() => ({
  rpc: vi.fn(),
  notifyShopper: vi.fn(),
}));

vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: vi.fn(() =>
    Promise.resolve({
      ctx: {
        merchant: { id: "10000000-0000-4000-8000-000000000001" },
        user: { id: "20000000-0000-4000-8000-000000000002" },
      },
    })
  ),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/notify-shopper", () => ({ notifyShopper }));

const presentationId = "30000000-0000-4000-8000-000000000003";
function request(id: unknown = presentationId) {
  return new Request("http://localhost/api/queue/call", {
    method: "POST",
    body: JSON.stringify({ presentationId: id }),
  });
}

function result(newlyCalled: boolean) {
  return {
    single: () =>
      Promise.resolve({
        data: {
          presentation_id: presentationId,
          shopper_id: "40000000-0000-4000-8000-000000000004",
          merchant_name: "Amina Shop",
          qr_token: "a".repeat(32),
          called_at: "2026-09-01T12:00:00Z",
          newly_called: newlyCalled,
        },
        error: null,
      }),
  };
}

describe("POST /api/queue/call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReturnValue(result(true));
    notifyShopper.mockResolvedValue(true);
  });

  it("passes only authenticated merchant and actor context to the atomic RPC", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("call_shopper_forward", {
      p_presentation_id: presentationId,
      p_merchant_id: "10000000-0000-4000-8000-000000000001",
      p_actor_id: "20000000-0000-4000-8000-000000000002",
    });
  });

  it("sends push only after a newly committed call", async () => {
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ called: true, newlyCalled: true });
    expect(notifyShopper).toHaveBeenCalledWith(
      expect.anything(),
      "40000000-0000-4000-8000-000000000004",
      expect.objectContaining({
        body: "It's your turn — please go to the counter.",
        url: `/qr/${"a".repeat(32)}`,
      })
    );
  });

  it("does not duplicate push on an idempotent retry", async () => {
    rpc.mockReturnValue(result(false));
    await POST(request());
    expect(notifyShopper).not.toHaveBeenCalled();
  });

  it("reports the durable call when the best-effort push rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    notifyShopper.mockRejectedValueOnce(new Error("push transport down"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      called: true,
      newlyCalled: true,
      pushDelivered: false,
    });
    consoleError.mockRestore();
  });

  it("rejects malformed ids before touching the database", async () => {
    const response = await POST(request("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
