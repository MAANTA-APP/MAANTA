import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";

/**
 * Reject a pending code (wireframe 9t "Reject code"). Marks the pending
 * redemption failed — no fee is ever charged for rejected codes (fees are
 * only charged inside verify_redemption). No balance math here.
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
  const { data: rows, error } = await service
    .from("redemptions")
    .update({ status: "failed" })
    .eq("merchant_id", merchant.id)
    .eq("otp_code", otpCode)
    .eq("status", "pending")
    .select("id");

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

  return NextResponse.json({ ok: true });
}
