import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// --- Mocks -------------------------------------------------------------
// These tests exercise route.ts's own idempotency/dedupe logic (the fix for
// the refund/dispute double-debit risk, and per-refund keying so partial
// refunds each get their own debit) and its try/catch error handling — not
// the real Stripe SDK or the real DB. Everything below the signature
// verification boundary is mocked so we can drive specific event shapes and
// specific "does this provider_reference already exist" states.

const constructEventMock = vi.fn();
const sessionsListMock = vi.fn();
const refundsListMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
    checkout: { sessions: { list: sessionsListMock } },
    refunds: { list: refundsListMock },
  }),
}));

const recordMerchantTransactionMock = vi.fn();
const logWebhookFailureMock = vi.fn();

vi.mock("@/lib/merchant-ledger", () => ({
  recordMerchantTransaction: (...args: unknown[]) => recordMerchantTransactionMock(...args),
  logWebhookFailure: (...args: unknown[]) => logWebhookFailureMock(...args),
}));

vi.mock("@/lib/notify-merchant", () => ({
  notifyMerchant: vi.fn(),
}));

// merchant_transactions lookup table for hasExistingLedgerEntry() /
// hasRefundLedgerEntry(), keyed by provider_reference. Reset per test via
// existingReferences.clear().
const existingReferences = new Set<string>();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== "merchant_transactions") {
        throw new Error(`Unexpected table in test double: ${table}`);
      }
      let providerReference: string | undefined;
      let likePrefix: string | undefined;
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === "provider_reference") providerReference = value;
          return builder;
        },
        like: (column: string, pattern: string) => {
          if (column === "provider_reference") likePrefix = pattern.replace(/%$/, "");
          return builder;
        },
        limit: () =>
          Promise.resolve({
            data: likePrefix
              ? Array.from(existingReferences)
                  .filter((ref) => ref.startsWith(likePrefix as string))
                  .map((ref) => ({ id: ref }))
              : [],
            error: null,
          }),
        maybeSingle: () =>
          Promise.resolve({
            data: providerReference && existingReferences.has(providerReference) ? { id: "tx-id" } : null,
            error: null,
          }),
      };
      return builder;
    },
  }),
}));

function makeRequest(): Request {
  return new Request("https://maanta.app/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: JSON.stringify({}),
  });
}

function refundedChargeEvent() {
  return {
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_1",
        payment_intent: "pi_shared",
        currency: "kes",
        amount_refunded: 3000,
      },
    },
  };
}

beforeEach(() => {
  existingReferences.clear();
  constructEventMock.mockReset();
  sessionsListMock.mockReset();
  refundsListMock.mockReset();
  recordMerchantTransactionMock.mockReset();
  logWebhookFailureMock.mockReset();
  recordMerchantTransactionMock.mockResolvedValue({ applied: true });
  refundsListMock.mockResolvedValue({
    data: [{ id: "re_1", amount: 3000, status: "succeeded" }],
  });
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("Stripe webhook refund handling", () => {
  it("keys each refund debit off payment_intent + refund id", async () => {
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:refund:re_1", amount: -30 })
    );
  });

  it("records every partial refund individually, not the cumulative amount", async () => {
    // Second partial refund on the same charge: amount_refunded is cumulative
    // (3000 = 1000 + 2000), but each refund object must be debited once.
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });
    refundsListMock.mockResolvedValue({
      data: [
        { id: "re_1", amount: 1000, status: "succeeded" },
        { id: "re_2", amount: 2000, status: "succeeded" },
        { id: "re_3", amount: 500, status: "failed" },
      ],
    });

    await POST(makeRequest());

    expect(recordMerchantTransactionMock).toHaveBeenCalledTimes(2);
    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:refund:re_1", amount: -10 })
    );
    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:refund:re_2", amount: -20 })
    );
  });

  it("skips per-refund debits when a legacy cumulative refund entry exists", async () => {
    existingReferences.add("pi_shared:refund");
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorMessage: expect.stringContaining("legacy cumulative refund entry"),
      })
    );
  });

  it("skips the refund debit when an unresolved dispute hold already exists for the same payment_intent", async () => {
    existingReferences.add("pi_shared:hold");
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // The double-debit guard fires: no ledger write happens for the refund.
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorMessage: expect.stringContaining("Skipped refund debit"),
      })
    );
  });

  it("applies the refund debit once the dispute hold has been released", async () => {
    existingReferences.add("pi_shared:hold");
    existingReferences.add("pi_shared:release");
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    await POST(makeRequest());

    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:refund:re_1" })
    );
  });
});

describe("Stripe webhook dispute dedupe", () => {
  function disputeCreatedEvent() {
    return {
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_1",
          payment_intent: "pi_shared",
          currency: "kes",
          amount: 3000,
          status: "warning_needs_response",
        },
      },
    };
  }

  it("skips the dispute hold when the same payment_intent was already refunded (per-refund entry)", async () => {
    existingReferences.add("pi_shared:refund:re_1");
    constructEventMock.mockReturnValue(disputeCreatedEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorMessage: expect.stringContaining("Skipped dispute hold"),
      })
    );
  });

  it("skips the dispute hold when a legacy cumulative refund entry exists", async () => {
    existingReferences.add("pi_shared:refund");
    constructEventMock.mockReturnValue(disputeCreatedEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    await POST(makeRequest());

    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("applies the dispute hold using payment_intent-based provider_reference when no refund exists", async () => {
    constructEventMock.mockReturnValue(disputeCreatedEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    await POST(makeRequest());

    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:hold", amount: -30 })
    );
  });
});

describe("Stripe webhook error handling (task 6)", () => {
  it("logs to payment_webhook_failures and returns 500 when the Stripe API call fails, instead of throwing uncaught", async () => {
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockRejectedValue(new Error("Stripe API is down"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(logWebhookFailureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorMessage: expect.stringContaining("Stripe API is down"),
      })
    );
    // Never reached the point of attempting a ledger write with bad data.
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("logs and returns 500 when the refunds listing fails mid-handler", async () => {
    constructEventMock.mockReturnValue(refundedChargeEvent());
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });
    refundsListMock.mockRejectedValue(new Error("refund list unavailable"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(logWebhookFailureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorMessage: expect.stringContaining("refund list unavailable"),
      })
    );
  });

  it("returns 400 and logs when signature verification throws", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(logWebhookFailureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorMessage: expect.stringContaining("Signature verification failed"),
      })
    );
  });
});
