import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { initiateMpesaStkPush } from "@/lib/intasend";
import { isValidTopupAmount, MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT } from "@/lib/currency";

const MERCHANT_ROLES = ["merchant_admin", "merchant_staff"];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { amount, phoneNumber } = await request.json();
  if (!isValidTopupAmount(amount) || typeof phoneNumber !== "string" || !phoneNumber) {
    return NextResponse.json(
      {
        error: `Amount must be a number between ${MIN_TOPUP_AMOUNT} and ${MAX_TOPUP_AMOUNT} KES, and a phone number is required.`,
      },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("id, role, full_name, email")
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

  // Encodes the merchant id directly in api_ref so the webhook (which has no
  // other way to look up an in-flight request — merchant_transactions has no
  // "pending" status) can attribute the eventual COMPLETE event.
  const apiRef = `topup:${merchant.id}:${randomUUID()}`;

  const result = await initiateMpesaStkPush({
    amount,
    phoneNumber,
    apiRef,
    name: appUser.full_name ?? "MAANTA Merchant",
    email: appUser.email ?? "merchant@maanta.app",
  });

  if (!result) {
    return NextResponse.json(
      { error: "Could not start M-Pesa payment. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ invoiceId: result.invoiceId, state: result.state });
}
