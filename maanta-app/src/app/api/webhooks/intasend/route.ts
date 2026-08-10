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

  const apiRef: string = typeof payload.api_ref === "string" ? payload.api_ref : "";
  const match = apiRef.match(/^topup:([0-9a-f-]+):/i);
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

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TOPUP_AMOUNT) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Invalid top-up amount on IntaSend webhook: ${amount}`,
      payload: body,
    });
    return NextResponse.json({ received: true });
  }

  // Idempotency key is the app-minted `api_ref`, never the provider's invoice
  // id. Two reasons, both load-bearing:
  //
  //  1. `invoice_id`/`id` is optional in the payload. When neither was present
  //     this used to pass NULL, and provider_reference's UNIQUE constraint
  //     allows unlimited NULLs by design (they are how internal entries like
  //     success fees are recorded) — so the constraint never fired, and every
  //     redelivery of the same payment credited the wallet again.
  //  2. Keying on `invoice_id ?? api_ref` would be worse than either alone: a
  //     first delivery carrying an invoice id and a retry without one would
  //     produce two different keys for one payment, and double-credit.
  //
  // `api_ref` is minted once per STK push as `topup:<merchant-uuid>:<uuid>`
  // (src/app/api/topup/route.ts), is present on every payload that reaches
  // here — the regex above returns early otherwise — and is stable across
  // redeliveries. So it is the one value that is always non-null and always
  // identical for repeat deliveries of the same top-up.
  //
  // This closes replay and accidental double-credit. It does NOT authenticate
  // the sender: `verifyWebhookChallenge` is still a static shared secret
  // echoed in the body, with no signature over the payload, so a caller
  // holding that secret can still mint fresh api_refs. That half needs a
  // provider-side HMAC — tracked as drift D83.
  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount,
    transactionType: "topup",
    paymentProvider: "intasend",
    providerReference: apiRef,
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
