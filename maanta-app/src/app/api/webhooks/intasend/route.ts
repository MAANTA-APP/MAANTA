import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookChallenge } from "@/lib/intasend";
import { notifyMerchant } from "@/lib/notify-merchant";
import { recordMerchantTransaction, logWebhookFailure } from "@/lib/merchant-ledger";
import { captureTopupCompletedMpesa } from "@/lib/analytics";

export async function POST(request: Request) {
  const body = await request.json();
  const service = createServiceClient();

  if (!verifyWebhookChallenge(body.challenge)) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: "Invalid webhook challenge.",
      payload: body,
    });
    return NextResponse.json({ error: "Invalid challenge." }, { status: 401 });
  }

  if (body.state !== "COMPLETE") {
    // Ignore PENDING/PROCESSING/FAILED — only credit on confirmed payment.
    return NextResponse.json({ received: true });
  }

  const apiRef: string | undefined = body.api_ref;
  const match = apiRef?.match(/^topup:([0-9a-f-]+):/i);
  if (!match) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Unrecognized api_ref on IntaSend webhook: ${apiRef}`,
      payload: body,
    });
    return NextResponse.json({ received: true });
  }

  const merchantId = match[1];
  const amount = Number(body.value ?? body.amount ?? 0);
  const invoiceId: string | null = body.invoice_id ?? body.id ?? null;

  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount,
    transactionType: "topup",
    paymentProvider: "intasend",
    providerReference: invoiceId,
    description: "M-Pesa top-up via IntaSend",
    currency: "KES",
    chargedAmount: amount,
  });

  if (!applied) {
    return NextResponse.json({ received: true });
  }

  void captureTopupCompletedMpesa({ merchantId, amountKes: amount });

  await notifyMerchant(service, merchantId, {
    title: "Top-up received",
    body: `KES ${amount} added to your MAANTA balance via M-Pesa.`,
    url: "/merchant/topup",
  });

  return NextResponse.json({ received: true });
}
