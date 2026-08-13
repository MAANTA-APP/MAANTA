import { describe, expect, it } from "vitest";
import {
  CLAIM_UNCONFIRMED_MESSAGE,
  claimTransportFailure,
  interpretClaimResponse,
} from "@/lib/claim-response";

/**
 * Client-side reading of a claim response (P0, 2026-08-14).
 *
 * The incident this locks: `await res.json()` ran before `res.ok` was checked
 * and inside the same `try` as the `fetch`, so a non-JSON error response threw
 * a parse error into a `catch` that reported "Network error — please try
 * again." for a claim that had, on the leading hypothesis, already committed.
 *
 * The dangerous part was never the wording. It was that the wording invited a
 * retry. So these tests assert two separable things: that a structured backend
 * error still reaches the shopper verbatim, and that every case where the
 * outcome is genuinely unknown says so and points at My Deals first.
 *
 * `Response` is the platform class here, not a mock — the failure mode was in
 * how a real response body behaves, and a stub that always parses cleanly would
 * have passed against the old code too.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const raw = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/html" } });

describe("interpretClaimResponse — success", () => {
  it("returns the redemption id from a 200", async () => {
    const outcome = await interpretClaimResponse(
      json({ redemptionId: "red-1", expiresAt: "2026-08-14T12:00:00Z" })
    );
    expect(outcome).toEqual({ kind: "success", redemptionId: "red-1" });
  });

  it("treats a 200 with no redemption id as unconfirmed, not success", async () => {
    // There is nothing to navigate to, and the claim's real state is unknown.
    // Guessing "it worked" here would strand the shopper on a dead route.
    const outcome = await interpretClaimResponse(json({ ok: true }));
    expect(outcome).toEqual({ kind: "error", message: CLAIM_UNCONFIRMED_MESSAGE });
  });
});

describe("interpretClaimResponse — structured backend errors are preserved", () => {
  it.each([
    ["deal_paused", 409, "This deal is paused — no new claims right now."],
    ["deal_not_active", 410, "This deal isn't running right now."],
    ["deal_expired", 410, "This deal has expired."],
    ["deal_claim_limit_reached", 410, "This deal is fully claimed."],
    [
      "active_claim_already_exists",
      409,
      "You already have an active claim on this deal.",
    ],
    ["deal_not_found", 404, "This deal is no longer available."],
    ["rate_limited", 429, "Too many claim attempts — wait a moment and try again."],
  ])("%s → the server's own message, never the fallback", async (_c, status, message) => {
    const outcome = await interpretClaimResponse(json({ error: message }, status));
    expect(outcome).toEqual({ kind: "error", message });
    expect(outcome).not.toEqual(
      expect.objectContaining({ message: CLAIM_UNCONFIRMED_MESSAGE })
    );
  });

  it("routes phone_required to the phone step rather than showing text", async () => {
    const outcome = await interpretClaimResponse(
      json({ error: "Add a phone number to claim this deal.", code: "phone_required" }, 403)
    );
    expect(outcome).toEqual({ kind: "redirect", to: "phone" });
  });

  it("routes sign_in_required to login", async () => {
    const outcome = await interpretClaimResponse(
      json({ error: "Your session has expired — sign in again to claim.", code: "sign_in_required" }, 401)
    );
    expect(outcome).toEqual({ kind: "redirect", to: "login" });
  });
});

describe("interpretClaimResponse — non-JSON failures (the incident)", () => {
  it.each([
    ["platform 500 HTML", raw("<!DOCTYPE html><h1>Internal Server Error</h1>", 500)],
    ["gateway 504 HTML", raw("<html>timeout</html>", 504)],
    ["empty body", new Response(null, { status: 502 })],
    ["truncated JSON", raw('{"error":', 500)],
  ])("%s does not throw, and asks the shopper to check My Deals", async (_label, res) => {
    const outcome = await interpretClaimResponse(res);
    expect(outcome).toEqual({ kind: "error", message: CLAIM_UNCONFIRMED_MESSAGE });
  });

  it("never tells the shopper it was a network problem", async () => {
    const outcome = await interpretClaimResponse(raw("<html>timeout</html>", 504));
    // The old copy is the bug: a 504 means the request arrived, and on the
    // leading hypothesis the claim committed before the response was lost.
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.message).not.toMatch(/network/i);
      expect(outcome.message).toMatch(/check my deals/i);
    }
  });

  it("falls back when a JSON error body carries no usable message", async () => {
    const outcome = await interpretClaimResponse(json({ code: "weird" }, 500));
    expect(outcome).toEqual({ kind: "error", message: CLAIM_UNCONFIRMED_MESSAGE });
  });
});

describe("claimTransportFailure", () => {
  it("uses the same check-first instruction as a lost response", async () => {
    // A rejected fetch cannot tell us whether the server saw the request, so
    // the shopper's correct next action is identical: look, then decide.
    expect(claimTransportFailure()).toEqual({
      kind: "error",
      message: CLAIM_UNCONFIRMED_MESSAGE,
    });
    expect(CLAIM_UNCONFIRMED_MESSAGE).not.toMatch(/network/i);
  });
});
