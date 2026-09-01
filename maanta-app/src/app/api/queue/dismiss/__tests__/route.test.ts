import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Staff dismissal of a queue entry. The two properties: the write is doubly
// scoped (row id AND the authenticated merchant's id — a staff member cannot
// dismiss another shop's entry by guessing an id), and dismissal touches
// ONLY the queue row — the claim is untouched by design.

vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: vi.fn(() =>
    Promise.resolve({ ctx: { merchant: { id: "merchant-1" } } })
  ),
}));

let updated: Array<{ id: string }>;
const eqCalls = vi.fn();
const inCalls = vi.fn();
const fromCalls = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      fromCalls(table);
      const chain: Record<string, unknown> = {};
      chain.update = () => chain;
      chain.eq = (...args: unknown[]) => {
        eqCalls(args);
        return chain;
      };
      chain.in = (...args: unknown[]) => {
        inCalls(args);
        return chain;
      };
      chain.select = () => Promise.resolve({ data: updated, error: null });
      return chain;
    },
  }),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/queue/dismiss", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/queue/dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updated = [{ id: "p-1" }];
  });

  it("dismisses only within the authenticated merchant's queue", async () => {
    const res = await POST(req({ presentationId: "p-1" }));
    expect(res.status).toBe(200);
    expect(eqCalls).toHaveBeenCalledWith(["id", "p-1"]);
    expect(eqCalls).toHaveBeenCalledWith(["merchant_id", "merchant-1"]);
    expect(inCalls).toHaveBeenCalledWith(["status", ["waiting", "called"]]);
  });

  it("touches only the queue table — never the redemption", async () => {
    await POST(req({ presentationId: "p-1" }));
    expect(fromCalls).toHaveBeenCalledWith("merchant_presentations");
    expect(fromCalls).not.toHaveBeenCalledWith("redemptions");
  });

  it("404s when the entry is not in this merchant's live queue", async () => {
    updated = [];
    const res = await POST(req({ presentationId: "someone-elses" }));
    expect(res.status).toBe(404);
  });

  it("rejects a missing id", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
