import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, DELETE } from "../route";

// The QR check-in route. The properties that matter:
//
//   1. the merchant comes from the TOKEN, resolved server-side — the arrival
//      RPC is called with the token's merchant id, and nothing from the
//      request body can redirect it;
//   2. the arrival goes through the AUTHENTICATED client, so the RPC's
//      caller-must-own-the-claim check is live;
//   3. RPC refusals map to typed responses (mismatch, expired, not-pending,
//      not-found) rather than a generic 500;
//   4. a re-scan renews the existing queue entry instead of duplicating it;
//   5. an inactive/hidden/banned shop answers exactly like a wrong token.

vi.mock("@/lib/auth", () => ({
  ensureAppUser: vi.fn(() => Promise.resolve({ id: "user-1" })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
}));

const arrivalCapture = vi.fn();
const queueCapture = vi.fn();
vi.mock("@/lib/analytics", () => ({
  captureMerchantArrivalRecorded: (...a: unknown[]) => {
    arrivalCapture(...a);
    return Promise.resolve();
  },
  captureShopperQueueJoined: (...a: unknown[]) => {
    queueCapture(...a);
    return Promise.resolve();
  },
}));

// The arrival RPC rides the SERVICE client (server-only since Codex P1 —
// authenticated cannot execute it, so this route is the only door and the
// token check is what it evidences).
const rpcSingle = vi.fn();
const rpc = vi.fn(() => ({ single: rpcSingle }));

// Service client — arrival RPC + token resolve + queue rows.
let merchantRow: Record<string, unknown> | null;
let waitingRow: { id: string; expires_at: string } | null;
/** Rows the renew UPDATE matched — empty means it lost a race (D195). */
let renewMatched: Array<{ id: string }>;
const queueInsert = vi.fn(() => Promise.resolve({ error: null }));
const queueUpdateEqs = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc,
    from: (table: string) => {
      if (table === "merchants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: merchantRow, error: null }),
            }),
          }),
        };
      }
      // merchant_presentations. `select` is overloaded in the real client: it
      // opens a read chain, and it also TERMINATES an update chain. The mock
      // mirrors that — after `.update(...)`, `.select()` resolves with the
      // rows the update actually matched (D195).
      const chain: Record<string, unknown> = {};
      let updating = false;
      chain.eq = (...args: unknown[]) => {
        queueUpdateEqs(args);
        return chain;
      };
      chain.gt = () => chain;
      chain.select = () =>
        updating ? Promise.resolve({ data: renewMatched, error: null }) : chain;
      chain.maybeSingle = () => Promise.resolve({ data: waitingRow, error: null });
      chain.insert = queueInsert;
      chain.update = () => {
        updating = true;
        return chain;
      };
      return chain;
    },
  }),
}));

const TOKEN = "a".repeat(32);

function req(body: unknown, method = "POST") {
  return new Request("http://localhost/api/qr/check-in", {
    method,
    body: JSON.stringify(body),
  });
}

describe("POST /api/qr/check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    merchantRow = {
      id: "merchant-token-1",
      merchant_name: "Pepper Pot",
      node: "BBS Mall",
      status: "active",
      is_visible: true,
      is_shadow_banned: false,
    };
    waitingRow = null;
    renewMatched = [{ id: "p-1" }];
    rpcSingle.mockResolvedValue({
      data: {
        arrived_at: "2026-08-26T12:08:00.000Z",
        fast_visit_eligible: true,
        first_arrival: true,
      },
      error: null,
    });
  });

  it("records arrival at the TOKEN's merchant — never a body-supplied one", async () => {
    const res = await POST(
      req({ token: TOKEN, redemptionId: "red-1", merchantId: "evil-merchant" })
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_shopper_arrival", {
      p_user_id: "user-1",
      p_merchant_id: "merchant-token-1",
      p_redemption_id: "red-1",
    });
    const body = await res.json();
    expect(body.checkedIn).toBe(true);
    expect(body.fastVisitEligible).toBe(true);
    expect(body.merchantName).toBe("Pepper Pot");
  });

  it("answers identically for a wrong token and a non-active shop", async () => {
    merchantRow = null;
    const wrong = await POST(req({ token: TOKEN, redemptionId: "red-1" }));
    merchantRow = {
      id: "m",
      merchant_name: "x",
      node: null,
      status: "suspended",
      is_visible: true,
      is_shadow_banned: false,
    };
    const suspended = await POST(req({ token: TOKEN, redemptionId: "red-1" }));
    expect(wrong.status).toBe(404);
    expect(suspended.status).toBe(404);
    expect((await wrong.json()).code).toBe("shop_not_found");
    expect((await suspended.json()).code).toBe("shop_not_found");
  });

  it("maps the RPC's typed refusals", async () => {
    const cases: Array<[string, number, string]> = [
      ["arrival_merchant_mismatch", 409, "merchant_mismatch"],
      ["arrival_claim_expired", 410, "claim_expired"],
      ["arrival_claim_not_pending", 409, "claim_not_pending"],
      ["arrival_claim_not_found", 404, "claim_not_found"],
    ];
    for (const [message, status, code] of cases) {
      rpcSingle.mockResolvedValue({ data: null, error: { message } });
      const res = await POST(req({ token: TOKEN, redemptionId: "red-1" }));
      expect(res.status, message).toBe(status);
      expect((await res.json()).code, message).toBe(code);
    }
  });

  it("renews an existing waiting entry instead of inserting a duplicate", async () => {
    waitingRow = { id: "p-1", expires_at: "2026-08-26T12:15:00.000Z" };
    const res = await POST(req({ token: TOKEN, redemptionId: "red-1" }));
    const body = await res.json();
    expect(body.renewed).toBe(true);
    expect(queueInsert).not.toHaveBeenCalled();
  });

  it("falls back to a fresh insert when the renew loses a race (D195)", async () => {
    // Staff dismissed the entry (or the shopper cancelled in another tab)
    // between the select and the update, so the renew matches zero rows. The
    // shopper must end up really queued, not merely told that they are.
    waitingRow = { id: "p-1", expires_at: "2026-08-26T12:15:00.000Z" };
    renewMatched = [];
    const res = await POST(req({ token: TOKEN, redemptionId: "red-1" }));
    const body = await res.json();
    expect(body.checkedIn).toBe(true);
    expect(body.renewed).toBe(false);
    expect(queueInsert).toHaveBeenCalled();
  });

  it("refuses a malformed token before touching anything", async () => {
    const res = await POST(req({ token: "not-a-token", redemptionId: "red-1" }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("emits arrival + queue analytics attributed to the shopper", async () => {
    await POST(req({ token: TOKEN, redemptionId: "red-1" }));
    expect(arrivalCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        merchantId: "merchant-token-1",
        fastVisitEligible: true,
      })
    );
    expect(queueCapture).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", renewed: false })
    );
  });
});

describe("DELETE /api/qr/check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitingRow = null;
    renewMatched = [{ id: "p-1" }];
  });

  it("requires a redemption id", async () => {
    const res = await DELETE(req({}, "DELETE"));
    expect(res.status).toBe(400);
  });
});
