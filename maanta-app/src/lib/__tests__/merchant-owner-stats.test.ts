import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  summariseMerchantOwnerMetrics,
  type MerchantVerifiedRow,
} from "@/lib/merchant-owner-stats";

describe("merchant owner value metrics", () => {
  it("uses exact cohort counts, successful visits, real fees and deterministic top deal", () => {
    const verified: MerchantVerifiedRow[] = [
      {
        id: "v1",
        deal_id: "deal-b",
        success_fee_charged: 30,
        fast_visit_qualified_at: "2026-08-26T10:10:00Z",
      },
      {
        id: "v2",
        deal_id: "deal-a",
        success_fee_charged: "30",
        fast_visit_qualified_at: null,
      },
      {
        id: "v3",
        deal_id: "deal-b",
        success_fee_charged: 30,
        fast_visit_qualified_at: null,
      },
    ];

    const stats = summariseMerchantOwnerMetrics({
      claimCount: 2,
      claimSuccessCount: 1,
      verifiedCount: 3,
      verifiedRows: verified,
      dealTitles: new Map([
        ["deal-a", "A deal"],
        ["deal-b", "B deal"],
      ]),
    });

    expect(stats.claims).toEqual({ ok: true, value: 2 });
    expect(stats.claimToVerifiedPct).toEqual({ ok: true, value: 50 });
    expect(stats.verifiedVisits).toEqual({ ok: true, value: 3 });
    expect(stats.successFees).toEqual({ ok: true, value: 90 });
    expect(stats.fastVisits).toEqual({ ok: true, value: 1 });
    expect(stats.topDeal).toEqual({ ok: true, value: "B deal" });
  });

  it("keeps a successful zero distinct from unavailable data", () => {
    const stats = summariseMerchantOwnerMetrics({
      claimCount: 0,
      claimSuccessCount: 0,
      verifiedCount: 0,
      verifiedRows: [],
      dealTitles: new Map(),
    });

    expect(stats.claims).toEqual({ ok: true, value: 0 });
    expect(stats.claimToVerifiedPct).toEqual({ ok: true, value: null });
    expect(stats.verifiedVisits).toEqual({ ok: true, value: 0 });
    expect(stats.successFees).toEqual({ ok: true, value: 0 });
    expect(stats.topDeal).toEqual({ ok: true, value: null });
  });

  it("breaks top-deal ties deterministically by title", () => {
    const verified: MerchantVerifiedRow[] = [
      {
        id: "1",
        deal_id: "z",
        success_fee_charged: 30,
        fast_visit_qualified_at: null,
      },
      {
        id: "2",
        deal_id: "a",
        success_fee_charged: 30,
        fast_visit_qualified_at: null,
      },
    ];

    expect(
      summariseMerchantOwnerMetrics({
        claimCount: 0,
        claimSuccessCount: 0,
        verifiedCount: 2,
        verifiedRows: verified,
        dealTitles: new Map([
          ["z", "Zulu"],
          ["a", "Alpha"],
        ]),
      }).topDeal
    ).toEqual({
      ok: true,
      value: "Alpha",
    });
  });
});

describe("PR 3 cap and tenant-boundary ratchets", () => {
  const read = (rel: string) =>
    readFileSync(path.join(__dirname, "../../", rel), "utf8");

  it("scopes every tenant-data stats query to the authenticated merchant id", () => {
    const src = read("lib/merchant-owner-stats.ts");
    expect(
      src.match(/\.eq\("merchant_id", merchantId\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(5);
    expect(src).not.toContain("deals(title)");
  });

  it("pages verified detail rows instead of trusting PostgREST's first page", () => {
    const src = read("lib/merchant-owner-stats.ts");
    expect(src).toContain("PAGE_SIZE = 500");
    expect(src).toContain(".range(from, from + PAGE_SIZE - 1)");
    expect(src).toContain("while (rows.length < expectedCount)");
  });

  it("pre-flights exactly the trigger slot predicate before mounting the wizard", () => {
    const src = read("app/merchant/(app)/deals/new/page.tsx");
    expect(src).toContain('.eq("merchant_id", merchant.id)');
    expect(src).toContain('.eq("is_active", true)');
    expect(src).toContain("used >= limit");
    expect(src).toContain("activeDealLimitCopy");
    expect(src).not.toContain("countLiveDeals");
  });

  it("keeps ended is_active rows visible and archivable", () => {
    const deals = read("app/merchant/(app)/deals/page.tsx");
    const actions = read("app/merchant/(app)/deals/[id]/deal-actions.tsx");
    const detail = read("app/merchant/(app)/deals/[id]/page.tsx");

    expect(deals).toContain("endedSlotOccupants");
    expect(deals).toContain("Ended — archive to free a slot");
    expect(actions).toContain("canDeals && isActive");
    expect(detail).toContain("isActive={deal.is_active}");
  });
});
