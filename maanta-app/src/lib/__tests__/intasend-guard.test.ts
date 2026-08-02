import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// intasend.ts reads INTASEND_ENV at module load for the base URL, so tests
// import fresh copies per env configuration.
async function freshIntasend() {
  vi.resetModules();
  return await import("../intasend");
}

const stkParams = {
  amount: 500,
  phoneNumber: "+254712345678",
  apiRef: "topup:m-1:uuid",
  name: "Test Merchant",
  email: "merchant@example.com",
};

describe("initiateMpesaStkPush env guard", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.INTASEND_ENV;
    process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_test_abc";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  it("refuses a live key without INTASEND_ENV=live", async () => {
    process.env.INTASEND_API_KEY = "ISPubKey_live_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_live_abc";
    const { initiateMpesaStkPush } = await freshIntasend();
    await expect(initiateMpesaStkPush(stkParams)).rejects.toThrow(
      /Refusing to run/
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a test key when INTASEND_ENV=live", async () => {
    process.env.INTASEND_ENV = "live";
    const { initiateMpesaStkPush } = await freshIntasend();
    await expect(initiateMpesaStkPush(stkParams)).rejects.toThrow(
      /test IntaSend key/
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proceeds with a matching test key against the sandbox URL", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        invoice: { invoice_id: "inv_123", state: "PENDING" },
      }),
    } as Response);

    const { initiateMpesaStkPush } = await freshIntasend();
    const result = await initiateMpesaStkPush(stkParams);

    expect(result).toEqual({ invoiceId: "inv_123", state: "PENDING" });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("sandbox.intasend.com");
  });
});

describe("verifyWebhookChallenge", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("accepts the configured secret and rejects everything else", async () => {
    process.env.INTASEND_WEBHOOK_SECRET = "s3cret-value";
    const { verifyWebhookChallenge } = await freshIntasend();

    expect(verifyWebhookChallenge("s3cret-value")).toBe(true);
    expect(verifyWebhookChallenge("s3cret-valuf")).toBe(false);
    // A prefix must not pass: hashing before comparing is what makes the
    // length-mismatch case safe to handle at all.
    expect(verifyWebhookChallenge("s3cret")).toBe(false);
    expect(verifyWebhookChallenge("s3cret-value-and-more")).toBe(false);
  });

  it("rejects non-strings and an unset secret rather than throwing", async () => {
    process.env.INTASEND_WEBHOOK_SECRET = "s3cret-value";
    const { verifyWebhookChallenge } = await freshIntasend();
    for (const bad of [undefined, null, 42, {}, [], true]) {
      expect(verifyWebhookChallenge(bad)).toBe(false);
    }

    // No secret configured must never mean "everything authenticates".
    delete process.env.INTASEND_WEBHOOK_SECRET;
    const fresh = await freshIntasend();
    expect(fresh.verifyWebhookChallenge("anything")).toBe(false);
    expect(fresh.verifyWebhookChallenge(undefined)).toBe(false);
  });
});

describe("fetchCollectionStatus", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.INTASEND_ENV;
    process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_test_abc";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  /** IntaSend's documented /payment/status/ response shape. */
  // `text()`, not `json()`: the implementation reads the body as text inside the
  // same try/catch as the fetch, so that an abort part-way through reading
  // resolves to `unavailable` (retry) rather than `unexpected_shape` (give up).
  const statusBody = (invoice: Record<string, unknown>) => ({
    ok: true,
    text: async () => JSON.stringify({ invoice, meta: {} }),
  }) as Response;

  it("posts the invoice id to /payment/status/ on the matching environment", async () => {
    vi.mocked(fetch).mockResolvedValue(
      statusBody({ invoice_id: "XMSLWOS", state: "COMPLETE", value: "10.36", currency: "KES" })
    );

    const { fetchCollectionStatus } = await freshIntasend();
    await fetchCollectionStatus("XMSLWOS");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("https://sandbox.intasend.com/api/v1/payment/status/");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      invoice_id: "XMSLWOS",
      public_key: "ISPubKey_test_abc",
    });
  });

  it("normalises the invoice, coercing IntaSend's string amounts to numbers", async () => {
    vi.mocked(fetch).mockResolvedValue(
      statusBody({
        invoice_id: "XMSLWOS",
        state: "COMPLETE",
        value: "10.36",
        currency: "KES",
        api_ref: "topup:11111111-1111-1111-1111-111111111111:9f1c",
        failed_reason: null,
      })
    );

    const { fetchCollectionStatus } = await freshIntasend();
    const result = await fetchCollectionStatus("XMSLWOS");

    expect(result).toEqual({
      ok: true,
      invoice: {
        invoiceId: "XMSLWOS",
        state: "COMPLETE",
        value: 10.36,
        currency: "KES",
        apiRef: "topup:11111111-1111-1111-1111-111111111111:9f1c",
        failedReason: null,
      },
    });
  });

  it("reports `unavailable` — never a state — when IntaSend cannot be reached", async () => {
    // Each of these must be distinguishable from "not settled", because the
    // caller retries on unavailable and stops on a known state.
    const { fetchCollectionStatus } = await freshIntasend();

    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await fetchCollectionStatus("X")).toMatchObject({ ok: false, reason: "unavailable" });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "upstream down",
    } as Response);
    expect(await fetchCollectionStatus("X")).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("bounds the lookup with a timeout, and covers the body read too", async () => {
    // The webhook blocks on this call, so an unbounded request stalls the
    // handler until the platform kills it — a dropped top-up. Raised in review.
    vi.mocked(fetch).mockResolvedValue(
      statusBody({ invoice_id: "X", state: "COMPLETE", currency: "KES", value: 1 })
    );
    const { fetchCollectionStatus } = await freshIntasend();
    await fetchCollectionStatus("X");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal, "the status lookup must carry an abort signal").toBeInstanceOf(
      AbortSignal
    );

    // An abort while reading the body must read as unavailable (retry), not as
    // unexpected_shape (give up) — nothing is malformed, it just did not arrive.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      },
    } as unknown as Response);
    expect(await fetchCollectionStatus("X")).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
  });

  it("treats a missing key as unavailable, so a real payment is retried not dropped", async () => {
    delete process.env.INTASEND_SECRET;
    const { fetchCollectionStatus } = await freshIntasend();
    expect(await fetchCollectionStatus("X")).toMatchObject({ ok: false, reason: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats a live/test key mismatch as unavailable rather than throwing into the webhook", async () => {
    process.env.INTASEND_SECRET = "ISSecretKey_live_abc";
    process.env.INTASEND_API_KEY = "ISPubKey_live_abc";
    const { fetchCollectionStatus } = await freshIntasend();
    // assertKeyMatchesEnv throws; the webhook must get a result, not an
    // exception, so the failure is logged and redelivery is requested.
    expect(await fetchCollectionStatus("X")).toMatchObject({ ok: false, reason: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to invent a state when the response shape is wrong", async () => {
    const { fetchCollectionStatus } = await freshIntasend();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ meta: {} }),
    } as Response);
    expect(await fetchCollectionStatus("X")).toMatchObject({
      ok: false,
      reason: "unexpected_shape",
    });

    // Non-JSON is a shape problem, not a reachability problem.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => "<html>gateway</html>",
    } as Response);
    expect(await fetchCollectionStatus("X")).toMatchObject({
      ok: false,
      reason: "unexpected_shape",
    });

    vi.mocked(fetch).mockResolvedValueOnce(statusBody({ invoice_id: "X" }));
    expect(await fetchCollectionStatus("X")).toMatchObject({
      ok: false,
      reason: "unexpected_shape",
    });
  });

  /**
   * The returned id becomes the ledger's `provider_reference`, and that
   * uniqueness constraint is the only thing preventing a double credit on a
   * redelivered webhook. So these are money-path assertions, not shape pedantry.
   */
  describe("pins the returned invoice id to the one that was asked about", () => {
    it("rejects a blank id rather than making it the ledger key", async () => {
      const { fetchCollectionStatus } = await freshIntasend();
      // `""` is a string, so a `typeof === "string"` check accepts it. That is
      // how a blank idempotency key would have reached the ledger.
      vi.mocked(fetch).mockResolvedValueOnce(
        statusBody({ invoice_id: "", state: "COMPLETE", value: 500, currency: "KES" })
      );
      expect(await fetchCollectionStatus("XMSLWOS")).toMatchObject({
        ok: false,
        reason: "unexpected_shape",
      });
    });

    it("rejects an id for a different invoice", async () => {
      const { fetchCollectionStatus } = await freshIntasend();
      // Crediting under a reference this app never looked up means the replayed
      // webhook keys differently — the double credit the constraint exists to stop.
      vi.mocked(fetch).mockResolvedValueOnce(
        statusBody({ invoice_id: "SOMEONE_ELSE", state: "COMPLETE", value: 500, currency: "KES" })
      );
      const result = await fetchCollectionStatus("XMSLWOS");
      expect(result).toMatchObject({ ok: false, reason: "unexpected_shape" });
      // `unexpected_shape`, not `unavailable`: the provider answered and the
      // answer is wrong, so an identical retry would only reproduce it.
      expect(result.ok).toBe(false);
    });

    it("accepts a matching id, and falls back to the requested one when absent", async () => {
      const { fetchCollectionStatus } = await freshIntasend();

      vi.mocked(fetch).mockResolvedValueOnce(
        statusBody({ invoice_id: "XMSLWOS", state: "COMPLETE", value: 500, currency: "KES" })
      );
      expect(await fetchCollectionStatus("XMSLWOS")).toMatchObject({
        ok: true,
        invoice: { invoiceId: "XMSLWOS" },
      });

      // Neither id field present: nothing contradicts the request, so the
      // requested id is the right key and the lookup still succeeds.
      vi.mocked(fetch).mockResolvedValueOnce(
        statusBody({ state: "COMPLETE", value: 500, currency: "KES" })
      );
      expect(await fetchCollectionStatus("XMSLWOS")).toMatchObject({
        ok: true,
        invoice: { invoiceId: "XMSLWOS" },
      });
    });

    // The implementation reads `invoice_id` first and falls back to `id`, so
    // there are two ways a wrong id arrives and the cases above only exercised
    // one. Raised in review as the last untested branch of the function that
    // guards against a duplicate wallet credit — which is exactly where an
    // untested branch is least acceptable.
    it("rejects a mismatched id arriving through the `id` fallback field", async () => {
      const { fetchCollectionStatus } = await freshIntasend();
      vi.mocked(fetch).mockResolvedValueOnce(
        statusBody({ id: "SOMEONE_ELSE", state: "COMPLETE", value: 500, currency: "KES" })
      );
      expect(await fetchCollectionStatus("XMSLWOS")).toMatchObject({
        ok: false,
        reason: "unexpected_shape",
      });
    });

    it("rejects a blank id arriving through the `id` fallback field", async () => {
      const { fetchCollectionStatus } = await freshIntasend();
      vi.mocked(fetch).mockResolvedValueOnce(
        statusBody({ id: "", state: "COMPLETE", value: 500, currency: "KES" })
      );
      expect(await fetchCollectionStatus("XMSLWOS")).toMatchObject({
        ok: false,
        reason: "unexpected_shape",
      });
    });
  });
});

describe("isIntasendConfigured", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("is false when either key is missing", async () => {
    delete process.env.INTASEND_API_KEY;
    delete process.env.INTASEND_SECRET;
    const { isIntasendConfigured } = await freshIntasend();
    expect(isIntasendConfigured()).toBe(false);
  });

  it("is true when both keys are present", async () => {
    process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_test_abc";
    const { isIntasendConfigured } = await freshIntasend();
    expect(isIntasendConfigured()).toBe(true);
  });
});
