import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const MERCHANT_ROLES = ["merchant_admin", "merchant_staff"];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { otpCode, override, overrideReason } = await request.json();
  if (!otpCode) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("id, role")
    .eq("auth_uid", authUser.id)
    .maybeSingle();

  if (!appUser || !MERCHANT_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: merchant } = await service
    .from("merchants")
    .select("id")
    .eq("user_id", appUser.id)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json(
      { error: "No merchant account found." },
      { status: 404 }
    );
  }

  // verify_redemption is a self-authorizing, atomic RPC: it locks the
  // pending redemption row (FOR UPDATE), flips it to success, increments
  // the deal's claims_count, and — critically — calls
  // deduct_success_fee_or_record_arrears to actually debit
  // merchants.account_balance (or record arrears if the wallet can't cover
  // it). The previous hand-rolled version never did this debit at all.
  // p_override marks a "verify anyway" on a flagged code: the redemption
  // still verifies (frozen rule — the shopper is never blocked), but the
  // override intent + reason land in the fraud_events / agent_tasks dispute
  // trail instead of being lost.
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
      redemption_status: string;
      fee_charge_status: "charged" | "owed" | "unknown";
      fee_amount: number;
      new_balance: number | null;
      new_arrears: number | null;
      deal_id: string;
      deal_claims_count: number | null;
      disputed: boolean;
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

  const { data: deal } = await service
    .from("deals")
    .select("title")
    .eq("id", data.deal_id)
    .maybeSingle();

  return NextResponse.json({
    dealTitle: deal?.title ?? "Deal",
    feeChargeStatus: data.fee_charge_status,
    feeAmount: data.fee_amount,
    newBalance: data.new_balance,
    disputed: data.disputed === true,
  });
}
