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

  // Present-but-unusable used to count as configured, so the merchant was offered
  // a primary action the money path refuses — initiateMpesaStkPush throws on a
  // mismatched pair rather than returning null, so the rail could only break.
  it("is false when a live key is configured without INTASEND_ENV=live", async () => {
    delete process.env.INTASEND_ENV;
    process.env.INTASEND_API_KEY = "ISPubKey_live_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_live_abc";
    const { isMpesaTopupConfigured } = await freshIntasend();
    expect(isMpesaTopupConfigured()).toBe(false);
  });

  it("is false when a test key is configured with INTASEND_ENV=live", async () => {
    process.env.INTASEND_ENV = "live";
    process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_test_abc";
    const { isMpesaTopupConfigured } = await freshIntasend();
    expect(isMpesaTopupConfigured()).toBe(false);
  });

  it("is false for a self-inconsistent pair, whatever INTASEND_ENV says", async () => {
    for (const env of [undefined, "live"]) {
      if (env) process.env.INTASEND_ENV = env;
      else delete process.env.INTASEND_ENV;
      process.env.INTASEND_API_KEY = "ISPubKey_test_abc";
      process.env.INTASEND_SECRET = "ISSecretKey_live_abc";
      const { isMpesaTopupConfigured } = await freshIntasend();
      expect(isMpesaTopupConfigured(), `INTASEND_ENV=${env}`).toBe(false);
    }
  });

  it("still trusts an unmarked key pair, matching what the money path allows", async () => {
    // Neither _test_ nor _live_ in the key: assertKeyMatchesEnv permits it, so the
    // capability check must too. Parity is the property — a check stricter than the
    // money path hides a working rail, and a looser one offers a broken one.
    delete process.env.INTASEND_ENV;
    process.env.INTASEND_API_KEY = "ISPubKey_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_abc";
    const { isMpesaTopupConfigured } = await freshIntasend();
    expect(isMpesaTopupConfigured()).toBe(true);
  });

  it("warns once, so a hidden rail is diagnosable rather than silent", async () => {
    delete process.env.INTASEND_ENV;
    process.env.INTASEND_API_KEY = "ISPubKey_live_abc";
    process.env.INTASEND_SECRET = "ISSecretKey_live_abc";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { isMpesaTopupConfigured } = await freshIntasend();

    expect(isMpesaTopupConfigured()).toBe(false);
    expect(isMpesaTopupConfigured()).toBe(false);
    // A misconfiguration must not look identical to "no credentials"...
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/M-Pesa top-up is hidden/);
    // ...but it must not spam either: this runs on every render and every POST.
    warn.mockRestore();
  });
});

// The invariant behind the fix: the capability answer and the money path agree on
// every configuration. Either disagreement direction is a defect — false/allowed
// hides a working rail, true/refused offers a broken one.
describe("capability check and money path agree", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  const CONFIGS: [string, string | undefined, string, string][] = [
    ["test key, sandbox", undefined, "ISPubKey_test_a", "ISSecretKey_test_a"],
    ["live key, live", "live", "ISPubKey_live_a", "ISSecretKey_live_a"],
    ["live key, sandbox", undefined, "ISPubKey_live_a", "ISSecretKey_live_a"],
    ["test key, live", "live", "ISPubKey_test_a", "ISSecretKey_test_a"],
    ["mixed pair, sandbox", undefined, "ISPubKey_test_a", "ISSecretKey_live_a"],
    ["mixed pair, live", "live", "ISPubKey_live_a", "ISSecretKey_test_a"],
    ["unmarked keys", undefined, "ISPubKey_a", "ISSecretKey_a"],
  ];

  it.each(CONFIGS)("%s", async (_label, env, publicKey, secretKey) => {
    if (env) process.env.INTASEND_ENV = env;
    else delete process.env.INTASEND_ENV;
    process.env.INTASEND_API_KEY = publicKey;
    process.env.INTASEND_SECRET = secretKey;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invoice: { invoice_id: "inv_1", state: "PENDING" } }),
      } as Response)
    );

    const { isMpesaTopupConfigured, initiateMpesaStkPush } = await freshIntasend();
    const offered = isMpesaTopupConfigured();

    let refused = false;
    try {
      await initiateMpesaStkPush(stkParams);
    } catch {
      refused = true;
    }

    expect(
      offered,
      `offered=${offered} but the money path ${refused ? "refuses" : "accepts"} this config`
    ).toBe(!refused);
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
