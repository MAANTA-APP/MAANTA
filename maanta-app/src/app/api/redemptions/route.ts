import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { convertWhat3WordsToCoordinates, distanceMeters } from "@/lib/what3words";
import { parseGpsCoords } from "@/lib/geo";
import { captureDealClaimed } from "@/lib/analytics";

export async function POST(request: Request) {
  const [appUser, clerkUserId] = await Promise.all([
    ensureAppUser<{ id: string }>("id"),
    currentClerkUserId(),
  ]);
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { dealId, lat, lng } = await request.json();
  if (!dealId) {
    return NextResponse.json({ error: "Missing dealId." }, { status: 400 });
  }

  const supabase = createClient();
  const service = createServiceClient();

  const gps = parseGpsCoords(lat, lng);
  const consumerGpsWkt = gps ? `SRID=4326;POINT(${gps.lng} ${gps.lat})` : null;

  const { data, error } = await supabase
    .rpc("claim_deal", {
      p_user_id: appUser.id,
      p_deal_id: dealId,
      p_consumer_device_id: null,
      p_consumer_gps: consumerGpsWkt,
    })
    .single<{
      redemption_id: string;
      otp_code: string;
      redemption_expires_at: string;
      merchant_id: string;
      what3words_address: string;
    }>();

  if (error || !data) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not start redemption. Please try again.";

    if (
      message.includes("deal_not_found") ||
      message.includes("merchant_not_available")
    ) {
      status = 404;
      userMessage = "This deal is no longer available.";
    } else if (message.includes("deal_expired")) {
      status = 410;
      userMessage = "This deal has expired.";
    } else if (message.includes("deal_claim_limit_reached")) {
      status = 410;
      userMessage = "This deal is fully claimed.";
    } else if (message.includes("active_claim_already_exists")) {
      status = 409;
      userMessage = "You already have an active claim on this deal.";
    } else if (message.includes("unauthorized")) {
      status = 403;
      userMessage = "Not authorized.";
    } else {
      console.error("claim_deal RPC failed:", error);
    }

    return NextResponse.json({ error: userMessage }, { status });
  }

  let hasFraudFlags = false;

  if (gps) {
    try {
      const shopCoords = await convertWhat3WordsToCoordinates(data.what3words_address);
      const distance = shopCoords
        ? Math.round(distanceMeters(gps, shopCoords))
        : null;

      const { data: flags } = await service.rpc("guardian_check", {
        p_merchant_id: data.merchant_id,
        p_user_id: appUser.id,
        p_consumer_device: null,
        p_consumer_gps: consumerGpsWkt,
        p_merchant_device: null,
        p_distance_m: distance,
      });

      const fraudFlags = (flags as string[] | null) ?? [];
      hasFraudFlags = fraudFlags.length > 0;
      await service
        .from("redemptions")
        .update({
          distance_from_shop: distance,
          fraud_flags: fraudFlags.length > 0 ? fraudFlags : null,
          review_required: fraudFlags.length > 0,
        })
        .eq("id", data.redemption_id);
    } catch (err) {
      console.error("post-claim fraud pass failed:", err);
    }
  }

  if (clerkUserId) {
    void captureDealClaimed({
      clerkUserId,
      redemptionId: data.redemption_id,
      dealId,
      merchantId: data.merchant_id,
      hadGps: !!gps,
      hasFraudFlags,
    });
  }

  return NextResponse.json({
    redemptionId: data.redemption_id,
    expiresAt: data.redemption_expires_at,
  });
}
