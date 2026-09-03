import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";
import { VISIT_STAGE_META } from "@/lib/visit-funnel";

/**
 * The review criteria the founder restored on 2026-09-03, as ratchets.
 *
 *  - QR check-in is not redemption. Queue or call state is not redemption.
 *  - The successful staff/server verification of the canonical six-digit
 *    code is the authoritative redemption event, and the only one that can
 *    generate the KES 30 success fee.
 *  - Claims, arrivals, queue events and rejected/expired outcomes are never
 *    presented as money-generating verified visits.
 *  - Mobile-first usability; no invented metrics; Fast Visit remains OFF and
 *    is not presented as a current KPI; failed or unreadable data never
 *    silently becomes zero.
 *
 * Source scans, because the property is about what ships on each surface.
 */
const read = (rel: string) =>
  stripComments(readFileSync(path.join(process.cwd(), rel), "utf8"));

const REDESIGNED_SURFACES = [
  "src/app/admin/page.tsx",
  "src/app/admin/queue/page.tsx",
  "src/app/admin/visits/page.tsx",
  "src/app/admin/deals/page.tsx",
  "src/app/admin/operations/page.tsx",
  "src/app/admin/merchants/[id]/page.tsx",
  "src/app/founder/page.tsx",
] as const;

describe("redemption is the only money event", () => {
  it("the funnel marks exactly one stage as money, and it is the verified redemption", () => {
    const money = Object.entries(VISIT_STAGE_META).filter(([, m]) => m.money).map(([k]) => k);
    expect(money).toEqual(["redeemed"]);
    expect(VISIT_STAGE_META.redeemed.hint).toMatch(/verified by staff/i);
    expect(VISIT_STAGE_META.redeemed.hint).toMatch(/success fee/i);
    for (const stage of ["arrived", "in_queue", "held", "rejected", "claimed", "expired"] as const) {
      expect(VISIT_STAGE_META[stage].money).toBe(false);
    }
    expect(VISIT_STAGE_META.arrived.hint).toMatch(/not a redemption/i);
    expect(VISIT_STAGE_META.in_queue.hint).toMatch(/not a redemption/i);
  });

  it("every 'verified' count on the redesigned surfaces is a success-status read", () => {
    // A verified count that is not filtered to status = success would count
    // arrivals or queue entries as money. Assert the filter exists wherever
    // the word "Verified" labels a KPI.
    for (const rel of ["src/app/founder/page.tsx", "src/app/admin/merchants/[id]/page.tsx"]) {
      const src = read(rel);
      if (/label=\{?"?Verified|Redeemed \(all time\)/.test(src)) {
        expect(src, `${rel} labels a verified/redeemed KPI without a success filter`).toMatch(
          /\.eq\("status", "success"\)/
        );
      }
    }
  });

  it("says in words, on the visits and merchant surfaces, what is not a redemption", () => {
    expect(read("src/app/admin/visits/page.tsx")).toMatch(
      /A claim is not an arrival, an arrival is\s+not a redemption, a queue entry is\s+not a redemption, and a QR scan is not a\s+redemption/
    );
    expect(read("src/app/admin/merchants/[id]/page.tsx")).toMatch(
      /A claim is not an arrival, an arrival is not a redemption, and a queue entry is not a\s+redemption/
    );
  });

  it("never labels an arrival or a queue entry as verified", () => {
    for (const rel of REDESIGNED_SURFACES) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/label="Verified arrivals"/);
      expect(src, rel).not.toMatch(/label="Verified queue/);
      expect(src, rel).not.toMatch(/arrivals? verified/i);
    }
  });
});

describe("Fast Visit stays OFF and is not a current KPI", () => {
  it("no redesigned surface renders a Fast Visit KPI card", () => {
    for (const rel of REDESIGNED_SURFACES) {
      const src = read(rel);
      // A KpiCard is a metric; the Operations flag row (`<Flag label="Fast Visit"`)
      // states the switch and its meaning, which is exactly what is allowed.
      expect(src, `${rel} renders Fast Visit as a KPI`).not.toMatch(/<KpiCard[^>]*label=\{?"Fast Visits?"/);
    }
  });

  it("operations shows the flag with its OFF meaning, not as a metric", () => {
    const src = read("src/app/admin/operations/page.tsx");
    expect(src).toMatch(/OFF — check-in and the counter queue work, but no points are awarded/);
    expect(src).toMatch(/fast_visit_enabled/);
  });
});

describe("no invented metrics", () => {
  it("the founder command centre computes no ratio below the minimum sample and no trend word", () => {
    const src = read("src/app/founder/page.tsx");
    expect(src).toContain("MIN_CLAIMS_FOR_MERCHANT_RATIO");
    expect(src).not.toMatch(/\b(trending|improving|worsening|on track|forecast|projected)\b/i);
    expect(src).not.toMatch(/Math\.round\([^)]*\/[^)]*\* ?100\)/);
  });

  it("every founder reading is a named pure function with a test, never inline arithmetic", () => {
    const src = read("src/app/founder/page.tsx");
    for (const fn of ["ladderPosition(", "killCriterionClock(", "tripwireReading(", "pilotNextMove("]) {
      expect(src).toContain(fn);
    }
    expect(readFileSync(path.join(process.cwd(), "src/lib/__tests__/founder-command-centre.test.ts"), "utf8").length).toBeGreaterThan(500);
  });
});

describe("failed or unreadable data never silently becomes zero", () => {
  it("Merchant 360 guards its supply diagnosis and live counts on the read result", () => {
    const src = read("src/app/admin/merchants/[id]/page.tsx");
    expect(src).toMatch(/dealsRes\.error \?[\s\S]{0,120}could not be read/);
    expect(src).toMatch(/redemptionsRes\.error \? "—" : stages\.held/);
    expect(src).toMatch(/redemptionsRes\.error \? "—" : stages\.in_queue/);
  });

  it("the action queue loader treats a full page as unreadable and the rules emit an item for it", () => {
    expect(read("src/lib/admin-action-queue-data.ts")).toMatch(/rows\.length >= ROW_CAP\) return null/);
    expect(read("src/lib/admin-action-queue.ts")).toMatch(/unavailable\(category/);
  });

  it("operations and visits render a dash for a failed count, not 0", () => {
    expect(read("src/app/admin/operations/page.tsx")).toMatch(/v === null \? "—"/);
    expect(read("src/app/admin/visits/page.tsx")).toMatch(/heldRes\.error \? null/);
  });
});

describe("mobile-first usability", () => {
  it("every table on a redesigned surface scrolls inside its own container", () => {
    for (const rel of REDESIGNED_SURFACES) {
      const src = read(rel);
      const tables = src.match(/<table/g) ?? [];
      const wrapped = src.match(/overflow-x-auto[^\n]*\n\s*<table/g) ?? [];
      expect(wrapped.length, `${rel}: a table without an overflow-x-auto wrapper`).toBe(tables.length);
    }
  });

  it("KPI grids start at two columns and widen, never a fixed desktop-only grid", () => {
    for (const rel of REDESIGNED_SURFACES) {
      const src = read(rel);
      for (const grid of src.match(/className="[^"]*grid-cols-[^"]*"/g) ?? []) {
        expect(grid, `${rel}: ${grid}`).toMatch(/grid-cols-[123]\b/);
      }
    }
  });

  it("the admin drawer opens from a hamburger on small screens", () => {
    const sidebar = read("src/components/nav/admin-sidebar.tsx");
    expect(sidebar).toContain('aria-label="Open menu"');
    expect(sidebar).toMatch(/lg:hidden/);
  });
});
