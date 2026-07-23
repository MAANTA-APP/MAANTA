import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { isValidOtpCode } from "@/lib/otp";
import { checkRateLimit, OTP_CHECK_RATE_LIMIT, OTP_CHECK_RATE_WINDOW_SECONDS } from "@/lib/rate-limit";
import { captureGuardianOutcome } from "@/lib/analytics";

export async function POST(request: Request) {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { otpCode, override, overrideReason } = await request.json();
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

  const supabase = createClient();
  const service = createServiceClient();

  const { data, error } = await supabase
    .rpc("verify_redemption", {
      p_merchant_id: merchant.id,
      p_otp_code: otpCode,
      p_merchant_device_id: null,
      p_override: override === true,
      p_override_reason:
        override === true && typeof overrideReason === "string" && overrideReason
          ? overrideReason.slice(0, 500)
          : null,
    })
    .single<{
      redemption_id: string;
      redemption_status: "success" | "held" | "blocked";
      fee_charge_status: "charged" | "owed" | "unknown" | null;
      fee_amount: number | null;
      new_balance: number | null;
      new_arrears: number | null;
      deal_id: string;
      deal_claims_count: number | null;
      disputed: boolean;
      guardian_recommendation: "clear" | "flag" | "soft_block" | "hard_block" | null;
      guardian_severity: "info" | "warn" | "block" | null;
    }>();

  if (error || !data) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not complete redemption.";

    if (message.includes("redemption_not_found_or_already_used")) {
      status = 404;
      userMessage = "Invalid or already-used code.";
    } else if (message.includes("redemption_expired")) {
      status = 410;
      userMessage = "This code has expired.";
    } else if (message.includes("redemption_already_verified")) {
      status = 409;
      userMessage = "This code has already been redeemed.";
    } else if (message.includes("unauthorized")) {
      status = 403;
      userMessage = "Not authorized.";
    } else {
      console.error("verify_redemption RPC failed:", error);
    }

    return NextResponse.json({ error: userMessage }, { status });
  }

  // Guardian analytics (docs/maanta-guardian-v1.md §Analytics). Fired for
  // EVERY outcome (clear/flag/soft_block/hard_block) before the block/held
  // branches below. Best-effort and non-blocking — `void`ed so the counter is
  // never delayed, and a no-op unless PostHog is configured.
  void captureGuardianOutcome({
    merchantId: merchant.id,
    redemptionId: data.redemption_id,
    dealId: data.deal_id,
    recommendation: data.guardian_recommendation,
    severity: data.guardian_severity,
    redemptionStatus: data.redemption_status,
    feeChargeStatus: data.fee_charge_status,
    disputed: data.disputed === true,
  });

  // Guardian v1 block/held outcomes (docs/maanta-guardian-v1.md §3). No money
  // moved. Copy stays non-accusatory and in the existing in-ink error style —
  // it never names fraud to the counter.
  if (data.redemption_status === "blocked") {
    return NextResponse.json(
      { error: "We couldn't complete this redemption right now. Please try again later or reach out to support." },
      { status: 409 }
    );
  }
  if (data.redemption_status === "held") {
    return NextResponse.json(
      { error: "This redemption needs a quick review before it can be completed. Our team will take a look shortly." },
      { status: 409 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("title")
    .eq("id", data.deal_id)
    .maybeSingle();

  return NextResponse.json({
    dealTitle: deal?.title ?? "Deal",
    redemptionId: data.redemption_id,
    feeChargeStatus: data.fee_charge_status,
    feeAmount: data.fee_amount,
    newBalance: data.new_balance,
    disputed: data.disputed === true,
  });
}
