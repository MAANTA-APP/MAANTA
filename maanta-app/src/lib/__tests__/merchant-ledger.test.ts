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

  /**
   * IntaSend's `challenge` is the plaintext shared webhook secret, and every
   * failure branch after the challenge check passes the *verified* body — so
   * these payloads carry the real secret, not a wrong guess at it.
   *
   * The insert has always redacted it. The console.error fallback beside it did
   * not, and printed the whole `params` object including the raw payload. Raised
   * in review as a claim about the insert, which was already safe; the adjacent
   * log line was the actual leak. Both sinks now read one redacted value.
   */
  it("keeps the webhook secret out of both the stored row and the error log", async () => {
    const insert = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "insert failed" } })
    );
    const from = vi.fn(() => ({ insert }));
    const service = { from } as unknown as Parameters<typeof logWebhookFailure>[0];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await logWebhookFailure(service, {
      paymentProvider: "intasend",
      errorMessage: "could not verify",
      payload: { challenge: "the-real-webhook-secret", invoice_id: "XMSLWOS" },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { challenge: "[REDACTED]", invoice_id: "XMSLWOS" },
      })
    );

    // The insert failed, so the fallback log ran — the branch that leaked.
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "the-real-webhook-secret"
    );
    // ...and it is redacted, not merely absent because the payload was dropped.
    expect(JSON.stringify(consoleError.mock.calls)).toContain("[REDACTED]");

    consoleError.mockRestore();
  });
});
