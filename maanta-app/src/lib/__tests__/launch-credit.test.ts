import { beforeEach, describe, expect, it, vi } from "vitest";

// The Node 0 opening credit is a live, config-gated promise. /for-merchants used
// to hardcode the amount (KES 300) and the cap (100 merchants), so the public
// page kept advertising the promo after ops changed the numbers, after the launch
// window closed, and after the cap filled. These tests pin the two properties
// that matter: the rule mirrors the SQL gate in `activate_merchant`, and every
// failure mode resolves to "show nothing" rather than "promise something".

import {
  creditedRedemptions,
  getLaunchCreditOffer,
  launchCreditOffer,
  type LaunchCreditConfig,
} from "@/lib/launch-credit";

const NOW = new Date("2026-07-30T09:00:00Z");

const config = (over: Partial<LaunchCreditConfig> = {}): LaunchCreditConfig => ({
  amountKes: 300,
  merchantCap: 100,
  launchNode: "BBS Mall",
  windowEndsAt: "2026-12-15T00:00:00Z",
  ...over,
});

describe("launchCreditOffer — mirrors the activate_merchant gate", () => {
  it("is live inside the window, under the cap, with a positive amount", () => {
    expect(launchCreditOffer(config(), 42, NOW)).toEqual({
      live: true,
      amountKes: 300,
      merchantCap: 100,
      launchNode: "BBS Mall",
      windowEndsAt: "2026-12-15T00:00:00Z",
    });
  });

  it.each([
    ["zero disables the promo", 0],
    ["a negative amount disables it", -50],
  ])("%s", (_label, amountKes) => {
    expect(launchCreditOffer(config({ amountKes }), 0, NOW)).toEqual({
      live: false,
      reason: "disabled",
    });
  });

  it("treats a missing amount as disabled, not as a default", () => {
    // The SQL COALESCEs a missing amount to 0, so no credit is granted. The page
    // must not fall back to the frozen 300 and advertise a credit nobody gets.
    expect(launchCreditOffer(config({ amountKes: null }), 0, NOW)).toEqual({
      live: false,
      reason: "disabled",
    });
  });

  it("stops advertising once the launch window has closed", () => {
    const after = new Date("2026-12-15T00:00:01Z");
    expect(launchCreditOffer(config(), 0, after)).toEqual({
      live: false,
      reason: "window-closed",
    });
  });

  it("closes exactly at the boundary, matching NOW() < v_launch_end", () => {
    const at = new Date("2026-12-15T00:00:00Z");
    expect(launchCreditOffer(config(), 0, at)).toEqual({
      live: false,
      reason: "window-closed",
    });
    const justBefore = new Date("2026-12-14T23:59:59Z");
    expect(launchCreditOffer(config(), 0, justBefore).live).toBe(true);
  });

  it("never advertises indefinitely on an unparseable window", () => {
    expect(launchCreditOffer(config({ windowEndsAt: "not-a-date" }), 0, NOW)).toEqual({
      live: false,
      reason: "unavailable",
    });
  });

  it("treats an absent window as open-ended, as the SQL does", () => {
    const offer = launchCreditOffer(config({ windowEndsAt: null }), 0, NOW);
    expect(offer.live).toBe(true);
  });

  it("stops advertising once the merchant cap is filled", () => {
    expect(launchCreditOffer(config(), 100, NOW)).toEqual({
      live: false,
      reason: "cap-filled",
    });
    // And stays closed if the count somehow exceeds the cap.
    expect(launchCreditOffer(config(), 137, NOW).live).toBe(false);
  });

  it("is still live on the last slot", () => {
    expect(launchCreditOffer(config(), 99, NOW).live).toBe(true);
  });

  it("treats a null cap as uncapped, however many have been credited", () => {
    const offer = launchCreditOffer(config({ merchantCap: null }), 5_000, NOW);
    expect(offer).toMatchObject({ live: true, merchantCap: null });
  });

  it("defaults a missing launch node to BBS Mall, matching the SQL COALESCE", () => {
    const offer = launchCreditOffer(config({ launchNode: null }), 0, NOW);
    expect(offer).toMatchObject({ live: true, launchNode: "BBS Mall" });
  });

  it("carries a renamed launch node through to the copy", () => {
    const offer = launchCreditOffer(config({ launchNode: "CBD Galleria" }), 0, NOW);
    expect(offer).toMatchObject({ live: true, launchNode: "CBD Galleria" });
  });
});

describe("creditedRedemptions", () => {
  it("floors the frozen case: KES 300 credit at a KES 30 fee covers 10", () => {
    expect(creditedRedemptions(300, 30)).toBe(10);
  });

  it("floors a partial redemption away", () => {
    expect(creditedRedemptions(100, 30)).toBe(3);
  });

  it("returns 0 when the credit cannot cover a single redemption", () => {
    // The page must not headline "your first 0 are on us".
    expect(creditedRedemptions(20, 30)).toBe(0);
  });

  it.each([
    ["a zero fee", 300, 0],
    ["a negative fee", 300, -30],
    ["a zero credit", 0, 30],
    ["a non-finite credit", Number.NaN, 30],
  ])("returns 0 for %s", (_label, amount, fee) => {
    expect(creditedRedemptions(amount, fee)).toBe(0);
  });
});

// ---- The server read: every failure path must fail CLOSED ----

type ConfigRow = { key: string; value: string };

let configRows: ConfigRow[] = [];
let configError: unknown = null;
let creditedCount: number | null = 0;
let countError: unknown = null;
let throwOnClient = false;

/** Every call made on the count query, so the node scoping can be asserted. */
let countCalls: { method: string; args: unknown[] }[] = [];

function stubQuery(result: unknown, record = false) {
  const q: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) =>
            Promise.resolve(result).then(resolve);
        }
        return (...args: unknown[]) => {
          if (record) countCalls.push({ method: String(prop), args });
          return q;
        };
      },
    }
  );
  return q;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    if (throwOnClient) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    return {
      from: (table: string) =>
        table === "app_config"
          ? stubQuery({ data: configRows, error: configError })
          : stubQuery({ count: creditedCount, error: countError }, true),
    };
  },
}));

describe("getLaunchCreditOffer — fails closed", () => {
  beforeEach(() => {
    configRows = [
      { key: "node0_opening_credit_kes", value: "300" },
      { key: "node0_opening_credit_merchant_cap", value: "100" },
      { key: "node0_launch_node", value: "BBS Mall" },
      { key: "node0_launch_period_ends_at", value: "2026-12-15T00:00:00Z" },
    ];
    configError = null;
    creditedCount = 12;
    countError = null;
    throwOnClient = false;
    countCalls = [];
  });

  // The cap is per node (migration 20260730120000). A global count would hide
  // the promo at a new node the instant a previous node filled its allowance.
  it("counts credited merchants scoped to the launch node, not globally", async () => {
    await getLaunchCreditOffer(NOW);
    const eqs = countCalls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["merchants.node", "BBS Mall"]);
    // The scoping has to come from a join, or the filter silently matches nothing.
    const select = countCalls.find((c) => c.method === "select");
    expect(String(select?.args[0])).toContain("merchants!inner");
  });

  it("scopes the count to whichever node config names", async () => {
    configRows = configRows.map((r) =>
      r.key === "node0_launch_node" ? { ...r, value: "CBD Galleria" } : r
    );
    await getLaunchCreditOffer(NOW);
    const eqs = countCalls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["merchants.node", "CBD Galleria"]);
  });

  it("falls back to the default node when config omits it", async () => {
    configRows = configRows.filter((r) => r.key !== "node0_launch_node");
    await getLaunchCreditOffer(NOW);
    const eqs = countCalls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["merchants.node", "BBS Mall"]);
  });

  it("reads the live config and reports a live offer", async () => {
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: true,
      amountKes: 300,
      merchantCap: 100,
      launchNode: "BBS Mall",
      windowEndsAt: "2026-12-15T00:00:00Z",
    });
  });

  it("reflects a live config change instead of the old hardcoded numbers", async () => {
    configRows = [
      { key: "node0_opening_credit_kes", value: "150" },
      { key: "node0_opening_credit_merchant_cap", value: "40" },
      { key: "node0_launch_node", value: "BBS Mall" },
      { key: "node0_launch_period_ends_at", value: "2026-12-15T00:00:00Z" },
    ];
    await expect(getLaunchCreditOffer(NOW)).resolves.toMatchObject({
      live: true,
      amountKes: 150,
      merchantCap: 40,
    });
  });

  it("shows nothing when the config read errors", async () => {
    configError = { message: "connection reset" };
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: false,
      reason: "unavailable",
    });
  });

  it("shows nothing when the config row is missing entirely", async () => {
    configRows = [];
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: false,
      reason: "disabled",
    });
  });

  it("assumes a cap it cannot measure is full", async () => {
    countError = { message: "permission denied" };
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: false,
      reason: "unavailable",
    });
  });

  it("closes the promo when the counted merchants reach the cap", async () => {
    creditedCount = 100;
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: false,
      reason: "cap-filled",
    });
  });

  it("treats an uncountable-but-uncapped promo as live", async () => {
    // No cap means no count query, so a broken count cannot close an open promo.
    configRows = configRows.filter(
      (r) => r.key !== "node0_opening_credit_merchant_cap"
    );
    countError = { message: "would have failed" };
    await expect(getLaunchCreditOffer(NOW)).resolves.toMatchObject({
      live: true,
      merchantCap: null,
    });
  });

  it("never throws out of the page when the service client is unavailable", async () => {
    throwOnClient = true;
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: false,
      reason: "unavailable",
    });
  });

  it("treats a junk amount as disabled rather than guessing", async () => {
    configRows = configRows.map((r) =>
      r.key === "node0_opening_credit_kes" ? { ...r, value: "three hundred" } : r
    );
    await expect(getLaunchCreditOffer(NOW)).resolves.toEqual({
      live: false,
      reason: "disabled",
    });
  });
});
