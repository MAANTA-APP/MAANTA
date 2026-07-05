import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!webhookSecret || !signature) {
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 401 }
    );
  }

  const rawBody = await request.text();

  let event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as {
    id: string;
    client_reference_id: string | null;
    amount_total: number | null;
  };

  const merchantId = session.client_reference_id;
  if (!merchantId) {
    console.error("Stripe session missing client_reference_id:", session.id);
    return NextResponse.json({ received: true });
  }

  const amount = (session.amount_total ?? 0) / 100;
  const service = createServiceClient();

  // Stripe may retry webhook delivery; skip if already credited.
  const { data: existing } = await service
    .from("merchant_transactions")
    .select("id")
    .eq("provider_reference", session.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true });
  }

  await service.from("merchant_transactions").insert({
    merchant_id: merchantId,
    amount,
    transaction_type: "topup",
    payment_provider: "stripe",
    provider_reference: session.id,
    description: "Card top-up via Stripe",
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

  return NextResponse.json({ received: true });
}
