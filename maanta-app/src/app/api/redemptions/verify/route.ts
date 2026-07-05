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

  const { otpCode } = await request.json();
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

  const { data: redemption } = await service
    .from("redemptions")
    .select(
      "id, deal_id, expires_at, success_fee_charged, deals(title, claims_count)"
    )
    .eq("otp_code", otpCode)
    .eq("merchant_id", merchant.id)
    .eq("status", "pending")
    .maybeSingle();

  if (!redemption) {
    return NextResponse.json(
      { error: "Invalid or already-used code." },
      { status: 404 }
    );
  }

  if (redemption.expires_at && new Date(redemption.expires_at) < new Date()) {
    await service
      .from("redemptions")
      .update({ status: "failed" })
      .eq("id", redemption.id);
    return NextResponse.json({ error: "This code has expired." }, { status: 410 });
  }

  const { error: updateError } = await service
    .from("redemptions")
    .update({ status: "success", redeemed_at: new Date().toISOString() })
    .eq("id", redemption.id);

  if (updateError) {
    console.error("Failed to complete redemption:", updateError);
    return NextResponse.json(
      { error: "Could not complete redemption." },
      { status: 500 }
    );
  }

  const deal = Array.isArray(redemption.deals)
    ? redemption.deals[0]
    : redemption.deals;

  await service
    .from("deals")
    .update({ claims_count: (deal?.claims_count ?? 0) + 1 })
    .eq("id", redemption.deal_id);

  await service.from("merchant_transactions").insert({
    merchant_id: merchant.id,
    amount: redemption.success_fee_charged,
    transaction_type: "success_fee",
    payment_provider: "manual",
    description: `Success fee for redemption ${redemption.id}`,
    reference_id: redemption.id,
  });

  return NextResponse.json({ dealTitle: deal?.title ?? "Deal" });
}
