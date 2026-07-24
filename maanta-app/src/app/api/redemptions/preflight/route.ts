import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { isValidOtpCode } from "@/lib/otp";
import { maskPhone } from "@/lib/phone-mask";
import { checkRateLimit, OTP_CHECK_RATE_LIMIT, OTP_CHECK_RATE_WINDOW_SECONDS } from "@/lib/rate-limit";

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
  if (!isValidOtpCode(otpCode)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `otp-check:${merchant.id}`,
    OTP_CHECK_RATE_LIMIT,
    OTP_CHECK_RATE_WINDOW_SECONDS
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
    .select("id, status, expires_at, fraud_flags, review_required, distance_from_shop, amount_kes, user_id, deals(title)")
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

  // "Collect from shopper" — the YOU PAY amount snapshotted onto the redemption
  // at claim (same read-only value the success takeover uses; see the verify
  // route). Surfaced pre-confirm so the cashier knows the cash to take before
  // they verify. NOT a charge and distinct from the KES 30 fee. Legacy rows with
  // no snapshot come back null → the UI omits the line.
  const rawAmount = redemption.amount_kes as number | string | null;
  const collectAmount =
    rawAmount != null && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null;

  // Masked shopper phone — a counter sanity-check ("is this your number?").
  // Derived server-side from the shopper's stored phone and MASKED before it
  // ever reaches the client; the full number never leaves the server. Null when
  // the shopper has no stored phone → the UI omits the line.
  const shopperUserId = redemption.user_id as string | null;
  let maskedPhone: string | null = null;
  if (shopperUserId) {
    const { data: shopper } = await service
      .from("users")
      .select("phone")
      .eq("id", shopperUserId)
      .maybeSingle<{ phone: string | null }>();
    maskedPhone = maskPhone(shopper?.phone);
  }

  return NextResponse.json({
    found: true,
    expired: false,
    locationMismatch,
    distanceMeters: distance,
    collectAmount,
    maskedPhone,
    dealTitle:
      (redemption.deals as unknown as { title: string } | null)?.title ?? null,
  });
}
