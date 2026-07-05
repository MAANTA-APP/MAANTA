import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookChallenge } from "@/lib/intasend";
import { notifyMerchant } from "@/lib/notify-merchant";

export async function POST(request: Request) {
  const body = await request.json();

  if (!verifyWebhookChallenge(body.challenge)) {
    return NextResponse.json({ error: "Invalid challenge." }, { status: 401 });
  }

  if (body.state !== "COMPLETE") {
    // Ignore PENDING/PROCESSING/FAILED — only credit on confirmed payment.
    return NextResponse.json({ received: true });
  }

  const apiRef: string | undefined = body.api_ref;
  const match = apiRef?.match(/^topup:([0-9a-f-]+):/i);
  if (!match) {
    console.error("Unrecognized api_ref on IntaSend webhook:", apiRef);
    return NextResponse.json({ received: true });
  }

  const merchantId = match[1];
  const amount = Number(body.value ?? body.amount ?? 0);
  const invoiceId: string | null = body.invoice_id ?? body.id ?? null;

  const service = createServiceClient();

  // IntaSend may retry webhook delivery; skip if we've already credited this
  // invoice rather than double-crediting the merchant's balance.
  if (invoiceId) {
    const { data: existing } = await service
      .from("merchant_transactions")
      .select("id")
      .eq("provider_reference", invoiceId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true });
    }
  }

  await service.from("merchant_transactions").insert({
    merchant_id: merchantId,
    amount,
    transaction_type: "topup",
    payment_provider: "intasend",
    provider_reference: invoiceId,
    description: "M-Pesa top-up via IntaSend",
  });

  const { data: merchant } = await service
    .from("merchants")
    .select("account_balance")
    .eq("id", merchantId)
    .maybeSingle();

  if (merchant) {
    await service
      .from("merchants")
      .update({ account_balance: Number(merchant.account_balance) + amount })
      .eq("id", merchantId);
  }

  await notifyMerchant(service, merchantId, {
    title: "Top-up received",
    body: `KES ${amount} added to your MAANTA balance via M-Pesa.`,
    url: "/merchant/topup",
  });

  return NextResponse.json({ received: true });
}
