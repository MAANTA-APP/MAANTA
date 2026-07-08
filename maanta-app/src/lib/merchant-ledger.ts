import type { createServiceClient } from "@/lib/supabase/service";
import type { SupportedCurrency } from "@/lib/currency";

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
    | "dispute";
  paymentProvider: string;
  providerReference: string | null;
  description: string;
  currency?: SupportedCurrency;
  chargedAmount?: number;
};

// Records a ledger entry and adjusts the merchant's balance in one place, so
// every payment webhook (topups, refunds, disputes, across providers) shares
// the same idempotency check and balance-update logic instead of each
// reimplementing it slightly differently.
export async function recordMerchantTransaction(
  service: ServiceClient,
  entry: LedgerEntry
): Promise<{ applied: boolean }> {
  if (entry.providerReference) {
    const { data: existing } = await service
      .from("merchant_transactions")
      .select("id")
      .eq("provider_reference", entry.providerReference)
      .maybeSingle();

    if (existing) {
      return { applied: false };
    }
  }

  await service.from("merchant_transactions").insert({
    merchant_id: entry.merchantId,
    amount: entry.amount,
    transaction_type: entry.transactionType,
    payment_provider: entry.paymentProvider,
    provider_reference: entry.providerReference,
    description: entry.description,
    currency: entry.currency ?? "KES",
    charged_amount: entry.chargedAmount ?? null,
  });

  const { data: merchant } = await service
    .from("merchants")
    .select("account_balance")
    .eq("id", entry.merchantId)
    .maybeSingle();

  if (merchant) {
    await service
      .from("merchants")
      .update({
        account_balance: Number(merchant.account_balance) + entry.amount,
      })
      .eq("id", entry.merchantId);
  }

  return { applied: true };
}

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
  await service.from("payment_webhook_failures").insert({
    payment_provider: params.paymentProvider,
    event_type: params.eventType ?? null,
    error_message: params.errorMessage,
    payload: params.payload ?? null,
  });
}
