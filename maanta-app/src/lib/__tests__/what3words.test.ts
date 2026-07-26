import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  convertTo3Words,
  convertToCoordinates,
  convertWhat3WordsToCoordinates,
  formatDistanceMeters,
  normalizeWhat3Words,
} from "@/lib/what3words";

describe("what3words util", () => {
  const originalKey = process.env.W3W_API_KEY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.W3W_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.W3W_API_KEY;
    else process.env.W3W_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("normalizes ///prefixed 3-word addresses", () => {
    expect(normalizeWhat3Words("///Market.Square.Entry")).toBe(
      "market.square.entry"
    );
    expect(normalizeWhat3Words("not-valid")).toBeNull();
  });

  it("convertToCoordinates returns coords on a valid API response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        coordinates: { lat: -1.27, lng: 36.85 },
        nearestPlace: "Nairobi",
      }),
    });
    const result = await convertToCoordinates("///filled.count.soap");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lat).toBe(-1.27);
      expect(result.lng).toBe(36.85);
      expect(result.words).toBe("filled.count.soap");
    }
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("convertToCoordinates returns typed error for invalid format", async () => {
    const result = await convertToCoordinates("nope");
    expect(result).toEqual({
      ok: false,
      code: "invalid_format",
      error: "Enter a 3-word address like ///stove.cactus.rally",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("convertToCoordinates returns missing_key when env is unset", async () => {
    delete process.env.W3W_API_KEY;
    const result = await convertToCoordinates("filled.count.soap");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_key");
  });

  it("convertToCoordinates returns not_found on bad upstream body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "bad words" } }),
    });
    const result = await convertToCoordinates("filled.count.soap");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });

  it("convertTo3Words returns words for valid coords", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        words: "filled.count.soap",
        coordinates: { lat: -1.27, lng: 36.85 },
      }),
    });
    const result = await convertTo3Words(-1.27, 36.85);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.words).toBe("filled.count.soap");
  });

  it("convertTo3Words rejects invalid coords without calling the API", async () => {
    const result = await convertTo3Words(999, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_coords");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("legacy convertWhat3WordsToCoordinates returns null on failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    await expect(
      convertWhat3WordsToCoordinates("filled.count.soap")
    ).resolves.toBeNull();
  });

  it("formatDistanceMeters formats meters and kilometers", () => {
    expect(formatDistanceMeters(120)).toBe("120 m");
    expect(formatDistanceMeters(1500)).toBe("1.5 km");
  });
});
