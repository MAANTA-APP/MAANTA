import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// SEC-001 / drift D83. These lock the crediting path's idempotency key.
//
// The defect: `providerReference` was the provider's `invoice_id`/`id`, which
// is optional in the payload. When absent it passed NULL, and the UNIQUE
// constraint on merchant_transactions.provider_reference allows unlimited
// NULLs by design (migration 20260709000151 says so in its own comment), so
// record_merchant_ledger_entry never raised unique_violation and every
// redelivery credited the wallet again.
//
// The fix keys on the app-minted `api_ref` instead — always present (the
// merchant-id regex returns early otherwise) and stable across redeliveries.
// What these tests pin is that the reference reaching the ledger is NEVER
// null, and is identical for repeat deliveries of one payment.
//
// The DB-side half — that a repeated reference actually rolls back — belongs
// to the RPC and is covered by supabase/tests/topup_settles_arrears_test.sql
// and the constraint itself; here the ledger is mocked, so these assert what
// route.ts hands it.

const recordMerchantTransactionMock = vi.fn();
const logWebhookFailureMock = vi.fn();

vi.mock("@/lib/merchant-ledger", () => ({
  recordMerchantTransaction: (...args: unknown[]) =>
    recordMerchantTransactionMock(...args),
  logWebhookFailure: (...args: unknown[]) => logWebhookFailureMock(...args),
}));

vi.mock("@/lib/notify-merchant", () => ({
  notifyMerchant: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics", () => ({
  captureTopupCompletedMpesa: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { node: "node0" } }) }),
      }),
    }),
  }),
}));

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const API_REF = `topup:${MERCHANT}:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/webhooks/intasend", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

/** A COMPLETE payment that carries no invoice id at all — the replay shape. */
function payloadWithoutInvoiceId(overrides: Record<string, unknown> = {}) {
  return {
    challenge: "test-challenge",
    state: "COMPLETE",
    api_ref: API_REF,
    value: 500,
    ...overrides,
  };
}

describe("POST /api/webhooks/intasend — crediting idempotency (SEC-001)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTASEND_WEBHOOK_SECRET = "test-challenge";
    recordMerchantTransactionMock.mockResolvedValue({ applied: true });
  });

  it("never passes a null provider reference when the payload has no invoice id", async () => {
    const res = await post(payloadWithoutInvoiceId());

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).toHaveBeenCalledTimes(1);
    const entry = recordMerchantTransactionMock.mock.calls[0][1];
    // The whole defect in one assertion: this used to be null.
    expect(entry.providerReference).not.toBeNull();
    expect(entry.providerReference).toBe(API_REF);
    expect(entry.merchantId).toBe(MERCHANT);
    expect(entry.amount).toBe(500);
  });

  it("uses the same reference for a redelivery, so the ledger can dedupe it", async () => {
    await post(payloadWithoutInvoiceId());
    // Second delivery of the same payment: the ledger reports it as already
    // recorded, which is what the UNIQUE constraint produces in real life.
    recordMerchantTransactionMock.mockResolvedValue({ applied: false });
    await post(payloadWithoutInvoiceId());

    const [first, second] = recordMerchantTransactionMock.mock.calls;
    expect(first[1].providerReference).toBe(second[1].providerReference);
  });

  it("ignores the provider's invoice id, so a retry that drops it still dedupes", async () => {
    // The trap in keying on `invoice_id ?? api_ref`: one payment delivered
    // twice, once with an invoice id and once without, would produce two
    // different keys and credit twice.
    await post(payloadWithoutInvoiceId({ invoice_id: "inv_123" }));
    await post(payloadWithoutInvoiceId());

    const [withId, withoutId] = recordMerchantTransactionMock.mock.calls;
    expect(withId[1].providerReference).toBe(API_REF);
    expect(withoutId[1].providerReference).toBe(API_REF);
  });

  it("credits nothing when the challenge is wrong", async () => {
    const res = await post(
      payloadWithoutInvoiceId({ challenge: "not-the-secret" })
    );

    expect(res.status).toBe(401);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalled();
  });

  it("credits nothing when the secret is unset — it fails closed", async () => {
    delete process.env.INTASEND_WEBHOOK_SECRET;
    const res = await post(payloadWithoutInvoiceId({ challenge: undefined }));

    expect(res.status).toBe(401);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("credits nothing when api_ref is missing, so the reference can never be empty", async () => {
    const res = await post(payloadWithoutInvoiceId({ api_ref: undefined }));

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalled();
  });

  it("credits nothing on a state other than COMPLETE", async () => {
    const res = await post(payloadWithoutInvoiceId({ state: "PENDING" }));

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("credits nothing on an out-of-range amount", async () => {
    await post(payloadWithoutInvoiceId({ value: 1_000_001 }));
    await post(payloadWithoutInvoiceId({ value: 0 }));
    await post(payloadWithoutInvoiceId({ value: "not-a-number" }));

    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });
});
