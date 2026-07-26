import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookChallenge } from "@/lib/intasend";
import { notifyMerchant } from "@/lib/notify-merchant";
import { recordMerchantTransaction, logWebhookFailure } from "@/lib/merchant-ledger";
import { MAX_TOPUP_AMOUNT } from "@/lib/currency";
import { captureTopupCompletedMpesa } from "@/lib/analytics";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const service = createServiceClient();

  if (
    typeof body !== "object" ||
    body === null ||
    !verifyWebhookChallenge((body as Record<string, unknown>).challenge)
  ) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: "Invalid webhook challenge.",
      payload: body,
    });
    return NextResponse.json({ error: "Invalid challenge." }, { status: 401 });
  }

  const payload = body as Record<string, unknown>;

  if (payload.state !== "COMPLETE") {
    // Ignore PENDING/PROCESSING/FAILED — only credit on confirmed payment.
    return NextResponse.json({ received: true });
  }

  const apiRef: string | undefined =
    typeof payload.api_ref === "string" ? payload.api_ref : undefined;
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
  const amount = Number(payload.value ?? payload.amount ?? 0);
  const invoiceId: string | null =
    typeof payload.invoice_id === "string"
      ? payload.invoice_id
      : typeof payload.id === "string"
        ? payload.id
        : null;

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TOPUP_AMOUNT) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Invalid top-up amount on IntaSend webhook: ${amount}`,
      payload: body,
    });
    return NextResponse.json({ received: true });
  }

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

  const { data: merchantMeta } = await service
    .from("merchants")
    .select("node")
    .eq("id", merchantId)
    .maybeSingle();
  void captureTopupCompletedMpesa({
    merchantId,
    amountKes: amount,
    node: merchantMeta?.node,
  });

  await notifyMerchant(service, merchantId, {
    title: "Top-up received",
    body: `KES ${amount} added to your MAANTA balance via M-Pesa.`,
    url: "/merchant/topup",
  });

  return NextResponse.json({ received: true });
}
