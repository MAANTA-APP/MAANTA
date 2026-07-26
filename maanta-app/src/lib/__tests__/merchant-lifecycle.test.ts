import { describe, expect, it } from "vitest";
import {
  CHURN_INACTIVITY_DAYS,
  ONBOARDING_WINDOW_DAYS,
  countLiveDeals,
  daysSinceLastDealEnded,
  getMerchantLifecycleInfo,
  getMerchantLifecycleStage,
  getMerchantLifecycleStats,
} from "@/lib/merchant-lifecycle";
import { DEAL_GRACE_MINUTES } from "@/lib/deal-expiry";

const NOW = new Date("2026-07-26T12:00:00.000Z");

describe("merchant-lifecycle", () => {
  it("counts live deals including grace window", () => {
    const graceEnd = new Date(NOW.getTime() - 5 * 60_000);
    const deals = [{ expires_at: graceEnd.toISOString(), is_active: true }];
    expect(countLiveDeals(deals, NOW)).toBe(1);
  });

  it("excludes deals past grace", () => {
    const expired = new Date(
      NOW.getTime() - (DEAL_GRACE_MINUTES + 1) * 60_000
    );
    const deals = [{ expires_at: expired.toISOString(), is_active: true }];
    expect(countLiveDeals(deals, NOW)).toBe(0);
  });

  it("returns waitlist for pending merchants", () => {
    const stage = getMerchantLifecycleStage(
      { status: "pending", onboarded_at: null },
      { liveDealCount: 0, daysSinceLastDealEnded: null },
      NOW
    );
    expect(stage).toBe("waitlist");
  });

  it("returns onboarding for recently approved merchants", () => {
    const onboarded = new Date(NOW.getTime() - 5 * 24 * 3600_000).toISOString();
    const stage = getMerchantLifecycleStage(
      { status: "active", onboarded_at: onboarded },
      { liveDealCount: 2, daysSinceLastDealEnded: null },
      NOW
    );
    expect(stage).toBe("onboarding");
    expect(ONBOARDING_WINDOW_DAYS).toBeGreaterThan(5);
  });

  it("returns live for established merchants with active deals", () => {
    const onboarded = new Date(NOW.getTime() - 60 * 24 * 3600_000).toISOString();
    const stage = getMerchantLifecycleStage(
      { status: "active", onboarded_at: onboarded },
      { liveDealCount: 2, daysSinceLastDealEnded: null },
      NOW
    );
    expect(stage).toBe("live");
  });

  it("returns churn_risk after long inactivity", () => {
    const onboarded = new Date(NOW.getTime() - 90 * 24 * 3600_000).toISOString();
    const stage = getMerchantLifecycleStage(
      { status: "active", onboarded_at: onboarded },
      { liveDealCount: 0, daysSinceLastDealEnded: CHURN_INACTIVITY_DAYS },
      NOW
    );
    expect(stage).toBe("churn_risk");
  });

  it("computes days since last deal ended", () => {
    const ended = new Date(NOW.getTime() - 45 * 24 * 3600_000).toISOString();
    expect(daysSinceLastDealEnded([{ expires_at: ended }], NOW)).toBe(45);
  });

  it("builds lifecycle info with node label", () => {
    const info = getMerchantLifecycleInfo(
      {
        status: "active",
        onboarded_at: new Date(NOW.getTime() - 120 * 24 * 3600_000).toISOString(),
        node: "BBS Mall",
        merchant_name: "Test Shop",
      },
      getMerchantLifecycleStats(
        [
          {
            expires_at: new Date(NOW.getTime() + 3600_000).toISOString(),
            is_active: true,
          },
        ],
        NOW
      ),
      NOW
    );
    expect(info.stage).toBe("live");
    expect(info.message).toContain("BBS Mall");
  });
});
