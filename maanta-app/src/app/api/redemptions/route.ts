import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { convertWhat3WordsToCoordinates, distanceMeters } from "@/lib/what3words";

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

  // claim_deal is a self-authorizing, atomic RPC: it locks the deal row
  // (FOR UPDATE), validates active/expiry/max_claims/merchant visibility,
  // blocks a duplicate pending claim per shopper, and generates a
  // collision-safe OTP — all inside the DB. It checks auth.uid() /
  // current_user_id() internally, so it's safe to call with the regular
  // RLS-respecting server client rather than the service-role client.
  const consumerGpsWkt =
    typeof lat === "number" && typeof lng === "number"
      ? `SRID=4326;POINT(${lng} ${lat})`
      : null;

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

  // Post-claim fraud pass (wireframe 9t / 11d): when the shopper shared GPS,
  // compute the distance to the shop's what3words location and run the DB's
  // guardian_check RPC (service-role-only) which records fraud_events for
  // velocity/geofence/collusion. The returned flags are stamped onto the
  // redemption row so merchant preflight + admin fraud audit can read them.
  // Best-effort: a failure here never blocks the claim.
  if (typeof lat === "number" && typeof lng === "number") {
    try {
      const shopCoords = await convertWhat3WordsToCoordinates(
        data.what3words_address
      );
      const distance = shopCoords
        ? Math.round(distanceMeters({ lat, lng }, shopCoords))
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

  return NextResponse.json({
    redemptionId: data.redemption_id,
    otpCode: data.otp_code,
    expiresAt: data.redemption_expires_at,
  });
}
