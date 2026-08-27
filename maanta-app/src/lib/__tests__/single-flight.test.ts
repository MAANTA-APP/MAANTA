import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSingleFlight } from "../single-flight";
import { stripComments } from "./helpers/comment-stripping";

/**
 * The till's double-tap guard (G5), driven the way a counter drives it.
 *
 * The defect this prevents is not a double charge — the server already
 * refuses that — it is a SUCCESS BEING OVERWRITTEN: the duplicate call's
 * late 409 landing after the success screen and telling staff a completed
 * redemption was "already redeemed".
 */

describe("createSingleFlight", () => {
  it("lets the first caller through and turns the second away", () => {
    const gate = createSingleFlight();
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    expect(gate.begin()).toBe(false);
  });

  it("flips synchronously — a same-frame double tap cannot both proceed", () => {
    const gate = createSingleFlight();
    // No await between them: exactly the racing pair a touch screen produces.
    const results = [gate.begin(), gate.begin()];
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("reopens after end(), so a failed attempt can be retried", () => {
    const gate = createSingleFlight();
    expect(gate.begin()).toBe(true);
    gate.end();
    expect(gate.begin()).toBe(true);
  });

  it("reports busy state without changing it", () => {
    const gate = createSingleFlight();
    expect(gate.busy).toBe(false);
    gate.begin();
    expect(gate.busy).toBe(true);
    expect(gate.busy).toBe(true);
    gate.end();
    expect(gate.busy).toBe(false);
  });

  it("end() on an idle gate is harmless", () => {
    const gate = createSingleFlight();
    gate.end();
    expect(gate.begin()).toBe(true);
  });
});

describe("the counter's confirm sequence", () => {
  /** A verify call that succeeds, modelling the real POST. */
  function makeCounter() {
    const calls: string[] = [];
    const gate = createSingleFlight();
    let screen = "disclose";
    async function confirm(outcome: "success" | "409" | "network") {
      if (!gate.begin()) return "blocked";
      screen = "verifying";
      calls.push(outcome);
      await Promise.resolve();
      if (outcome === "success") {
        screen = "success"; // gate deliberately stays raised until reset()
        return "ok";
      }
      gate.end();
      screen = "rejected";
      return "rejected";
    }
    return {
      confirm,
      reset: () => {
        gate.end();
        screen = "keypad";
      },
      get calls() {
        return calls;
      },
      get screen() {
        return screen;
      },
    };
  }

  it("sends exactly ONE verification for a rapid double tap", async () => {
    const till = makeCounter();
    const both = await Promise.all([till.confirm("success"), till.confirm("success")]);
    expect(till.calls).toHaveLength(1);
    expect(both).toContain("ok");
    expect(both).toContain("blocked");
  });

  it("a duplicate tap cannot overwrite a success with 'already redeemed'", async () => {
    const till = makeCounter();
    await till.confirm("success");
    expect(till.screen).toBe("success");
    // The second tap, had it gone through, would have returned 409 and
    // replaced the success screen. It never runs.
    const second = await till.confirm("409");
    expect(second).toBe("blocked");
    expect(till.screen).toBe("success");
    expect(till.calls).toEqual(["success"]);
  });

  it("holds the gate through the success screen until the auto-skip reset", async () => {
    const till = makeCounter();
    await till.confirm("success");
    expect(await till.confirm("success")).toBe("blocked");
    till.reset();
    expect(await till.confirm("success")).toBe("ok");
  });

  it("releases on a rejection so staff can retry immediately", async () => {
    const till = makeCounter();
    expect(await till.confirm("409")).toBe("rejected");
    expect(await till.confirm("success")).toBe("ok");
    expect(till.calls).toEqual(["409", "success"]);
  });

  it("releases on a network error so a retry is possible", async () => {
    const till = makeCounter();
    expect(await till.confirm("network")).toBe("rejected");
    expect(await till.confirm("success")).toBe("ok");
  });
});

/**
 * Source ratchets: the guard only helps if the keypad actually uses it, and
 * the money path must stay server-authoritative.
 */
describe("the keypad wires the guard in", () => {
  const keypad = stripComments(
    readFileSync(
      join(process.cwd(), "src/app/merchant/(app)/redeem/redeem-keypad.tsx"),
      "utf8"
    )
  );

  it("gates confirmRedemption on the single-flight begin()", () => {
    expect(keypad).toMatch(/async function confirmRedemption[\s\S]{0,200}flight\.current\.begin\(\)/);
  });

  it("still resolves before charging — preflight then verify, never verify alone", () => {
    expect(keypad).toContain("/api/redemptions/preflight");
    expect(keypad).toContain("/api/redemptions/verify");
  });

  it("keeps the manual keypad path: 6 digits still auto-resolve", () => {
    expect(keypad).toMatch(/code\.length === 6[\s\S]{0,120}resolveCode\(code\)/);
  });

  it("still receives tapped queue codes in memory, never from the URL", () => {
    expect(keypad).toContain("subscribeQueueCode");
    expect(keypad).not.toMatch(/redeem\?code=/);
    expect(keypad).not.toContain("useSearchParams");
  });

  it("never disables Confirm on wallet state (verify-anyway stays)", () => {
    // The single amber action is always Confirm; an underfunded fee becomes
    // disclosed arrears rather than a blocked counter.
    expect(keypad).not.toMatch(/disabled=\{[^}]*insufficient/);
  });
});
