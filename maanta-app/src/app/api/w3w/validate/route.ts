import { NextResponse } from "next/server";
import { currentClerkUserId } from "@/lib/auth";
import {
  checkRateLimit,
  W3W_VALIDATE_RATE_LIMIT,
  W3W_VALIDATE_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";
import { convertToCoordinates, normalizeWhat3Words } from "@/lib/what3words";

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

  const allowed = await checkRateLimit(
    `w3w-validate:${userId}`,
    W3W_VALIDATE_RATE_LIMIT,
    W3W_VALIDATE_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { valid: false, error: "Too many validation attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("words") ?? "").trim().toLowerCase();
  const words = normalizeWhat3Words(raw);
  if (!words) {
    return NextResponse.json({
      valid: false,
      error: "Enter a 3-word address like ///stove.cactus.rally",
    });
  }

  if (!process.env.W3W_API_KEY) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        valid: true,
        words,
        nearestPlace: null,
        unverified: true,
        lat: null,
        lng: null,
      });
    }
    console.error("W3W_API_KEY is not configured");
    return NextResponse.json(
      { valid: false, error: "Address validation is temporarily unavailable." },
      { status: 503 }
    );
  }

  const result = await convertToCoordinates(words);
  if (!result.ok) {
    const status = result.code === "upstream" ? 502 : 200;
    return NextResponse.json(
      { valid: false, error: result.error },
      { status: status === 502 ? 502 : 200 }
    );
  }

  return NextResponse.json({
    valid: true,
    words: result.words,
    nearestPlace: result.nearestPlace,
    lat: result.lat,
    lng: result.lng,
  });
}
