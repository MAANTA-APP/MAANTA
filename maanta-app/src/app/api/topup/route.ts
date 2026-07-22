import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { initiateMpesaStkPush } from "@/lib/intasend";
import { isValidTopupAmount, MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT } from "@/lib/currency";
import { captureTopupInitiated } from "@/lib/analytics";

const MERCHANT_ROLES = ["merchant_admin", "merchant_staff"];

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{
    id: string;
    role: string;
    full_name: string | null;
    email: string | null;
  }>("id, role, full_name, email");

  if (!appUser) {
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

  if (!MERCHANT_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const service = createServiceClient();

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

  const clerkUserId = await currentClerkUserId();
  if (clerkUserId) {
    void captureTopupInitiated({
      clerkUserId,
      merchantId: merchant.id,
      amountKes: amount,
    });
  }

  return NextResponse.json({ invoiceId: result.invoiceId, state: result.state });
}
