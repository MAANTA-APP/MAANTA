import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "../route";

// GET /api/healthz: public liveness is unauthenticated and dependency-free;
// env-detail (booleans only) and supabase probe are gated behind the admin guard.

const requireAdminApiMock = vi.fn();
vi.mock("@/lib/admin", () => ({
  requireAdminApi: () => requireAdminApiMock(),
}));

const probeSupabaseMock = vi.fn();
vi.mock("@/lib/health", async () => {
  const actual = await vi.importActual<typeof import("@/lib/health")>("@/lib/health");
  return {
    ...actual,
    probeSupabase: () => probeSupabaseMock(),
  };
});

function req(query = "") {
  return new Request(`http://localhost/api/healthz${query}`);
}

describe("GET /api/healthz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public liveness without calling the admin guard", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body).not.toHaveProperty("env");
    expect(requireAdminApiMock).not.toHaveBeenCalled();
  });

  it("returns public readiness without calling the admin guard", async () => {
    const res = await GET(req("?ready=1"));
    expect(requireAdminApiMock).not.toHaveBeenCalled();
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    expect(body).toHaveProperty("core");
    expect(body).toHaveProperty("strategy");
    expect(body).toHaveProperty("missing");
    expect(["ready", "not_ready"]).toContain(body.status);
  });

  it("gates env detail: a non-admin caller gets the guard's error, no env map", async () => {
    requireAdminApiMock.mockResolvedValue({
      error: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    });

    const res = await GET(req("?detail=1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).not.toHaveProperty("env");
  });

  it("returns the boolean env map for an admin caller", async () => {
    requireAdminApiMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const res = await GET(req("?detail=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.env).toBeDefined();
    expect(typeof body.env.supabase.NEXT_PUBLIC_SUPABASE_URL).toBe("boolean");
    expect(typeof body.env.auth.CLERK_SECRET_KEY).toBe("boolean");
  });

  it("returns a supabase probe for an admin caller", async () => {
    requireAdminApiMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    probeSupabaseMock.mockResolvedValue({
      configured: true,
      reachable: true,
      merchantLatLng: false,
      reason: "missing_lat_lng",
    });

    const res = await GET(req("?probe=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.supabase.reason).toBe("missing_lat_lng");
    expect(body.supabase.merchantLatLng).toBe(false);
  });

  it("rejects non-GET methods with 405 + Allow", async () => {
    const res = await POST();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
  });
});
