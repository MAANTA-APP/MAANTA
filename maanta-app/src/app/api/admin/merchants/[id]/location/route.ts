import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";
import { convertTo3Words, convertToCoordinates } from "@/lib/what3words";

/**
 * Admin pickup-location editor.
 * Accept either a what3words address (fills lat/lng) or lat/lng (optionally
 * derives what3words_address). Never exposes W3W_API_KEY to the client.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rawW3w = typeof body.what3wordsAddress === "string" ? body.what3wordsAddress : "";
  const rawLat = body.lat;
  const rawLng = body.lng;
  const deriveWords = body.deriveWords !== false;

  let what3wordsAddress: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;

  if (rawW3w.trim()) {
    const result = await convertToCoordinates(rawW3w);
    if (!result.ok) {
      const status =
        result.code === "missing_key"
          ? 503
          : result.code === "upstream"
            ? 502
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    what3wordsAddress = result.words;
    lat = result.lat;
    lng = result.lng;
  } else if (
    typeof rawLat === "number" &&
    typeof rawLng === "number" &&
    Number.isFinite(rawLat) &&
    Number.isFinite(rawLng)
  ) {
    lat = rawLat;
    lng = rawLng;
    if (deriveWords) {
      const words = await convertTo3Words(lat, lng);
      if (words.ok) {
        what3wordsAddress = words.words;
      } else if (words.code === "missing_key") {
        return NextResponse.json({ error: words.error }, { status: 503 });
      }
      // If reverse lookup fails for another reason, still save coords.
    }
  } else {
    return NextResponse.json(
      {
        error:
          "Provide a what3words address, or both latitude and longitude.",
      },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const update: Record<string, unknown> = {
    lat,
    lng,
    updated_at: new Date().toISOString(),
  };
  if (what3wordsAddress) {
    update.what3words_address = what3wordsAddress;
  }

  const { data: rows, error } = await service
    .from("merchants")
    .update(update)
    .eq("id", params.id)
    .select("id, what3words_address, lat, lng");

  if (error) {
    console.error("admin location update failed:", error);
    return NextResponse.json({ error: "Could not save location." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: "merchant.location",
    targetType: "merchant",
    targetId: params.id,
    details: {
      what3words_address: rows[0].what3words_address,
      lat: rows[0].lat,
      lng: rows[0].lng,
    },
  });

  return NextResponse.json({
    ok: true,
    what3wordsAddress: rows[0].what3words_address,
    lat: rows[0].lat,
    lng: rows[0].lng,
  });
}
