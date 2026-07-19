import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireMerchant } from "@/lib/merchant-api";
import { initiateMpesaStkPush } from "@/lib/intasend";
import { isValidTopupAmount, MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT } from "@/lib/currency";

export async function POST(request: Request) {
  // Wallet top-up is an owner-only billing action. We resolve the merchant
  // through getMerchantContext (owner OR staff) and then require ownership
  // EXPLICITLY, so staff are excluded by intent — not by the incidental fact
  // that merchants happen to be keyed on the owner's user_id. This is the gate
  // that keeps the frozen rule ("staff cannot touch billing/top-ups/boosts")
  // true even if the merchant-resolution path is ever changed to admit staff.
  //
  // merchant_staff.can_topup is deliberately NOT consulted here: that toggle is
  // owner-settable, and the frozen rule only bends when GOVERNANCE (a
  // decisions-log change) opens staff billing — never on an owner flag alone.
  // See docs/skills/merchant-staff-billing-reconciliation.md.
  const auth = await requireMerchant();
  if ("error" in auth) return auth.error;
  const { user, merchant, isOwner } = auth.ctx;
  if (!isOwner) {
    return NextResponse.json(
      { error: "Only the shop owner can top up the wallet." },
      { status: 403 }
    );
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

  // Encodes the merchant id directly in api_ref so the webhook (which has no
  // other way to look up an in-flight request — merchant_transactions has no
  // "pending" status) can attribute the eventual COMPLETE event.
  const apiRef = `topup:${merchant.id}:${randomUUID()}`;

  const result = await initiateMpesaStkPush({
    amount,
    phoneNumber,
    apiRef,
    name: user.full_name ?? "MAANTA Merchant",
    email: user.email ?? "merchant@maanta.app",
  });

  if (!result) {
    return NextResponse.json(
      { error: "Could not start M-Pesa payment. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ invoiceId: result.invoiceId, state: result.state });
}
