import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "../../location/route";

const requireAdminApiMock = vi.fn();
vi.mock("@/lib/admin", () => ({
  requireAdminApi: () => requireAdminApiMock(),
}));

const convertToCoordinatesMock = vi.fn();
const convertTo3WordsMock = vi.fn();
vi.mock("@/lib/what3words", () => ({
  convertToCoordinates: (...args: unknown[]) => convertToCoordinatesMock(...args),
  convertTo3Words: (...args: unknown[]) => convertTo3WordsMock(...args),
}));

const logAdminOpMock = vi.fn();
vi.mock("@/lib/admin-audit", () => ({
  logAdminOp: (...args: unknown[]) => logAdminOpMock(...args),
}));

const selectMock = vi.fn();
const eqMock = vi.fn(() => ({ select: selectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: fromMock }),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/admin/merchants/m1/location", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/merchants/[id]/location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    selectMock.mockResolvedValue({
      data: [
        {
          id: "m1",
          what3words_address: "filled.count.soap",
          lat: -1.27,
          lng: 36.85,
        },
      ],
      error: null,
    });
  });

  it("gates behind admin auth", async () => {
    requireAdminApiMock.mockResolvedValue({
      error: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    });
    const res = await POST(req({ what3wordsAddress: "filled.count.soap" }), {
      params: { id: "m1" },
    });
    expect(res.status).toBe(403);
  });

  it("saves coords from a what3words address", async () => {
    convertToCoordinatesMock.mockResolvedValue({
      ok: true,
      lat: -1.27,
      lng: 36.85,
      words: "filled.count.soap",
    });
    const res = await POST(req({ what3wordsAddress: "///filled.count.soap" }), {
      params: { id: "m1" },
    });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: -1.27,
        lng: 36.85,
        what3words_address: "filled.count.soap",
      })
    );
    expect(logAdminOpMock).toHaveBeenCalled();
  });

  it("saves pasted lat/lng and optionally derives words", async () => {
    convertTo3WordsMock.mockResolvedValue({
      ok: true,
      words: "filled.count.soap",
    });
    const res = await POST(
      req({ lat: -1.2746, lng: 36.8501, deriveWords: true }),
      { params: { id: "m1" } }
    );
    expect(res.status).toBe(200);
    expect(convertTo3WordsMock).toHaveBeenCalledWith(-1.2746, 36.8501);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: -1.2746,
        lng: 36.8501,
        what3words_address: "filled.count.soap",
      })
    );
  });

  it("rejects empty payloads", async () => {
    const res = await POST(req({}), { params: { id: "m1" } });
    expect(res.status).toBe(400);
  });
});
