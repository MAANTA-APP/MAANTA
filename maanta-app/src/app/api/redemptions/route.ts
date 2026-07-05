import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const REDEMPTION_TTL_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { dealId } = await request.json();
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

  const { data: deal } = await service
    .from("deals")
    .select("id, merchant_id, is_active, expires_at, max_claims, claims_count, success_fee")
    .eq("id", dealId)
    .maybeSingle();

  if (!deal || !deal.is_active) {
    return NextResponse.json(
      { error: "This deal is no longer available." },
      { status: 404 }
    );
  }

  if (deal.expires_at && new Date(deal.expires_at) < new Date()) {
    return NextResponse.json({ error: "This deal has expired." }, { status: 410 });
  }

  if (deal.max_claims !== null && deal.claims_count >= deal.max_claims) {
    return NextResponse.json(
      { error: "This deal is fully claimed." },
      { status: 410 }
    );
  }

  const otpCode = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + REDEMPTION_TTL_MS).toISOString();

  const { data: redemption, error } = await service
    .from("redemptions")
    .insert({
      deal_id: deal.id,
      merchant_id: deal.merchant_id,
      user_id: appUser.id,
      otp_code: otpCode,
      success_fee_charged: deal.success_fee,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !redemption) {
    console.error("Failed to create redemption:", error);
    return NextResponse.json(
      { error: "Could not start redemption. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ redemptionId: redemption.id, otpCode, expiresAt });
}
