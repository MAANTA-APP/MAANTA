import { NextResponse } from "next/server";
import { currentClerkUserId } from "@/lib/auth";

const W3W_REGEX = /^\/{0,3}([a-z]+\.[a-z]+\.[a-z]+)$/i;

/**
 * Validate a what3words address before onboarding can continue
 * (wireframe 9f/9u: Continue stays disabled until the address validates).
 * Returns the resolved nearestPlace so the UI can show
 * "✓ Resolved: BBS Mall, Eastleigh — …".
 */
export async function GET(request: Request) {
  const userId = await currentClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("words") ?? "").trim().toLowerCase();
  const match = raw.match(W3W_REGEX);
  if (!match) {
    return NextResponse.json({ valid: false, error: "Enter a 3-word address like ///stove.cactus.rally" });
  }
  const words = match[1];

  const apiKey = process.env.W3W_API_KEY;
  if (!apiKey) {
    // No key configured (e.g. local dev): accept the format-valid address.
    return NextResponse.json({ valid: true, words, nearestPlace: null, unverified: true });
  }

  try {
    const apiUrl = new URL("https://api.what3words.com/v3/convert-to-coordinates");
    apiUrl.searchParams.set("words", words);
    apiUrl.searchParams.set("key", apiKey);
    const res = await fetch(apiUrl.toString());
    const body = await res.json();
    if (!res.ok || typeof body?.coordinates?.lat !== "number") {
      return NextResponse.json({
        valid: false,
        error: "That address didn't resolve — check the three words and try again.",
      });
    }
    return NextResponse.json({
      valid: true,
      words,
      nearestPlace: body.nearestPlace ?? null,
      lat: body.coordinates.lat,
      lng: body.coordinates.lng,
    });
  } catch (err) {
    console.error("w3w validate failed:", err);
    return NextResponse.json(
      { valid: false, error: "Could not reach what3words. Try again." },
      { status: 502 }
    );
  }
}
