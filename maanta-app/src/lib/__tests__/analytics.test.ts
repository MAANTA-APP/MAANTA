import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsEnabled,
  captureGuardianOutcome,
  captureServerEvent,
} from "@/lib/analytics";

// These tests pin the two guarantees the verify (counter) path relies on:
//   1. With no POSTHOG_PROJECT_KEY, capture is a hard no-op (no network, no
//      throw) — dev / CI / tests never emit.
//   2. When configured, it POSTs the right event to PostHog's capture endpoint
//      and NEVER rejects, even when the network fails — analytics can't break
//      or delay a redemption.
//   3. The capture is registered with the platform's waitUntil, so the ping is
//      not lost when a serverless instance freezes after sending the response.
//      This is the regression the events themselves proved: server events were
//      being dropped whenever a request did not happen to be followed by
//      another one on the same instance.

const KEY = "POSTHOG_PROJECT_KEY";
const HOST = "POSTHOG_HOST";
const VERCEL = "VERCEL";
const DEMO = "MAANTA_DEMO_MODE";

describe("analytics", () => {
  const orig = {
    key: process.env[KEY],
    host: process.env[HOST],
    vercel: process.env[VERCEL],
    demo: process.env[DEMO],
  };

  beforeEach(() => {
    delete process.env[KEY];
    delete process.env[HOST];
    delete process.env[VERCEL];
    delete process.env[DEMO];
  });
  afterEach(() => {
    // Restore by deleting when it was unset: `process.env.X = undefined` stores
    // the *string* "undefined", which is truthy — and VERCEL being truthy makes
    // the capture warn about a missing request context.
    restoreEnv(KEY, orig.key);
    restoreEnv(HOST, orig.host);
    restoreEnv(VERCEL, orig.vercel);
    restoreEnv(DEMO, orig.demo);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  it("is disabled and no-ops when no project key is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(analyticsEnabled()).toBe(false);
    await captureServerEvent("guardian_outcome", "m1", { recommendation: "clear" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a well-formed event to the capture endpoint when configured", async () => {
    process.env[KEY] = "phc_test";
    process.env[HOST] = "https://eu.i.posthog.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(analyticsEnabled()).toBe(true);
    await captureGuardianOutcome({
      merchantId: "m1",
      redemptionId: "r1",
      dealId: "d1",
      recommendation: "hard_block",
      severity: "block",
      redemptionStatus: "blocked",
      feeChargeStatus: null,
      disputed: true,
      node: "BBS Mall",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu.i.posthog.com/capture/");
    const body = JSON.parse(String(opts.body));
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("guardian_outcome");
    expect(body.distinct_id).toBe("m1");
    expect(body.properties.recommendation).toBe("hard_block");
    expect(body.properties.redemption_status).toBe("blocked");
    expect(body.properties.node).toBe("BBS Mall");
  });

  it("defaults node to BBS Mall when omitted, and honors an explicit node", async () => {
    process.env[KEY] = "phc_test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await captureGuardianOutcome({
      merchantId: "m1",
      redemptionId: "r1",
      dealId: "d1",
      recommendation: "clear",
      severity: "info",
      redemptionStatus: "success",
      feeChargeStatus: "charged",
      disputed: false,
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).properties.node).toBe(
      "BBS Mall"
    );

    await captureGuardianOutcome({
      merchantId: "m1",
      redemptionId: "r2",
      dealId: "d1",
      recommendation: "clear",
      severity: "info",
      redemptionStatus: "success",
      feeChargeStatus: "charged",
      disputed: false,
      node: "Two Rivers Mall",
    });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).properties.node).toBe(
      "Two Rivers Mall"
    );
  });

  it("trims a trailing slash on the host", async () => {
    process.env[KEY] = "phc_test";
    process.env[HOST] = "https://ph.example.com/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await captureServerEvent("guardian_outcome", "m1");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://ph.example.com/capture/");
  });

  it("never rejects when the network call fails", async () => {
    process.env[KEY] = "phc_test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(captureServerEvent("guardian_outcome", "m1")).resolves.toBeUndefined();
  });


  describe("delivery on a freezable instance", () => {
    // Exercised by planting the real request context the code reads, not by
    // mocking an internal helper — the thing worth pinning is the integration
    // with the platform primitive, since that going quiet is what dropped the
    // events in the first place.
    const REQ_CONTEXT = Symbol.for("@vercel/request-context");

    /** Stand in for Vercel's per-invocation context. */
    function stubRequestContext() {
      const waitUntil = vi.fn();
      vi.stubGlobal(REQ_CONTEXT, { get: () => ({ waitUntil }) });
      return waitUntil;
    }

    it("registers the capture with waitUntil so a frozen instance cannot drop it", async () => {
      process.env[KEY] = "phc_test";
      const waitUntil = stubRequestContext();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      await captureServerEvent("deal_viewed", "anonymous", { deal_id: "d1" });

      expect(waitUntil).toHaveBeenCalledOnce();
      const registered = waitUntil.mock.calls[0][0] as Promise<void>;
      expect(typeof registered?.then).toBe("function");
    });

    it("registers while the ping is still in flight, not after it lands", async () => {
      // The whole point: registration has to happen before the response is sent,
      // otherwise there is nothing left alive to register. A capture that only
      // called waitUntil after awaiting its own fetch would pass every other
      // test here and still drop events in production.
      process.env[KEY] = "phc_test";
      const waitUntil = stubRequestContext();
      let settle: (() => void) | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockReturnValue(
          new Promise<{ ok: boolean }>((resolve) => {
            settle = () => resolve({ ok: true });
          })
        )
      );

      const pending = captureServerEvent("deal_viewed", "anonymous");
      await Promise.resolve(); // drain microtasks; the fetch is still unresolved

      expect(waitUntil).toHaveBeenCalledOnce();

      settle?.();
      await expect(pending).resolves.toBeUndefined();
    });

    it("hands waitUntil a promise that resolves even when the ping fails", async () => {
      // A rejected promise passed to waitUntil becomes an unhandled rejection in
      // the platform instead of a swallowed metrics error, so the promise has to
      // be neutralised before it is registered.
      process.env[KEY] = "phc_test";
      const waitUntil = stubRequestContext();
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      await captureServerEvent("deal_viewed", "anonymous");

      await expect(waitUntil.mock.calls[0][0] as Promise<void>).resolves.toBeUndefined();
    });

    it("does not register anything, or throw, when the key is absent", async () => {
      const waitUntil = stubRequestContext();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(captureServerEvent("deal_viewed", "anonymous")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(waitUntil).not.toHaveBeenCalled();
    });

    it("still delivers with no request context at all (dev, CI, another host)", async () => {
      process.env[KEY] = "phc_test";
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await expect(captureServerEvent("deal_viewed", "anonymous")).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("survives a request context whose shape has changed", async () => {
      // If the platform primitive is ever replaced, the capture must degrade to
      // the old best-effort behaviour, never throw into the caller.
      process.env[KEY] = "phc_test";
      vi.stubGlobal(REQ_CONTEXT, {
        get: () => {
          throw new Error("contract changed");
        },
      });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await expect(captureServerEvent("deal_viewed", "anonymous")).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    // The warning is suppressed after the first time per cold start, so these two
    // load a fresh copy of the module rather than sharing the file-level import —
    // otherwise the assertions would depend on test ordering.
    async function freshCapture() {
      vi.resetModules();
      return (await import("@/lib/analytics")).captureServerEvent;
    }

    it("warns when running on Vercel with no request context", async () => {
      // The bug was invisible from inside the process. On Vercel a missing
      // context means events are being dropped, so it has to be audible.
      process.env[KEY] = "phc_test";
      process.env[VERCEL] = "1";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      const capture = await freshCapture();

      await capture("deal_viewed", "anonymous");
      await capture("deal_viewed", "anonymous");

      // Twice through the drop path, one warning — loud, not spammy.
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain("no Vercel request context");
    });

    it("stays silent when the context is present", async () => {
      process.env[KEY] = "phc_test";
      process.env[VERCEL] = "1";
      stubRequestContext();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      const capture = await freshCapture();

      await capture("deal_viewed", "anonymous");

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
