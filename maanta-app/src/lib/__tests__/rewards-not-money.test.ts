import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// MAANTA Points are promotional loyalty rewards, NOT money (founder brief
// 2026-08-26 §12/§14): no KES conversion, not withdrawable, not transferable,
// not purchasable, never rendered as money. These are source ratchets on the
// rewards surfaces — the behavioural half (award idempotency, the 15-minute
// boundary, the server-side-only grant) lives in
// supabase/tests/fast_visit_points_test.sql.

const root = process.cwd(); // maanta-app
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8");

const REWARD_SURFACES = [
  "src/app/(shopper)/you/rewards/page.tsx",
  "src/app/(shopper)/tickets/[id]/fast-visit-panel.tsx",
  "src/lib/fast-visit.ts",
  "src/lib/fast-visit-window.ts",
];

describe("MAANTA Points are not money", () => {
  for (const file of REWARD_SURFACES) {
    it(`${file} never renders points as currency`, () => {
      const src = read(file);
      expect(src, `${file} must not mention KES near points`).not.toMatch(/KES/);
      expect(src, `${file} must not import the money formatter`).not.toMatch(
        /formatKes/
      );
    });
  }

  it("earned eligibility survives the feature gate being turned off (D198)", () => {
    // award_fast_visit_points deliberately never re-reads the gate, so a
    // qualification earned while it was ON still pays. Gating the panel on
    // the CURRENT flag alone erased the shopper's confirmation the moment
    // the lever moved, while the award went through — the screen
    // contradicting the persisted verdict and the money.
    const src = read("src/app/(shopper)/tickets/[id]/page.tsx");
    expect(src).toContain("fastVisitOn || ticket.fast_visit_qualified_at");
    // The sibling surface must keep its equivalent carve-out.
    const you = read("src/app/(shopper)/you/page.tsx");
    expect(you).toContain("rewardBalance === null || rewardBalance > 0");
  });

  it("a reward READ FAILURE never renders as an empty balance (D202)", () => {
    // `null` means the read failed; `?? 0` collapsed that into "no rewards"
    // and hid the only link to the page that explains the difference.
    const you = read("src/app/(shopper)/you/page.tsx");
    expect(you).not.toContain("(rewardBalance ?? 0) > 0");
    const rewards = read("src/app/(shopper)/you/rewards/page.tsx");
    expect(rewards).toContain("this is a read error, not");
  });

  it("the ticket success reward card renders points, never money (D205)", () => {
    // This file legitimately contains "KES" (the YOU PAY figure), so it
    // cannot join REWARD_SURFACES wholesale — the assertion is scoped to the
    // reward card itself, which sits on the same screen as a money figure
    // and was the one reward surface no ratchet walked.
    const src = read("src/app/(shopper)/tickets/[id]/page.tsx");
    const start = src.indexOf("Fast Visit reward earned");
    expect(start, "the reward card must still exist on the success screen").toBeGreaterThan(-1);
    const card = src.slice(start - 400, start + 500);
    expect(card, "the reward card must not render KES").not.toMatch(/KES/);
    expect(card, "the reward card must not use the money formatter").not.toMatch(/formatKes/);
    expect(card, "the reward card must not use amber").not.toContain("text-brand");
    expect(card).toContain("MAANTA Points");
  });

  it("the rewards page states the no-cash-value rule and offers no cash-out", () => {
    const src = read("src/app/(shopper)/you/rewards/page.tsx");
    expect(src).toContain("no cash value");
    for (const banned of [/withdraw/i, /\btransfer\b/i, /cash out/i, /redeem points/i]) {
      expect(src, `rewards page must not suggest ${banned}`).not.toMatch(banned);
    }
  });

  it("the reward panel and rewards page carry no amber", () => {
    for (const file of [
      "src/app/(shopper)/you/rewards/page.tsx",
      "src/app/(shopper)/tickets/[id]/fast-visit-panel.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file} must not use amber`).not.toContain("text-brand");
      expect(src, `${file} must not use amber`).not.toContain("bg-brand");
    }
  });

  it("the award RPC stays server-side only, and the ledger append-only", () => {
    const migration = read(
      "supabase/migrations/20260826120000_fast_visit_points.sql"
    );
    // The idempotency key is a real UNIQUE constraint, not an app-side check.
    expect(migration).toMatch(/reference\s+TEXT NOT NULL UNIQUE/);
    // authenticated must never gain EXECUTE on the award, nor INSERT on the ledger.
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.award_fast_visit_points(uuid) FROM authenticated"
    );
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON TABLE public.reward_events FROM authenticated"
    );
    // The boundary is inclusive and lives in the database.
    expect(migration).toContain("v_arrived_at <= v_claimed_at + INTERVAL '15 minutes'");
  });

  it("verify_redemption and claim_deal are untouched by the Fast Visit migration", () => {
    const migration = read(
      "supabase/migrations/20260826120000_fast_visit_points.sql"
    );
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.verify_redemption/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.claim_deal/);
  });
});
