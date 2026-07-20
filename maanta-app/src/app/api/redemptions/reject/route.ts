import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { isValidOtpCode } from "@/lib/otp";
import { checkRateLimit } from "@/lib/rate-limit";

const OTP_RATE_LIMIT = 30;
const OTP_RATE_WINDOW_SECONDS = 60;

/**
 * Reject a pending code (wireframe 9t "Reject code"). Marks the pending
 * redemption failed — no fee is ever charged for rejected codes (fees are
 * only charged inside verify_redemption). No balance math here.
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant, user } = auth.ctx;

  const { otpCode } = await request.json();
  if (!isValidOtpCode(otpCode)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `otp-reject:${merchant.id}`,
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
  const { data: rows, error } = await service
    .from("redemptions")
    .update({ status: "failed" })
    .eq("merchant_id", merchant.id)
    .eq("otp_code", otpCode)
    .eq("status", "pending")
    .select("id, user_id, deal_id");

  if (error) {
    console.error("reject failed:", error);
    return NextResponse.json({ error: "Could not reject the code." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "Invalid or already-used code." },
      { status: 404 }
    );
  }

  const row = rows[0];
  await service.from("fraud_events").insert({
    merchant_id: merchant.id,
    user_id: row.user_id,
    event_type: "code_rejected",
    severity: "low",
    details: {
      redemption_id: row.id,
      deal_id: row.deal_id,
      rejected_by_user: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
