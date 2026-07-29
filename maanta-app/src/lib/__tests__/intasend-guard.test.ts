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

describe("isMpesaTopupConfigured", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("is false with no IntaSend credentials — the default deployment", async () => {
    delete process.env.INTASEND_API_KEY;
    delete process.env.INTASEND_SECRET;
    const { isMpesaTopupConfigured } = await freshIntasend();
    expect(isMpesaTopupConfigured()).toBe(false);
  });

  it("is false when only one of the two keys is set", async () => {
    process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
    delete process.env.INTASEND_SECRET;
    const { isMpesaTopupConfigured } = await freshIntasend();
    expect(isMpesaTopupConfigured()).toBe(false);
  });

  it("is true only once both keys exist", async () => {
    process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_test_abc";
    const { isMpesaTopupConfigured } = await freshIntasend();
    expect(isMpesaTopupConfigured()).toBe(true);
  });
});

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
