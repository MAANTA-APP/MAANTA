const W3W_CONVERT_TO_COORDS = "https://api.what3words.com/v3/convert-to-coordinates";
const W3W_CONVERT_TO_3WA = "https://api.what3words.com/v3/convert-to-3wa";

const W3W_REGEX = /^\/{0,3}([a-z]+\.[a-z]+\.[a-z]+)$/i;

export type W3wCoordsSuccess = {
  ok: true;
  words: string;
  lat: number;
  lng: number;
  nearestPlace: string | null;
};

export type W3wCoordsFailure = {
  ok: false;
  error: string;
  code: "missing_key" | "invalid_format" | "not_found" | "upstream" | "unexpected";
};

export type W3wCoordsResult = W3wCoordsSuccess | W3wCoordsFailure;

export type W3wWordsSuccess = {
  ok: true;
  words: string;
  lat: number;
  lng: number;
};

export type W3wWordsFailure = {
  ok: false;
  error: string;
  code: "missing_key" | "invalid_coords" | "upstream" | "unexpected";
};

export type W3wWordsResult = W3wWordsSuccess | W3wWordsFailure;

export function normalizeWhat3Words(raw: string): string | null {
  const match = raw.trim().toLowerCase().match(W3W_REGEX);
  return match ? match[1] : null;
}

function apiKey(): string | null {
  return process.env.W3W_API_KEY || null;
}

/**
 * Convert a 3-word address to WGS84 coordinates.
 * Server-only — reads W3W_API_KEY. Never call from client components.
 */
export async function convertToCoordinates(w3w: string): Promise<W3wCoordsResult> {
  const words = normalizeWhat3Words(w3w);
  if (!words) {
    return {
      ok: false,
      code: "invalid_format",
      error: "Enter a 3-word address like ///stove.cactus.rally",
    };
  }

  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      code: "missing_key",
      error: "Address validation is temporarily unavailable.",
    };
  }

  try {
    const url = new URL(W3W_CONVERT_TO_COORDS);
    url.searchParams.set("words", words);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString());
    const body = await res.json().catch(() => null);

    if (!res.ok || typeof body?.coordinates?.lat !== "number") {
      return {
        ok: false,
        code: "not_found",
        error: "That address didn't resolve — check the three words and try again.",
      };
    }

    return {
      ok: true,
      words,
      lat: body.coordinates.lat,
      lng: body.coordinates.lng,
      nearestPlace:
        typeof body.nearestPlace === "string" ? body.nearestPlace : null,
    };
  } catch (err) {
    console.error("what3words convertToCoordinates threw:", err);
    return {
      ok: false,
      code: "upstream",
      error: "Could not reach what3words. Try again.",
    };
  }
}

/**
 * Convert WGS84 coordinates to a 3-word address.
 * Server-only — reads W3W_API_KEY.
 */
export async function convertTo3Words(
  lat: number,
  lng: number
): Promise<W3wWordsResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {
      ok: false,
      code: "invalid_coords",
      error: "Latitude and longitude look invalid.",
    };
  }

  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      code: "missing_key",
      error: "Address lookup is temporarily unavailable.",
    };
  }

  try {
    const url = new URL(W3W_CONVERT_TO_3WA);
    url.searchParams.set("coordinates", `${lat},${lng}`);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString());
    const body = await res.json().catch(() => null);

    if (!res.ok || typeof body?.words !== "string") {
      return {
        ok: false,
        code: "unexpected",
        error: "Could not resolve those coordinates to a 3-word address.",
      };
    }

    return {
      ok: true,
      words: body.words,
      lat: typeof body?.coordinates?.lat === "number" ? body.coordinates.lat : lat,
      lng: typeof body?.coordinates?.lng === "number" ? body.coordinates.lng : lng,
    };
  } catch (err) {
    console.error("what3words convertTo3Words threw:", err);
    return {
      ok: false,
      code: "upstream",
      error: "Could not reach what3words. Try again.",
    };
  }
}

/**
 * Legacy helper used by claim geofence — returns null on any failure.
 */
export async function convertWhat3WordsToCoordinates(
  words: string
): Promise<{ lat: number; lng: number } | null> {
  const result = await convertToCoordinates(words);
  if (!result.ok) {
    if (result.code === "missing_key") {
      console.error("W3W_API_KEY is not set");
    }
    return null;
  }
  return { lat: result.lat, lng: result.lng };
}

/** Great-circle distance in meters between two lat/lng points (Haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Human-readable distance for deal cards ("120 m" / "1.2 km"). */
export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
