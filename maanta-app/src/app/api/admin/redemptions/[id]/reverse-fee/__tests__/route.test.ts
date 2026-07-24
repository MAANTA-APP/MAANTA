import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Decision-note-required contract (Decisions Log 2026-07-23). The mandatory
// note is enforced in three layers; this locks the ROUTE layer: an empty or
// whitespace-only note is rejected with 400 before the RPC is ever called, a
// valid note flows through to reverse_success_fee, and the RPC's own
// note_required backstop maps back to 400 (never a generic 500). The DB-level
// guard is covered by supabase/tests/fee_reversal_test.sql (scenario 6).

const requireAdminApiMock = vi.fn();
vi.mock("@/lib/admin", () => ({
  requireAdminApi: () => requireAdminApiMock(),
}));

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));

vi.mock("@/lib/admin-audit", () => ({
  logAdminOp: vi.fn().mockResolvedValue(undefined),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/admin/redemptions/red-1/reverse-fee", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = { params: { id: "red-1" } };

describe("POST /api/admin/redemptions/[id]/reverse-fee — note required", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiMock.mockResolvedValue({ user: { id: "admin-1" } });
  });

  it("rejects a missing note with 400 and never calls the RPC", async () => {
    const res = await POST(req({ incidentRef: "7" }), params);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "A decision note is required to reverse a fee.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only note with 400 and never calls the RPC", async () => {
    const res = await POST(req({ note: "   " }), params);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes a valid (trimmed) note through to reverse_success_fee", async () => {
    rpcSingleMock.mockResolvedValue({
      data: {
        reversal_id: "rev-1",
        transaction_id: "tx-1",
        amount: 30,
        new_balance: 100,
        new_arrears: 0,
      },
      error: null,
    });

    const res = await POST(
      req({ incidentRef: " 7 ", note: "  merchant honoured the deal  " }),
      params
    );

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("reverse_success_fee", {
      p_redemption_id: "red-1",
      p_admin_user_id: "admin-1",
      p_incident_ref: "7",
      p_note: "merchant honoured the deal",
    });
  });

  it("maps the RPC's note_required backstop to 400, not 500", async () => {
    // A note that is non-empty to the route but that the RPC still rejects
    // (defense in depth) must surface as 400.
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "note_required: a decision note is required to reverse a fee" },
    });

    const res = await POST(req({ note: "x" }), params);
    expect(res.status).toBe(400);
  });
});
