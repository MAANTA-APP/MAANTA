import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D171 — the blacklist write path.
 *
 * The database owns what blacklisting MEANS (covered by
 * `supabase/tests/user_blacklist_enforcement_test.sql`). These cover who may
 * set it and what gets recorded — the half that lives in the route.
 */

const requireAdminApi = vi.fn();
vi.mock("@/lib/admin", () => ({ requireAdminApi: () => requireAdminApi() }));

const logAdminOp = vi.fn(
  (...args: [unknown, Record<string, unknown>]): Promise<void> => {
    void args;
    return Promise.resolve();
  }
);
vi.mock("@/lib/admin-audit", () => ({
  logAdminOp: (client: unknown, entry: Record<string, unknown>) =>
    logAdminOp(client, entry),
}));

let targetRow: Record<string, unknown> | null;
let updateResult: { data: unknown; error: unknown };
const updates: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: targetRow, error: null });
      chain.update = (patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          eq: () => ({ select: () => Promise.resolve(updateResult) }),
        };
      };
      return chain;
    },
  }),
}));

import { POST } from "../route";

const req = (body: unknown) =>
  new Request("http://localhost/api/admin/customers/u-1/ops", {
    method: "POST",
    body: JSON.stringify(body),
  });
const params = { params: { id: "u-1" } };

describe("POST /api/admin/customers/[id]/ops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    requireAdminApi.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    targetRow = { id: "u-1", role: "customer", is_blacklisted: false };
    updateResult = { data: [{ id: "u-1", is_blacklisted: true }], error: null };
  });

  it("refuses a caller the admin guard rejects, and writes nothing", async () => {
    const { NextResponse } = await import("next/server");
    requireAdminApi.mockResolvedValue({
      error: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    });
    const res = await POST(req({ action: "blacklist" }), params);
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
    expect(logAdminOp).not.toHaveBeenCalled();
  });

  it("blacklists a shopper and records who did it", async () => {
    const res = await POST(req({ action: "blacklist" }), params);
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ is_blacklisted: true }]);
    expect(logAdminOp).toHaveBeenCalledTimes(1);
    const entry = logAdminOp.mock.calls[0][1];
    expect(entry).toMatchObject({
      adminUserId: "admin-1",
      action: "user.blacklist",
      targetType: "user",
      targetId: "u-1",
    });
  });

  it("unblacklists on the opposite action", async () => {
    targetRow = { id: "u-1", role: "customer", is_blacklisted: true };
    updateResult = { data: [{ id: "u-1", is_blacklisted: false }], error: null };
    const res = await POST(req({ action: "unblacklist" }), params);
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ is_blacklisted: false }]);
  });

  it("rejects an unknown action rather than guessing", async () => {
    const res = await POST(req({ action: "ban-forever" }), params);
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("refuses to blacklist a non-shopper account", async () => {
    // The block means "issue no more deal codes", which says nothing coherent
    // about a merchant or admin login.
    targetRow = { id: "u-1", role: "merchant_admin", is_blacklisted: false };
    const res = await POST(req({ action: "blacklist" }), params);
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("refuses to let an admin blacklist their own account", async () => {
    targetRow = { id: "admin-1", role: "customer", is_blacklisted: false };
    const res = await POST(req({ action: "blacklist" }), { params: { id: "admin-1" } });
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("404s an unknown customer instead of reporting a phantom success", async () => {
    targetRow = null;
    const res = await POST(req({ action: "blacklist" }), params);
    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it("never trusts a role supplied in the request body", async () => {
    const { NextResponse } = await import("next/server");
    requireAdminApi.mockResolvedValue({
      error: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    });
    const res = await POST(
      req({ action: "blacklist", role: "admin", isAdmin: true }),
      params
    );
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });
});
