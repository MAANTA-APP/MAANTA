import * as Sentry from "@sentry/nextjs";
import type { createServiceClient } from "@/lib/supabase/service";
import type { SupportedCurrency } from "@/lib/currency";
import { redactWebhookPayload } from "@/lib/redact";

type ServiceClient = ReturnType<typeof createServiceClient>;

type LedgerEntry = {
  merchantId: string;
  amount: number; // signed KES amount: positive credits, negative debits
  transactionType:
    | "topup"
    | "success_fee"
    | "success_fee_arrears"
    | "boost_fee"
    | "subscription"
    | "refund"
    | "dispute"
    // Written only by record_merchant_ledger_entry itself when a top-up settles
    // arrears first (never passed from app code) — listed so the union stays a
    // complete mirror of the merchant_transactions transaction_type constraint.
    | "arrears_settlement";
  paymentProvider: string;
  providerReference: string | null;
  description: string;
  currency?: SupportedCurrency;
  chargedAmount?: number;
};

// Records a ledger entry and adjusts the merchant's balance in one atomic
// DB call, so every payment webhook (topups, refunds, disputes, across
// providers) shares the same idempotency check and balance-update logic
// instead of each reimplementing it slightly differently.
//
// Delegates to the record_merchant_ledger_entry RPC (service_role-only,
// SECURITY DEFINER) rather than doing this as three separate round trips
// (select-then-insert idempotency check, insert, read-then-update balance)
// the way this function used to. That prior version had both a TOCTOU race
// on the idempotency check and a lost-update race on the balance itself
// under concurrent webhook delivery, and silently swallowed insert/update
// errors. The RPC does the idempotency check via a real UNIQUE constraint
// on provider_reference (merchant_transactions_provider_reference_key)
// inside the same transaction as the balance UPDATE and the ledger INSERT,
// so a duplicate delivery rolls back cleanly and errors are surfaced.
export async function recordMerchantTransaction(
  service: ServiceClient,
  entry: LedgerEntry
): Promise<{ applied: boolean }> {
  const { data, error } = await service
    .rpc("record_merchant_ledger_entry", {
      p_merchant_id: entry.merchantId,
      p_amount: entry.amount,
      p_transaction_type: entry.transactionType,
      p_payment_provider: entry.paymentProvider,
      p_provider_reference: entry.providerReference,
      p_description: entry.description,
      p_currency: entry.currency ?? "KES",
      p_charged_amount: entry.chargedAmount ?? null,
    })
    .single<{ applied: boolean; new_balance: number | null; new_arrears: number | null }>();

  if (error) {
    console.error("record_merchant_ledger_entry RPC failed:", error, entry);
    Sentry.captureMessage(
      `record_merchant_ledger_entry failed for merchant ${entry.merchantId} (${entry.transactionType}, ref ${entry.providerReference}): ${error.message}`,
      "error"
    );
    return { applied: false };
  }

  return { applied: data?.applied ?? false };
}

// Redaction moved to lib/redact.ts so the rule has one home. The version that
// lived here removed exactly one key (`challenge`) while its name implied
// broader coverage, so IntaSend payloads persisted the payer's phone number
// verbatim — drift D85.

// Persists webhook failures that would otherwise only be visible in
// ephemeral server logs (console.error), so a missed signature check or an
// unrecognized event doesn't silently leave a merchant's balance wrong with
// no record anyone can go back and review.
export async function logWebhookFailure(
  service: ServiceClient,
  params: {
    paymentProvider: string;
    eventType?: string | null;
    errorMessage: string;
    payload?: unknown;
  }
): Promise<void> {
  // Alert first: a webhook failure usually means a merchant's balance is
  // about to silently not update, so it needs a human's eyes, not just a
  // table row. No-op until SENTRY_DSN is configured.
  Sentry.captureMessage(
    `Payment webhook failure [${params.paymentProvider}${params.eventType ? `/${params.eventType}` : ""}]: ${params.errorMessage}`,
    "error"
  );

  // Redact once, then use the same value for the row and for the failure log.
  // Logging `params` here instead was the original defect surviving four lines
  // below its own fix: redactWebhookPayload is pure, so `params.payload` is
  // still the untouched provider body — and on the invalid-challenge branch
  // that body's `challenge` field is the live INTASEND_WEBHOOK_SECRET.
  const redactedPayload =
    params.payload != null ? redactWebhookPayload(params.payload) : null;

  const { error } = await service.from("payment_webhook_failures").insert({
    payment_provider: params.paymentProvider,
    event_type: params.eventType ?? null,
    error_message: params.errorMessage,
    payload: redactedPayload,
  });

  if (error) {
    console.error("Failed to persist webhook failure:", error, {
      paymentProvider: params.paymentProvider,
      eventType: params.eventType,
      errorMessage: params.errorMessage,
      payload: redactedPayload,
    });
    Sentry.captureMessage(
      `Could not persist payment_webhook_failures row: ${error.message}`,
      "error"
    );
  }
}
