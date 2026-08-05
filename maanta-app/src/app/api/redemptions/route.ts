import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ensureAppUser,
  currentClerkUserId,
  currentUserHasVerifiedPhone,
} from "@/lib/auth";
import { convertWhat3WordsToCoordinates, distanceMeters } from "@/lib/what3words";
import { parseGpsCoords } from "@/lib/geo";
import { captureDealClaimed } from "@/lib/analytics";
import {
  checkRateLimit,
  CLAIM_RATE_LIMIT,
  CLAIM_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";
import { PHONE_REQUIRED_AT_CLAIM } from "@/lib/launch-auth";
import {
  claimCodeEmail,
  emailCodeDeliveryEnabled,
} from "@/lib/email-code-delivery";
import { sendEmail } from "@/lib/resend";

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string; email: string | null }>(
    "id, email"
  );
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // Phone-required-at-claim gate (S2 ruling 2026-07-23). Launch auth lets a
  // shopper sign up with email OR phone, but a claim requires a verified phone.
  // An email-only session is bounced here with a typed `phone_required` code so
  // the client can route through phone OTP and return to the deal — the claim
  // RPC is never reached without a phone. PHONE_REQUIRED_AT_CLAIM is a frozen
  // TRUE across every launch-auth mix (email+phone or phone-only) — the gate is
  // never relaxed by the mix flag; only the sign-up methods offered differ.
  const hasPhone = await currentUserHasVerifiedPhone();
  if (PHONE_REQUIRED_AT_CLAIM && !hasPhone) {
    return NextResponse.json(
      {
        error: "Add a phone number to claim this deal.",
        code: "phone_required",
      },
      { status: 403 }
    );
  }

  const { dealId, lat, lng, emailCode } = await request.json();
  if (!dealId) {
    return NextResponse.json({ error: "Missing dealId." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `claim:${appUser.id}`,
    CLAIM_RATE_LIMIT,
    CLAIM_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many claim attempts — wait a moment and try again." },
      { status: 429 }
    );
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
    } else if (message.includes("deal_paused")) {
      status = 409;
      userMessage = "This deal is paused — no new claims right now.";
      return NextResponse.json(
        { error: userMessage, code: "deal_paused" },
        { status }
      );
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

  // Pre-launch tester option: email the code as a copy of the ticket screen.
  // Opt-in per claim, gated server-side, account email only. Awaited (Resend
  // calls carry a 10s deadline) so a serverless response can't cut it off, but
  // any failure resolves to codeEmailed=false — the claim itself already
  // succeeded and stays succeeded. See src/lib/email-code-delivery.ts and D74.
  let codeEmailed = false;
  if (emailCode === true && emailCodeDeliveryEnabled() && appUser.email) {
    try {
      const { data: meta } = await service
        .from("redemptions")
        .select("deals(title), merchants(merchant_name)")
        .eq("id", data.redemption_id)
        .maybeSingle<{
          deals: { title: string } | null;
          merchants: { merchant_name: string } | null;
        }>();
      codeEmailed = await sendEmail({
        to: appUser.email,
        ...claimCodeEmail({
          code: data.otp_code,
          dealTitle: meta?.deals?.title ?? "your claimed deal",
          merchantName: meta?.merchants?.merchant_name ?? null,
          expiresAt: data.redemption_expires_at,
        }),
      });
    } catch (err) {
      console.error("claim code email failed:", err);
    }
  }

  const clerkUserId = await currentClerkUserId();
  if (clerkUserId) {
    const { data: dealMeta } = await service
      .from("deals")
      .select("node")
      .eq("id", dealId)
      .maybeSingle();
    void captureDealClaimed({
      clerkUserId,
      redemptionId: data.redemption_id,
      dealId,
      merchantId: data.merchant_id,
      hadGps: !!gps,
      hasFraudFlags,
      node: dealMeta?.node,
    });
  }

  return NextResponse.json({
    redemptionId: data.redemption_id,
    expiresAt: data.redemption_expires_at,
    codeEmailed,
  });
}
