import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  verifyWebhookChallenge,
  fetchCollectionStatus,
  INTASEND_SETTLED_STATE,
  INTASEND_KNOWN_UNSETTLED_STATES,
} from "@/lib/intasend";
import { notifyMerchant } from "@/lib/notify-merchant";
import { recordMerchantTransaction, logWebhookFailure } from "@/lib/merchant-ledger";
import { MAX_TOPUP_AMOUNT } from "@/lib/currency";
import { captureTopupCompletedMpesa } from "@/lib/analytics";

/**
 * IntaSend M-Pesa top-up webhook.
 *
 * **The request body is a pointer, not an instruction** (drift row D58).
 *
 * IntaSend authenticates its webhook with a plaintext shared secret echoed in
 * the body — there is no signature over the payload, unlike Stripe's HMAC. So a
 * valid `challenge` proves only that the caller knows the secret. It does not
 * prove that any money moved, how much, or for whom. Crediting a wallet from
 * the body meant a single leaked env var was unlimited spendable balance for
 * any merchant, up to MAX_TOPUP_AMOUNT per request.
 *
 * The fix is not a signature IntaSend does not send. It is to use the webhook
 * only to learn *which invoice to look at*, then ask IntaSend directly what
 * that invoice was worth and who it belongs to, and credit from that answer:
 *
 *   - the amount comes from the status API's `value`, never `payload.value`
 *   - the merchant comes from the status API's `api_ref`, never `payload.api_ref`
 *   - the settled check is the status API's `state`, never `payload.state`
 *
 * A forged body can therefore do nothing worse than make this route look up a
 * real invoice and credit exactly what genuinely settled — and the ledger's
 * uniqueness constraint on `provider_reference` makes even that a no-op the
 * second time.
 *
 * **Response codes are a retry contract, not decoration.** 500 asks IntaSend to
 * deliver again and is used whenever the truth could not be established; 200
 * ends delivery and is used when the truth is known and is "nothing to credit".
 * Never returning 200 on an unknown is what stops a real top-up being dropped
 * because IntaSend was briefly unreachable. Retrying is safe: every ledger
 * write is idempotent on `provider_reference`.
 */
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

  // The only thing taken from the body: which invoice to ask IntaSend about.
  const invoiceId: string | null =
    typeof payload.invoice_id === "string" && payload.invoice_id
      ? payload.invoice_id
      : typeof payload.id === "string" && payload.id
        ? payload.id
        : null;

  if (!invoiceId) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: "IntaSend webhook carried no invoice_id — nothing to verify.",
      payload: body,
    });
    return NextResponse.json({ received: true });
  }

  const status = await fetchCollectionStatus(invoiceId);

  if (!status.ok) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Could not verify IntaSend invoice ${invoiceId} (${status.reason}): ${status.detail}`,
      payload: body,
    });
    // Could not establish the truth. Ask for redelivery rather than silently
    // dropping what may be a real settled payment.
    return NextResponse.json({ error: "Verification unavailable." }, { status: 500 });
  }

  const invoice = status.invoice;

  if (invoice.state !== INTASEND_SETTLED_STATE) {
    // Authoritative, so no redelivery is wanted — IntaSend sends another
    // webhook when the state changes.
    //
    // The known non-settled states are silent because they are the normal
    // lifecycle and logging them would bury the failures that matter. A state
    // outside that set is different: it means IntaSend is reporting something
    // this code has never seen, and the only visible symptom would be a top-up
    // that never credits with nothing anywhere explaining why.
    if (!INTASEND_KNOWN_UNSETTLED_STATES.has(invoice.state.toUpperCase())) {
      await logWebhookFailure(service, {
        paymentProvider: "intasend",
        errorMessage: `IntaSend invoice ${invoiceId} reported an unrecognised state "${invoice.state}" — not credited. ${invoice.failedReason ?? ""}`.trim(),
        payload: body,
      });
    }
    return NextResponse.json({ received: true });
  }

  const match = invoice.apiRef?.match(/^topup:([0-9a-f-]+):/i);
  if (!match) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Settled IntaSend invoice ${invoiceId} has an api_ref this app did not issue: ${invoice.apiRef}`,
      payload: body,
    });
    return NextResponse.json({ received: true });
  }
  const merchantId = match[1];

  // Top-ups are initiated in KES only (see /api/topup). A settled invoice in
  // any other currency is not something to convert on a guess — the FX provider
  // is a display concern on the Stripe rail, not a licence to invent a rate on
  // the money path here.
  //
  // The currency must be stated, not merely not-contradictory. An earlier
  // version read `invoice.currency && invoice.currency.toUpperCase() !== "KES"`,
  // which short-circuits when IntaSend returns no currency at all and credits
  // the amount as KES anyway — the exact guess the paragraph above forbids,
  // reached by the falsy branch instead of the explicit one. IntaSend documents
  // `currency` on this response, so its absence means the shape is not what
  // this app expects and is a reason to stop rather than to assume.
  if (invoice.currency?.toUpperCase() !== "KES") {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Settled IntaSend invoice ${invoiceId} is in ${invoice.currency ?? "an unstated currency"}, not KES — refusing to credit on an assumed rate.`,
      payload: body,
    });
    return NextResponse.json({ received: true });
  }

  // `value` is the gross amount the payer was charged, which is what this rail
  // has always credited. IntaSend also reports `net_amount` (value minus their
  // charges); switching to it would change what merchants receive and is a
  // product decision, not a review fix — see the note in the D58 register row.
  const amount = invoice.value;
  if (amount == null || amount <= 0 || amount > MAX_TOPUP_AMOUNT) {
    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: `Settled IntaSend invoice ${invoiceId} reported an unusable amount: ${invoice.value}`,
      payload: body,
    });
    return NextResponse.json({ received: true });
  }

  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount,
    transactionType: "topup",
    paymentProvider: "intasend",
    providerReference: invoice.invoiceId,
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
