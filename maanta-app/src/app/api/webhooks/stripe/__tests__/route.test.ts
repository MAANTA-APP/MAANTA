import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// --- Mocks -------------------------------------------------------------
// These tests exercise route.ts's own idempotency/dedupe logic (the fix for
// the refund/dispute double-debit risk) and its try/catch error handling —
// not the real Stripe SDK or the real DB. Everything below the signature
// verification boundary is mocked so we can drive specific event shapes and
// specific "does this provider_reference already exist" states.

const constructEventMock = vi.fn();
const sessionsListMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
    checkout: { sessions: { list: sessionsListMock } },
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

// merchant_transactions lookup table for hasExistingLedgerEntry(), keyed by
// provider_reference. Reset per test via existingReferences.clear().
const existingReferences = new Set<string>();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== "merchant_transactions") {
        throw new Error(`Unexpected table in test double: ${table}`);
      }
      let providerReference: string | undefined;
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === "provider_reference") providerReference = value;
          return builder;
        },
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

beforeEach(() => {
  existingReferences.clear();
  constructEventMock.mockReset();
  sessionsListMock.mockReset();
  recordMerchantTransactionMock.mockReset();
  logWebhookFailureMock.mockReset();
  recordMerchantTransactionMock.mockResolvedValue({ applied: true });
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("Stripe webhook refund/dispute dedupe", () => {
  it("keys the refund debit off payment_intent, not charge.id", async () => {
    constructEventMock.mockReturnValue({
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_shared",
          currency: "kes",
          amount_refunded: 3000,
        },
      },
    });
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:refund", amount: -30 })
    );
  });

  it("skips the refund debit when an unresolved dispute hold already exists for the same payment_intent", async () => {
    existingReferences.add("pi_shared:hold");
    constructEventMock.mockReturnValue({
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_shared",
          currency: "kes",
          amount_refunded: 3000,
        },
      },
    });
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
    constructEventMock.mockReturnValue({
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_shared",
          currency: "kes",
          amount_refunded: 3000,
        },
      },
    });
    sessionsListMock.mockResolvedValue({ data: [{ client_reference_id: "merchant-1" }] });

    await POST(makeRequest());

    expect(recordMerchantTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReference: "pi_shared:refund" })
    );
  });

  it("skips the dispute hold when the same payment_intent was already refunded", async () => {
    existingReferences.add("pi_shared:refund");
    constructEventMock.mockReturnValue({
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
    });
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

  it("applies the dispute hold using payment_intent-based provider_reference when no refund exists", async () => {
    constructEventMock.mockReturnValue({
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
    });
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
    constructEventMock.mockReturnValue({
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_shared",
          currency: "kes",
          amount_refunded: 3000,
        },
      },
    });
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

  it("returns 500 and logs when signature verification throws", async () => {
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
