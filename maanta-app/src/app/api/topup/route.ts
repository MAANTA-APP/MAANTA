import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireMerchant } from "@/lib/merchant-api";
import { initiateMpesaStkPush } from "@/lib/intasend";
import { isValidTopupAmount, MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT } from "@/lib/currency";
import { isValidKenyanPhone } from "@/lib/phone";
import {
  checkRateLimit,
  TOPUP_MPESA_RATE_LIMIT,
  TOPUP_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const auth = await requireMerchant("can_topup");
  if ("error" in auth) return auth.error;
  const { merchant, user: appUser } = auth.ctx;

  const { amount, phoneNumber } = await request.json();
  if (!isValidTopupAmount(amount) || typeof phoneNumber !== "string" || !phoneNumber) {
    return NextResponse.json(
      {
        error: `Amount must be a number between ${MIN_TOPUP_AMOUNT} and ${MAX_TOPUP_AMOUNT} KES, and a phone number is required.`,
      },
      { status: 400 }
    );
  }
  if (!isValidKenyanPhone(phoneNumber)) {
    return NextResponse.json(
      { error: "Enter a valid Kenyan mobile number (e.g. 07XX XXX XXX)." },
      { status: 400 }
    );
  }

  const allowed = await checkRateLimit(
    `topup-mpesa:${merchant.id}`,
    TOPUP_MPESA_RATE_LIMIT,
    TOPUP_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many top-up attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

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
