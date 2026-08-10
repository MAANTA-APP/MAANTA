import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { currentClerkUserId } from "@/lib/auth";
import { initiateMpesaStkPush } from "@/lib/intasend";
import { isValidTopupAmount, MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT } from "@/lib/currency";
import { isValidKenyanPhone } from "@/lib/phone";
import { captureTopupInitiated } from "@/lib/analytics";
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

  // Normalise once, here, before the number leaves the app. `isValidKenyanPhone`
  // strips separators from a copy to validate, so "0712 345 678" passed the
  // check and then went to the provider with the spaces intact. That is worth
  // fixing on its own — the provider should get a clean MSISDN — and it also
  // means the digits form an unbroken run, which is what the free-text
  // redactor keys on if the provider echoes the request back in an error.
  const normalisedPhone = phoneNumber.replace(/[\s-]/g, "");

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

  // Record what was asked for BEFORE the push, so a webhook that arrives fast
  // still finds it. Without this row the webhook has nothing to reconcile
  // against and has to believe whatever amount the payload names (SEC-001/D83).
  //
  // Fails the request if the row cannot be written: proceeding would create a
  // payment whose amount can never be verified, which is the exact hole this
  // closes. A merchant retrying costs nothing; an unreconcilable credit does.
  const service = createServiceClient();
  const { error: pendingError } = await service.from("pending_topups").insert({
    api_ref: apiRef,
    merchant_id: merchant.id,
    amount,
    currency: "KES",
    payment_provider: "intasend",
  });

  if (pendingError) {
    console.error("Could not record pending top-up:", pendingError);
    return NextResponse.json(
      { error: "Could not start M-Pesa payment. Please try again." },
      { status: 500 }
    );
  }

  const result = await initiateMpesaStkPush({
    amount,
    phoneNumber: normalisedPhone,
    apiRef,
    name: appUser.full_name ?? "MAANTA Merchant",
    email: appUser.email ?? "merchant@maanta.app",
  });

  if (!result) {
    // The push never started, so this row can never be reconciled against a
    // webhook. Mark it rather than leaving it 'initiated' forever, so the
    // outstanding view means something to whoever reads it.
    await service
      .from("pending_topups")
      .update({ status: "abandoned" })
      .eq("api_ref", apiRef);

    return NextResponse.json(
      { error: "Could not start M-Pesa payment. Please try again." },
      { status: 502 }
    );
  }

  // Diagnostic only — idempotency keys on api_ref, never on the invoice id.
  await service
    .from("pending_topups")
    .update({ invoice_id: result.invoiceId })
    .eq("api_ref", apiRef);

  const clerkUserId = await currentClerkUserId();
  if (clerkUserId) {
    void captureTopupInitiated({
      clerkUserId,
      merchantId: merchant.id,
      amountKes: amount,
      node: merchant.node,
    });
  }

  return NextResponse.json({ invoiceId: result.invoiceId, state: result.state });
}
