import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// SEC-005. This route used to return `error.message` from activate_merchant
// straight to the client, which is how a raw Postgres exception — carrying
// table, column, constraint, trigger or RLS policy names — reaches the browser
// and the network tab. Every sibling admin route maps known failures to
// curated copy and keeps the detail in the server log; these tests lock this
// one to the same contract.
//
// The load-bearing assertion is the last one: an UNRECOGNISED error must not
// echo its message, because that is the case that leaks schema detail.

const requireAdminApiMock = vi.fn();
vi.mock("@/lib/admin", () => ({
  requireAdminApi: () => requireAdminApiMock(),
}));

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  }),
}));

const logAdminOpMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/admin-audit", () => ({
  logAdminOp: (...args: unknown[]) => logAdminOpMock(...args),
}));

const params = { params: { id: "merchant-1" } };

function req(body: unknown = {}) {
  return new Request("http://localhost/api/admin/merchants/merchant-1/approve", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/merchants/[id]/approve — error mapping (SEC-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiMock.mockResolvedValue({ user: { id: "admin-1" } });
    maybeSingleMock.mockResolvedValue({ data: { elite_trial_active: false } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("maps merchant_not_found to 404", async () => {
    rpcMock.mockResolvedValue({ error: { message: "merchant_not_found" } });
    const res = await POST(req(), params);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Shop not found." });
  });

  it("maps already_active to 409", async () => {
    rpcMock.mockResolvedValue({ error: { message: "already_active" } });
    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "This shop is already approved.",
    });
  });

  it("maps unauthorized to 403", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "unauthorized: p_admin_user_id does not match caller identity" },
    });
    const res = await POST(req(), params);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Not authorized." });
  });

  it("never echoes an unrecognised database error to the client", async () => {
    // The shape that leaks: a real Postgres message naming a relation, a
    // column and a constraint.
    const raw =
      'insert or update on table "merchants" violates foreign key constraint "merchants_node_fkey"';
    rpcMock.mockResolvedValue({ error: { message: raw } });

    const res = await POST(req(), params);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Could not approve this shop." });
    expect(JSON.stringify(body)).not.toContain("merchants_node_fkey");
    expect(JSON.stringify(body)).not.toContain("constraint");
    // The detail is not discarded — it goes to the server log.
    expect(console.error).toHaveBeenCalled();
  });

  it("does not write an audit row when activation failed", async () => {
    rpcMock.mockResolvedValue({ error: { message: "merchant_not_found" } });
    await POST(req(), params);

    expect(logAdminOpMock).not.toHaveBeenCalled();
  });

  it("still succeeds normally when the RPC returns no error", async () => {
    rpcMock.mockResolvedValue({ error: null });
    maybeSingleMock.mockResolvedValue({ data: { elite_trial_active: true } });

    const res = await POST(req({ grantEliteTrial: true }), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.eliteTrialGranted).toBe(true);
    expect(logAdminOpMock).toHaveBeenCalled();
  });
});
