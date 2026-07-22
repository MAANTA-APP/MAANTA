import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";
import { notifyMerchant } from "@/lib/notify-merchant";
import { recordMerchantTransaction, logWebhookFailure } from "@/lib/merchant-ledger";
import { isSupportedCurrency, toKes, type SupportedCurrency } from "@/lib/currency";
import { captureTopupCompletedStripe } from "@/lib/analytics";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const service = createServiceClient();

  if (!webhookSecret || !signature) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      errorMessage: "Webhook not configured (missing secret or signature header).",
    });
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 401 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (err) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      errorMessage: `Signature verification failed: ${String(err)}`,
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Everything past signature verification can throw: Stripe API calls
  // (findMerchantIdForPaymentIntent) can fail transiently, and a handler bug
  // shouldn't silently 500 with no record. Catching here guarantees every
  // failure path reaches payment_webhook_failures instead of only ever
  // showing up in ephemeral server logs. Returning 500 (rather than 200)
  // lets Stripe retry the delivery — safe to retry because every handler's
  // ledger write is idempotent on provider_reference.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(service, event);
        break;
      case "charge.refunded":
        await handleChargeRefunded(service, event);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(service, event);
        break;
      case "charge.dispute.closed":
        await handleDisputeClosed(service, event);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `Handler threw: ${String(err instanceof Error ? err.message : err)}`,
    });
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(
  service: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
) {
  const session = event.data.object as Stripe.Checkout.Session;

  const merchantId = session.client_reference_id;
  if (!merchantId) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `checkout.session.completed missing client_reference_id (session ${session.id}).`,
    });
    return;
  }

  const rawCurrency = (session.currency ?? "kes").toUpperCase();
  const currency: SupportedCurrency = isSupportedCurrency(rawCurrency)
    ? rawCurrency
    : "KES";
  const chargedAmount = (session.amount_total ?? 0) / 100;
  const kesAmount = await toKes(chargedAmount, currency);

  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount: kesAmount,
    transactionType: "topup",
    paymentProvider: "stripe",
    providerReference: session.id,
    description: "Card top-up via Stripe",
    currency,
    chargedAmount,
  });

  if (!applied) return;

  void captureTopupCompletedStripe({ merchantId, amountKes: kesAmount, currency, chargedAmount });

  await notifyMerchant(service, merchantId, {
    title: "Top-up received",
    body:
      currency === "KES"
        ? `KES ${kesAmount} added to your MAANTA balance via card.`
        : `${currency} ${chargedAmount} (≈ KES ${kesAmount.toFixed(2)}) added to your MAANTA balance via card.`,
    url: "/merchant/topup",
  });
}

// Deliberately does NOT catch here. A thrown error means the Stripe API
// call itself failed (rate limit, network blip, Stripe outage) — a
// transient condition worth retrying, unlike "no matching session" (a data
// condition, which is a normal `null` return, not a throw). Letting it
// propagate means it's caught once, uniformly, by the top-level try/catch
// in POST(), which logs it to payment_webhook_failures and returns 500 so
// Stripe retries the delivery (safe: every ledger write here is idempotent
// on provider_reference).
async function findMerchantIdForPaymentIntent(
  paymentIntentId: string | null
): Promise<string | null> {
  if (!paymentIntentId) return null;
  const stripe = getStripeClient();
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  return sessions.data[0]?.client_reference_id ?? null;
}

// Idempotency for refund/dispute money movements is keyed off the
// underlying payment_intent (not charge.id / dispute.id, which are
// unrelated strings for what can be the same money movement — the same
// payment_intent can go through: dispute opened (hold) -> dispute resolved
// via refund instead of dispute-closed-won -> without this, both a hold
// debit AND a refund debit would apply for the same money, double-debiting
// the merchant's wallet).
async function hasExistingLedgerEntry(
  service: ReturnType<typeof createServiceClient>,
  providerReference: string
): Promise<boolean> {
  const { data } = await service
    .from("merchant_transactions")
    .select("id")
    .eq("payment_provider", "stripe")
    .eq("provider_reference", providerReference)
    .maybeSingle();
  return !!data;
}

async function handleChargeRefunded(
  service: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  const merchantId = await findMerchantIdForPaymentIntent(paymentIntentId);
  if (!merchantId || !paymentIntentId) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `Could not resolve merchant for refunded charge ${charge.id}.`,
    });
    return;
  }

  // If an unresolved dispute hold already exists for this payment_intent,
  // that hold already accounts for the money leaving the merchant's
  // balance — applying a second, unrelated refund debit on top would be a
  // double-debit for the same underlying charge.
  const holdReference = `${paymentIntentId}:hold`;
  const releaseReference = `${paymentIntentId}:release`;
  const hasUnresolvedHold =
    (await hasExistingLedgerEntry(service, holdReference)) &&
    !(await hasExistingLedgerEntry(service, releaseReference));

  if (hasUnresolvedHold) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `Skipped refund debit for payment_intent ${paymentIntentId}: an unresolved dispute hold (${holdReference}) already accounts for this money movement (charge ${charge.id}).`,
    });
    return;
  }

  const currency = (charge.currency ?? "kes").toUpperCase();
  const refundedInCurrency = charge.amount_refunded / 100;
  const kesAmount = await toKes(
    refundedInCurrency,
    isSupportedCurrency(currency) ? currency : "KES"
  );

  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount: -kesAmount,
    transactionType: "refund",
    paymentProvider: "stripe",
    providerReference: `${paymentIntentId}:refund`,
    description: "Refund via Stripe",
    currency: isSupportedCurrency(currency) ? currency : "KES",
    chargedAmount: refundedInCurrency,
  });

  if (!applied) return;

  await notifyMerchant(service, merchantId, {
    title: "Refund processed",
    body: `KES ${kesAmount.toFixed(2)} was deducted from your MAANTA balance due to a refund.`,
    url: "/merchant/topup",
  });
}

async function handleDisputeCreated(
  service: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
) {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null);

  const merchantId = await findMerchantIdForPaymentIntent(paymentIntentId);
  if (!merchantId || !paymentIntentId) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `Could not resolve merchant for dispute ${dispute.id}.`,
    });
    return;
  }

  // Symmetric guard: if this payment_intent was already refunded, the money
  // has already left the merchant's balance via the refund path — don't
  // also apply a dispute hold on top of it.
  const refundReference = `${paymentIntentId}:refund`;
  if (await hasExistingLedgerEntry(service, refundReference)) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `Skipped dispute hold for payment_intent ${paymentIntentId}: already refunded (${refundReference}), avoiding a double-debit for dispute ${dispute.id}.`,
    });
    return;
  }

  const currency = (dispute.currency ?? "kes").toUpperCase();
  const disputedInCurrency = dispute.amount / 100;
  const kesAmount = await toKes(
    disputedInCurrency,
    isSupportedCurrency(currency) ? currency : "KES"
  );

  // Stripe holds the disputed funds itself; we mirror that hold here so the
  // merchant's balance reflects money that is no longer safely theirs.
  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount: -kesAmount,
    transactionType: "dispute",
    paymentProvider: "stripe",
    providerReference: `${paymentIntentId}:hold`,
    description: "Funds held for card dispute via Stripe",
    currency: isSupportedCurrency(currency) ? currency : "KES",
    chargedAmount: disputedInCurrency,
  });

  if (!applied) return;

  await notifyMerchant(service, merchantId, {
    title: "Card dispute opened",
    body: `KES ${kesAmount.toFixed(2)} has been held pending a card dispute. It will be released if you win the dispute.`,
    url: "/merchant/topup",
  });
}

async function handleDisputeClosed(
  service: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
) {
  const dispute = event.data.object as Stripe.Dispute;
  if (dispute.status !== "won") return; // lost/warning_closed: hold stays deducted

  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null);

  const merchantId = await findMerchantIdForPaymentIntent(paymentIntentId);
  if (!merchantId || !paymentIntentId) {
    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: event.type,
      errorMessage: `Could not resolve merchant to release won dispute ${dispute.id}.`,
    });
    return;
  }

  const currency = (dispute.currency ?? "kes").toUpperCase();
  const disputedInCurrency = dispute.amount / 100;
  const kesAmount = await toKes(
    disputedInCurrency,
    isSupportedCurrency(currency) ? currency : "KES"
  );

  const { applied } = await recordMerchantTransaction(service, {
    merchantId,
    amount: kesAmount,
    transactionType: "dispute",
    paymentProvider: "stripe",
    providerReference: `${paymentIntentId}:release`,
    description: "Dispute won — held funds released via Stripe",
    currency: isSupportedCurrency(currency) ? currency : "KES",
    chargedAmount: disputedInCurrency,
  });

  if (!applied) return;

  await notifyMerchant(service, merchantId, {
    title: "Dispute won",
    body: `KES ${kesAmount.toFixed(2)} has been released back to your MAANTA balance.`,
    url: "/merchant/topup",
  });
}
