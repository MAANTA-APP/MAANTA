import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { isValidOtpCode } from "@/lib/otp";
import { checkRateLimit } from "@/lib/rate-limit";

const GEOFENCE_WARN_METERS = 150;
const OTP_RATE_LIMIT = 30;
const OTP_RATE_WINDOW_SECONDS = 60;

/**
 * Pre-verification check for a code (wireframe 9t): before charging the
 * KES 30 fee, tell the merchant whether this claim was flagged (geofence
 * mismatch recorded at claim time). Read-only — verification semantics
 * (verify_redemption RPC) are unchanged.
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { otpCode } = await request.json();
  if (!isValidOtpCode(otpCode)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `otp-preflight:${merchant.id}`,
    OTP_RATE_LIMIT,
    OTP_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  const service = createServiceClient();
  const { data: redemption } = await service
    .from("redemptions")
    .select("id, status, expires_at, fraud_flags, review_required, distance_from_shop, deals(title)")
    .eq("merchant_id", merchant.id)
    .eq("otp_code", otpCode)
    .eq("status", "pending")
    .order("redeemed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!redemption) {
    return NextResponse.json({ found: false });
  }

  const expired = new Date(redemption.expires_at) <= new Date();
  if (expired) {
    return NextResponse.json({ found: false });
  }

  const flags = (redemption.fraud_flags ?? []) as string[];
  const distance = redemption.distance_from_shop as number | null;
  const locationMismatch =
    flags.includes("geofence") ||
    (typeof distance === "number" && distance > GEOFENCE_WARN_METERS);

  return NextResponse.json({
    found: true,
    expired: false,
    locationMismatch,
    distanceMeters: distance,
    dealTitle:
      (redemption.deals as unknown as { title: string } | null)?.title ?? null,
  });
}
