import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";

const GEOFENCE_WARN_METERS = 150;

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
  if (!otpCode) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
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
  const flags = (redemption.fraud_flags ?? []) as string[];
  const distance = redemption.distance_from_shop as number | null;
  const locationMismatch =
    flags.includes("geofence") ||
    (typeof distance === "number" && distance > GEOFENCE_WARN_METERS);

  return NextResponse.json({
    found: true,
    expired,
    locationMismatch,
    distanceMeters: distance,
    dealTitle:
      (redemption.deals as unknown as { title: string } | null)?.title ?? null,
  });
}
