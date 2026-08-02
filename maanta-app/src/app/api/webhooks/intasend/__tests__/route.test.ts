import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guard for drift D58 — a wallet credit that trusted the webhook body.
 *
 * IntaSend authenticates its webhook with a plaintext shared secret in the
 * body and signs nothing, so a valid challenge proves only that the caller
 * knows the secret. The route used to take the amount from `payload.value` and
 * the merchant from `payload.api_ref`, which made one leaked env var worth
 * unlimited spendable balance for any merchant.
 *
 * The assertion that matters is therefore not "does a settled payment credit".
 * It is **the forgery case**: a body that authenticates correctly and then lies
 * about the amount, the merchant and the state must credit what IntaSend says,
 * not what the body says. That test fails against the previous implementation,
 * which is the only reason to trust this one.
 *
 * Everything below the challenge boundary is mocked — this exercises the
 * route's own verify-then-credit logic, not IntaSend and not the database.
 */

const fetchCollectionStatusMock = vi.fn();

vi.mock("@/lib/intasend", () => ({
  // The real constant-time comparison is exercised in intasend-guard.test.ts;
  // here the challenge is a boolean switch so the credit logic is what is under
  // test rather than the secret handling.
  verifyWebhookChallenge: (challenge: unknown) => challenge === "right-secret",
  fetchCollectionStatus: (...args: unknown[]) => fetchCollectionStatusMock(...args),
  INTASEND_SETTLED_STATE: "COMPLETE",
}));

const recordMerchantTransactionMock = vi.fn();
const logWebhookFailureMock = vi.fn();

vi.mock("@/lib/merchant-ledger", () => ({
  recordMerchantTransaction: (...args: unknown[]) => recordMerchantTransactionMock(...args),
  logWebhookFailure: (...args: unknown[]) => logWebhookFailureMock(...args),
}));

vi.mock("@/lib/notify-merchant", () => ({ notifyMerchant: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ captureTopupCompletedMpesa: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { node: "BBS Mall" } }) }),
      }),
    }),
  }),
}));

import { POST } from "../route";

const HONEST_MERCHANT = "11111111-1111-1111-1111-111111111111";
const ATTACKER_MERCHANT = "22222222-2222-2222-2222-222222222222";

const post = (body: unknown) =>
  POST(
    new Request("https://www.maanta.app/api/webhooks/intasend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

/** What IntaSend's own /payment/status/ reports, normalised by the lib. */
function settled(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    invoice: {
      invoiceId: "INV123",
      state: "COMPLETE",
      value: 500,
      currency: "KES",
      apiRef: `topup:${HONEST_MERCHANT}:9f1c`,
      failedReason: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  fetchCollectionStatusMock.mockReset();
  recordMerchantTransactionMock.mockReset();
  logWebhookFailureMock.mockReset();
  recordMerchantTransactionMock.mockResolvedValue({ applied: true });
  logWebhookFailureMock.mockResolvedValue(undefined);
  fetchCollectionStatusMock.mockResolvedValue(settled());
});

describe("the forgery this route exists to stop (D58)", () => {
  it("credits what IntaSend reports, not what an authenticated body claims", async () => {
    // A caller who knows the secret, lying about every field that moves money.
    const res = await post({
      challenge: "right-secret",
      invoice_id: "INV123",
      state: "COMPLETE",
      value: 1_000_000,
      api_ref: `topup:${ATTACKER_MERCHANT}:forged`,
    });

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).toHaveBeenCalledTimes(1);

    const entry = recordMerchantTransactionMock.mock.calls[0][1];
    // Both would be the attacker's values under the previous implementation.
    expect(entry.amount).toBe(500);
    expect(entry.merchantId).toBe(HONEST_MERCHANT);
  });

  it("credits nothing when the body says COMPLETE and IntaSend says PENDING", async () => {
    fetchCollectionStatusMock.mockResolvedValue(settled({ state: "PENDING" }));

    const res = await post({
      challenge: "right-secret",
      invoice_id: "INV123",
      state: "COMPLETE",
      value: 750,
      api_ref: `topup:${HONEST_MERCHANT}:9f1c`,
    });

    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("never reaches IntaSend, or the ledger, on a bad challenge", async () => {
    const res = await post({
      challenge: "wrong-secret",
      invoice_id: "INV123",
      state: "COMPLETE",
      value: 500,
    });

    expect(res.status).toBe(401);
    expect(fetchCollectionStatusMock).not.toHaveBeenCalled();
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("looks up the invoice the body names, and takes nothing else from it", async () => {
    await post({
      challenge: "right-secret",
      invoice_id: "INV123",
      value: 999,
      api_ref: `topup:${ATTACKER_MERCHANT}:forged`,
    });
    expect(fetchCollectionStatusMock).toHaveBeenCalledWith("INV123");
  });
});

describe("unknown truth is retried, known truth is not", () => {
  it("returns 500 so IntaSend redelivers when the status lookup fails", async () => {
    fetchCollectionStatusMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      detail: "status lookup returned HTTP 503",
    });

    const res = await post({
      challenge: "right-secret",
      invoice_id: "INV123",
      state: "COMPLETE",
      value: 500,
    });

    // 500, not 200: a real settled top-up must not be dropped because IntaSend
    // was briefly unreachable. Redelivery is safe — the ledger is idempotent.
    expect(res.status).toBe(500);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalledTimes(1);
  });

  it("returns 200 for an authoritative not-settled state, so delivery ends", async () => {
    fetchCollectionStatusMock.mockResolvedValue(settled({ state: "FAILED" }));
    const res = await post({ challenge: "right-secret", invoice_id: "INV123" });
    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("records a failure and credits nothing when the body carries no invoice_id", async () => {
    const res = await post({ challenge: "right-secret", value: 500 });
    expect(res.status).toBe(200);
    expect(fetchCollectionStatusMock).not.toHaveBeenCalled();
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalledTimes(1);
  });
});

describe("what a settled invoice must satisfy before it moves money", () => {
  it("refuses an api_ref this app did not issue", async () => {
    fetchCollectionStatusMock.mockResolvedValue(
      settled({ apiRef: "ISL_faa26ef9-eb08-4353-b125-ec6a8f022815" })
    );
    const res = await post({ challenge: "right-secret", invoice_id: "INV123" });
    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
    expect(logWebhookFailureMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a settled invoice in a currency this rail never initiates", async () => {
    fetchCollectionStatusMock.mockResolvedValue(settled({ currency: "USD" }));
    const res = await post({ challenge: "right-secret", invoice_id: "INV123" });
    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("refuses an amount above the top-up ceiling", async () => {
    fetchCollectionStatusMock.mockResolvedValue(settled({ value: 1_000_001 }));
    const res = await post({ challenge: "right-secret", invoice_id: "INV123" });
    expect(res.status).toBe(200);
    expect(recordMerchantTransactionMock).not.toHaveBeenCalled();
  });

  it("refuses a zero or unparseable amount", async () => {
    for (const value of [0, -5, null]) {
      recordMerchantTransactionMock.mockClear();
      fetchCollectionStatusMock.mockResolvedValue(settled({ value }));
      await post({ challenge: "right-secret", invoice_id: "INV123" });
      expect(recordMerchantTransactionMock, `value ${value}`).not.toHaveBeenCalled();
    }
  });

  it("keys the ledger entry on IntaSend's invoice id, so redelivery is a no-op", async () => {
    await post({ challenge: "right-secret", invoice_id: "INV123" });
    const entry = recordMerchantTransactionMock.mock.calls[0][1];
    expect(entry.providerReference).toBe("INV123");
    expect(entry.transactionType).toBe("topup");
    expect(entry.currency).toBe("KES");
  });
});
