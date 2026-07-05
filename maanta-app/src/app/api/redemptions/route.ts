import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { convertWhat3WordsToCoordinates, distanceMeters } from "@/lib/what3words";

const REDEMPTION_TTL_MS = 10 * 60 * 1000;
// No spec'd geofence radius exists yet — 150m covers "somewhere in a mall/
// shopping center" without being so tight normal GPS drift trips it. This
// only flags for review; it never blocks a redemption.
const GEOFENCE_FLAG_RADIUS_METERS = 150;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { dealId, lat, lng } = await request.json();
  if (!dealId) {
    return NextResponse.json({ error: "Missing dealId." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("id")
    .eq("auth_uid", authUser.id)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const { data: deal } = await service
    .from("deals")
    .select(
      "id, merchant_id, is_active, expires_at, max_claims, claims_count, success_fee, merchant:merchants(what3words_address)"
    )
    .eq("id", dealId)
    .maybeSingle<{
      id: string;
      merchant_id: string;
      is_active: boolean;
      expires_at: string | null;
      max_claims: number | null;
      claims_count: number;
      success_fee: number;
      merchant: { what3words_address: string } | null;
    }>();

  if (!deal || !deal.is_active) {
    return NextResponse.json(
      { error: "This deal is no longer available." },
      { status: 404 }
    );
  }

  if (deal.expires_at && new Date(deal.expires_at) < new Date()) {
    return NextResponse.json({ error: "This deal has expired." }, { status: 410 });
  }

  if (deal.max_claims !== null && deal.claims_count >= deal.max_claims) {
    return NextResponse.json(
      { error: "This deal is fully claimed." },
      { status: 410 }
    );
  }

  const otpCode = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + REDEMPTION_TTL_MS).toISOString();

  // Best-effort geofencing: only runs if the browser provided coordinates
  // and the merchant's what3words address resolves. Never blocks a
  // redemption on its own — just flags it for review when the customer
  // appears to be far from the shop.
  let consumerGpsWkt: string | null = null;
  let distanceFromShop: number | null = null;
  let fraudFlags: string[] | null = null;
  let reviewRequired = false;

  if (typeof lat === "number" && typeof lng === "number") {
    consumerGpsWkt = `SRID=4326;POINT(${lng} ${lat})`;

    if (deal.merchant?.what3words_address) {
      const merchantCoords = await convertWhat3WordsToCoordinates(
        deal.merchant.what3words_address
      );
      if (merchantCoords) {
        distanceFromShop = distanceMeters({ lat, lng }, merchantCoords);
        if (distanceFromShop > GEOFENCE_FLAG_RADIUS_METERS) {
          fraudFlags = ["geofence"];
          reviewRequired = true;
        }
      }
    }
  }

  const { data: redemption, error } = await service
    .from("redemptions")
    .insert({
      deal_id: deal.id,
      merchant_id: deal.merchant_id,
      user_id: appUser.id,
      otp_code: otpCode,
      success_fee_charged: deal.success_fee,
      status: "pending",
      expires_at: expiresAt,
      consumer_gps: consumerGpsWkt,
      distance_from_shop: distanceFromShop,
      fraud_flags: fraudFlags,
      review_required: reviewRequired,
    })
    .select("id")
    .single();

  if (error || !redemption) {
    console.error("Failed to create redemption:", error);
    return NextResponse.json(
      { error: "Could not start redemption. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ redemptionId: redemption.id, otpCode, expiresAt });
}
