import { describe, expect, it, vi } from "vitest";
import { recordMerchantTransaction, logWebhookFailure } from "@/lib/merchant-ledger";

// Minimal fake of the slice of the Supabase service client that
// recordMerchantTransaction / logWebhookFailure actually call. Real
// balance-math and idempotency correctness of record_merchant_ledger_entry
// is Postgres logic (SECURITY DEFINER RPC) and is verified live against the
// project's SQL, not here — these tests only lock down the JS-side contract:
// which RPC gets called, with what params, and how its response maps to
// { applied }.
function makeServiceClientMock(rpcImpl: (name: string, params: unknown) => { data: unknown; error: unknown }) {
  const rpc = vi.fn((name: string, params: unknown) => ({
    single: () => Promise.resolve(rpcImpl(name, params)),
  }));
  const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const from = vi.fn(() => ({ insert }));
  return { rpc, from, insert } as unknown as Parameters<typeof recordMerchantTransaction>[0] & {
    rpc: typeof rpc;
    from: typeof from;
    insert: typeof insert;
  };
}

describe("recordMerchantTransaction", () => {
  it("calls record_merchant_ledger_entry with the entry mapped to RPC params", async () => {
    const service = makeServiceClientMock(() => ({
      data: { applied: true, new_balance: 570, new_arrears: 0 },
      error: null,
    }));

    const result = await recordMerchantTransaction(service, {
      merchantId: "merchant-1",
      amount: 500,
      transactionType: "topup",
      paymentProvider: "stripe",
      providerReference: "pi_123:topup",
      description: "Card top-up via Stripe",
      currency: "USD",
      chargedAmount: 3.87,
    });

    expect(result).toEqual({ applied: true });
    expect(service.rpc).toHaveBeenCalledWith("record_merchant_ledger_entry", {
      p_merchant_id: "merchant-1",
      p_amount: 500,
      p_transaction_type: "topup",
      p_payment_provider: "stripe",
      p_provider_reference: "pi_123:topup",
      p_description: "Card top-up via Stripe",
      p_currency: "USD",
      p_charged_amount: 3.87,
    });
  });

  it("defaults currency to KES and charged_amount to null when omitted", async () => {
    const service = makeServiceClientMock(() => ({
      data: { applied: true, new_balance: 100, new_arrears: 0 },
      error: null,
    }));

    await recordMerchantTransaction(service, {
      merchantId: "merchant-1",
      amount: 100,
      transactionType: "topup",
      paymentProvider: "intasend",
      providerReference: "invoice-1",
      description: "M-Pesa top-up via IntaSend",
    });

    expect(service.rpc).toHaveBeenCalledWith(
      "record_merchant_ledger_entry",
      expect.objectContaining({ p_currency: "KES", p_charged_amount: null })
    );
  });

  it("returns applied: false when the RPC reports a duplicate provider_reference (idempotency)", async () => {
    const service = makeServiceClientMock(() => ({
      data: { applied: false, new_balance: null, new_arrears: null },
      error: null,
    }));

    const result = await recordMerchantTransaction(service, {
      merchantId: "merchant-1",
      amount: 500,
      transactionType: "topup",
      paymentProvider: "stripe",
      providerReference: "cs_duplicate",
      description: "Card top-up via Stripe",
    });

    expect(result).toEqual({ applied: false });
  });

  it("returns applied: false (never throws) when the RPC call itself errors", async () => {
    const service = makeServiceClientMock(() => ({
      data: null,
      error: { message: "merchant_not_found" },
    }));

    const result = await recordMerchantTransaction(service, {
      merchantId: "missing-merchant",
      amount: 500,
      transactionType: "topup",
      paymentProvider: "stripe",
      providerReference: "cs_1",
      description: "Card top-up via Stripe",
    });

    expect(result).toEqual({ applied: false });
  });
});

describe("logWebhookFailure", () => {
  it("inserts into payment_webhook_failures with the given fields", async () => {
    const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const from = vi.fn(() => ({ insert }));
    const service = { from } as unknown as Parameters<typeof logWebhookFailure>[0];

    await logWebhookFailure(service, {
      paymentProvider: "stripe",
      eventType: "charge.refunded",
      errorMessage: "boom",
      payload: { id: "evt_1" },
    });

    expect(from).toHaveBeenCalledWith("payment_webhook_failures");
    expect(insert).toHaveBeenCalledWith({
      payment_provider: "stripe",
      event_type: "charge.refunded",
      error_message: "boom",
      payload: { id: "evt_1" },
    });
  });

  it("never logs the raw payload when the insert itself fails", async () => {
    // Found by adversarial review. The redaction was applied to the DB row but
    // the failure branch four lines below console.error'd the caller's raw
    // `params` — and on the invalid-challenge branch that object's `challenge`
    // field is the live INTASEND_WEBHOOK_SECRET.
    const insert = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "insert exploded" } })
    );
    const from = vi.fn(() => ({ insert }));
    const service = { from } as unknown as Parameters<typeof logWebhookFailure>[0];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: "Invalid webhook challenge.",
      payload: {
        challenge: "the-live-shared-secret",
        phone_number: "+254712345678",
        state: "COMPLETE",
      },
    });

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("the-live-shared-secret");
    expect(logged).not.toContain("712345678");
    // Still useful: the diagnostic fields survive.
    expect(logged).toContain("intasend");
    expect(logged).toContain("COMPLETE");

    spy.mockRestore();
  });
});
