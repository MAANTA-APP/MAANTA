import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEnabled, captureGuardianOutcome, captureServerEvent } from "@/lib/analytics";

// These tests pin the two guarantees the verify (counter) path relies on:
//   1. With no POSTHOG_PROJECT_KEY, capture is a hard no-op (no network, no
//      throw) — dev / CI / tests never emit.
//   2. When configured, it POSTs the right event to PostHog's capture endpoint
//      and NEVER rejects, even when the network fails — analytics can't break
//      or delay a redemption.

const KEY = "POSTHOG_PROJECT_KEY";
const HOST = "POSTHOG_HOST";

describe("analytics", () => {
  const orig = { key: process.env[KEY], host: process.env[HOST] };

  beforeEach(() => {
    delete process.env[KEY];
    delete process.env[HOST];
  });
  afterEach(() => {
    process.env[KEY] = orig.key;
    process.env[HOST] = orig.host;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
});
