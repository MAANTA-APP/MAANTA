import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "../route";

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
let waitingRow: {
  id: string;
  expires_at: string;
  status?: "waiting" | "called";
  called_at?: string | null;
} | null;
let claimRow: { id: string } | null;
/** Rows the renew UPDATE matched — empty means it lost a race (D197). */
let renewMatched: Array<{ id: string }>;
/** Payloads passed to .update(), so a test can assert what was written. */
const queueUpdatePayloads: unknown[] = [];
let queueInsertError: { code: string } | null;
const queueInsert = vi.fn(() => Promise.resolve({ error: queueInsertError }));
let queueUpdateError: { code: string } | null;
const queueUpdateEqs = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc,
    from: (table: string) => {
      if (table === "merchants") {
        const merchantChain: Record<string, unknown> = {};
        merchantChain.select = () => merchantChain;
        merchantChain.eq = () => merchantChain;
        merchantChain.maybeSingle = () =>
          Promise.resolve({ data: merchantRow, error: null });
        return merchantChain;
      }
      if (table === "redemptions") {
        const claimChain: Record<string, unknown> = {};
        claimChain.select = () => claimChain;
        claimChain.eq = () => claimChain;
        claimChain.gt = () => claimChain;
        claimChain.maybeSingle = () =>
          Promise.resolve({ data: claimRow, error: null });
        return claimChain;
      }
      // merchant_presentations. `select` is overloaded in the real client: it
      // opens a read chain, and it also TERMINATES an update chain. The mock
      // mirrors that — after `.update(...)`, `.select()` resolves with the
      // rows the update actually matched (D197).
      const chain: Record<string, unknown> = {};
      let updating = false;
      let expiresAfter: string | null = null;
      chain.eq = (...args: unknown[]) => {
        queueUpdateEqs(args);
        return chain;
      };
      chain.in = (...args: unknown[]) => {
        queueUpdateEqs(args);
        return chain;
      };
      chain.gt = (_column: unknown, value: unknown) => {
        expiresAfter = String(value);
        return chain;
      };
      chain.select = () =>
        updating ? Promise.resolve({ data: renewMatched, error: queueUpdateError }) : chain;
      chain.maybeSingle = () => {
        const visible =
          waitingRow &&
          (!expiresAfter ||
            new Date(waitingRow.expires_at).getTime() >
              new Date(expiresAfter).getTime())
            ? { status: "waiting", called_at: null, ...waitingRow }
            : null;
        return Promise.resolve({ data: visible, error: null });
      };
      chain.insert = queueInsert;
      chain.update = (payload: unknown) => {
        updating = true;
        queueUpdatePayloads.push(payload);
        return chain;
      };
      return chain;
    },
  }),
}));

const TOKEN = "a".repeat(32);
/** Real UUID shape — the route shape-checks the id before the RPC (D201). */
const RID = "11111111-2222-4333-8444-555555555555";
/** A live (unlapsed) queue entry. */
const FUTURE = new Date(Date.now() + 5 * 60_000).toISOString();
/** A lapsed one. */
const PAST = new Date(Date.now() - 5 * 60_000).toISOString();

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
    claimRow = { id: RID };
    renewMatched = [{ id: "p-1" }];
    queueInsertError = null;
    queueUpdateError = null;
    queueUpdatePayloads.length = 0;
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
      req({ token: TOKEN, redemptionId: RID, merchantId: "evil-merchant" })
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_shopper_arrival", {
      p_user_id: "user-1",
      p_merchant_id: "merchant-token-1",
      p_redemption_id: RID,
    });
    const body = await res.json();
    expect(body.checkedIn).toBe(true);
    expect(body.fastVisitEligible).toBe(true);
    expect(body.merchantName).toBe("Pepper Pot");
  });

  it("answers identically for a wrong token and a non-active shop", async () => {
    merchantRow = null;
    const wrong = await POST(req({ token: TOKEN, redemptionId: RID }));
    merchantRow = {
      id: "m",
      merchant_name: "x",
      node: null,
      status: "suspended",
      is_visible: true,
      is_shadow_banned: false,
    };
    const suspended = await POST(req({ token: TOKEN, redemptionId: RID }));
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
      const res = await POST(req({ token: TOKEN, redemptionId: RID }));
      expect(res.status, message).toBe(status);
      expect((await res.json()).code, message).toBe(code);
    }
  });

  it("renews an existing waiting entry instead of inserting a duplicate", async () => {
    waitingRow = { id: "p-1", expires_at: FUTURE };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    const body = await res.json();
    expect(body.renewed).toBe(true);
    expect(queueInsert).not.toHaveBeenCalled();
  });

  it("falls back to a fresh insert when the renew loses a race (D197)", async () => {
    // Staff dismissed the entry (or the shopper cancelled in another tab)
    // between the select and the update, so the renew matches zero rows. The
    // shopper must end up really queued, not merely told that they are.
    waitingRow = { id: "p-1", expires_at: FUTURE };
    renewMatched = [];
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    const body = await res.json();
    expect(body.checkedIn).toBe(true);
    expect(body.renewed).toBe(false);
    expect(queueInsert).toHaveBeenCalled();
  });

  it("does not claim queue success when persistence fails", async () => {
    queueInsertError = { code: "XX000" };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("queue_not_joined");
    expect(body.checkedIn).not.toBe(true);
    expect(body.arrivalRecorded).toBe(true);
    expect(arrivalCapture).toHaveBeenCalled();
    expect(queueCapture).not.toHaveBeenCalled();
  });

  it("does not treat a 23505 from a LAPSED waiting row as queue success", async () => {
    waitingRow = { id: "p-1", expires_at: PAST };
    renewMatched = [];
    queueUpdateError = { code: "XX000" };
    queueInsertError = { code: "23505" };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("queue_not_joined");
    expect(body.checkedIn).not.toBe(true);
  });

  it("accepts a 23505 only when a concurrent LIVE waiting row is confirmed", async () => {
    waitingRow = { id: "p-1", expires_at: FUTURE };
    renewMatched = [];
    queueInsertError = { code: "23505" };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    expect(res.status).toBe(200);
    expect((await res.json()).checkedIn).toBe(true);
  });

  it("supersedes a LAPSED entry with a fresh arrival time (D199)", async () => {
    // Scanned the entrance sticker long ago, the entry lapsed off the staff
    // list, now scanning the till sticker. Reviving the old row with its
    // original arrived_at would re-list them as "arrived 40m ago" and sort
    // them ahead of everyone who checked in since.
    waitingRow = { id: "p-1", expires_at: PAST };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    const body = await res.json();
    expect(body.checkedIn).toBe(true);
    // Superseding a dead entry is a fresh check-in, not a renew.
    expect(body.renewed).toBe(false);
    // The update must restamp arrived_at, not just extend the expiry.
    const payload = queueUpdatePayloads.at(-1) as Record<string, unknown>;
    expect(payload).toHaveProperty("arrived_at");
    expect(payload).toHaveProperty("expires_at");
    // ...and it must not collide with the partial unique index by inserting.
    expect(queueInsert).not.toHaveBeenCalled();
  });

  it("extends a LIVE entry without moving its arrival time (D199)", async () => {
    waitingRow = { id: "p-1", expires_at: FUTURE };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    expect((await res.json()).renewed).toBe(true);
    const payload = queueUpdatePayloads.at(-1) as Record<string, unknown>;
    expect(payload).toHaveProperty("expires_at");
    expect(
      payload,
      "a re-scan by someone already queued is not a new arrival"
    ).not.toHaveProperty("arrived_at");
  });

  it("preserves an already-called state when the shopper scans again", async () => {
    const calledAt = new Date(Date.now() - 30_000).toISOString();
    waitingRow = { id: "p-1", expires_at: FUTURE, status: "called", called_at: calledAt };
    const res = await POST(req({ token: TOKEN, redemptionId: RID }));
    expect(await res.json()).toMatchObject({
      checkedIn: true,
      queueStatus: "called",
      calledAt,
    });
    expect(queueUpdatePayloads.at(-1)).toEqual(expect.objectContaining({ expires_at: expect.any(String) }));
  });

  it("rejects a non-UUID redemption id with 400, not a 500 (D201)", async () => {
    const res = await POST(req({ token: TOKEN, redemptionId: "abc" }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a malformed token before touching anything", async () => {
    const res = await POST(req({ token: "not-a-token", redemptionId: RID }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("emits arrival + queue analytics attributed to the shopper", async () => {
    await POST(req({ token: TOKEN, redemptionId: RID }));
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

describe("GET /api/qr/check-in", () => {
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
    waitingRow = { id: "p-1", expires_at: FUTURE };
    claimRow = { id: RID };
  });

  const getReq = () =>
    new Request(
      `http://localhost/api/qr/check-in?token=${TOKEN}&redemptionId=${RID}`
    );

  it("confirms only a live queue row backed by a live owned claim", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      checkedIn: true,
      expiresAt: FUTURE,
      queueStatus: "waiting",
      calledAt: null,
    });
  });

  it("reports lapsed when either the queue row or claim is no longer live", async () => {
    waitingRow = null;
    const noQueue = await GET(getReq());
    expect(await noQueue.json()).toEqual({
      checkedIn: false,
      expiresAt: null,
      queueStatus: null,
      calledAt: null,
    });

    waitingRow = { id: "p-1", expires_at: FUTURE };
    claimRow = null;
    const noClaim = await GET(getReq());
    expect(await noClaim.json()).toEqual({
      checkedIn: false,
      expiresAt: null,
      queueStatus: null,
      calledAt: null,
    });
  });
});

describe("DELETE /api/qr/check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitingRow = null;
    renewMatched = [{ id: "p-1" }];
    queueInsertError = null;
    queueUpdateError = null;
    queueUpdatePayloads.length = 0;
  });

  it("requires a redemption id", async () => {
    const res = await DELETE(req({}, "DELETE"));
    expect(res.status).toBe(400);
  });

  it("returns a retryable failure when the queue update errors", async () => {
    queueUpdateError = { code: "XX000" };
    const res = await DELETE(req({ redemptionId: RID }, "DELETE"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("queue_cancel_failed");
    expect(body.cancelled).not.toBe(true);
  });

  it("is idempotently successful when the waiting row is already absent", async () => {
    renewMatched = [];
    const res = await DELETE(req({ redemptionId: RID }, "DELETE"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: true, changed: false });
  });
});
