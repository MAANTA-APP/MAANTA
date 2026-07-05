const W3W_API_URL = "https://api.what3words.com/v3/convert-to-coordinates";

export async function convertWhat3WordsToCoordinates(
  words: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.W3W_API_KEY;
  if (!apiKey) {
    console.error("W3W_API_KEY is not set");
    return null;
  }

  try {
    const url = new URL(W3W_API_URL);
    url.searchParams.set("words", words);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("what3words lookup failed:", res.status, await res.text());
      return null;
    }

    const body = await res.json();
    if (
      typeof body?.coordinates?.lat !== "number" ||
      typeof body?.coordinates?.lng !== "number"
    ) {
      console.error("what3words returned unexpected shape:", body);
      return null;
    }

    return { lat: body.coordinates.lat, lng: body.coordinates.lng };
  } catch (err) {
    console.error("what3words lookup threw:", err);
    return null;
  }
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
