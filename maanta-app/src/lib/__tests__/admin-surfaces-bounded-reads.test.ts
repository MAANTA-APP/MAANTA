import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Every list-building read on the 2026-09-03 admin and founder surfaces is
 * bounded, and every genuine-tagged census goes through the D188 helper.
 *
 * Same rule as `pilot-bounded-reads.test.ts`, extended to the new pages:
 * PostgREST returns the first page of an unbounded select with no error, so
 * a truncated list is indistinguishable from a complete one. On the Action
 * Queue that is worse than a low KPI — a dropped item is an all-clear for the
 * record it dropped — which is why the loader also treats a full page as
 * unreadable.
 */
const PAGES = [
  "src/lib/admin-action-queue-data.ts",
  "src/app/admin/visits/page.tsx",
  "src/app/admin/deals/page.tsx",
  "src/app/admin/operations/page.tsx",
  "src/app/admin/merchants/[id]/page.tsx",
  "src/app/founder/page.tsx",
] as const;

function queryChains(src: string): { table: string; body: string; line: number }[] {
  const out: { table: string; body: string; line: number }[] = [];
  const re = /\.from\("(\w+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") {
        if (depth === 0) break;
        depth--;
      } else if (c === ";" && depth === 0) break;
    }
    out.push({ table: m[1], body: src.slice(start, i), line: src.slice(0, start).split("\n").length });
  }
  return out;
}

const read = (rel: string) => stripComments(readFileSync(path.join(process.cwd(), rel), "utf8"));

describe("no unbounded list read on the redesigned surfaces", () => {
  for (const rel of PAGES) {
    it(`bounds every list-building read in ${rel}`, () => {
      const src = read(rel);
      const chains = queryChains(src);
      expect(chains.length, "the scanner must find reads or this guard is vacuous").toBeGreaterThan(0);
      const unbounded = chains.filter(
        (c) =>
          !c.body.includes("head: true") &&
          !c.body.includes(".limit(") &&
          !c.body.includes(".maybeSingle(")
      );
      expect(
        unbounded.map((c) => `${rel}:${c.line} ${c.table}`),
        "every read that returns rows must carry an explicit .limit()"
      ).toEqual([]);
    });
  }

  it("treats a full page as unreadable in the action queue loader", () => {
    const src = read(PAGES[0]);
    expect(src).toMatch(/rows\.length >= ROW_CAP\) return null/);
    const cap = src.match(/const ROW_CAP = (\d+);/);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBeLessThan(1000);
  });
});

describe("evidence and visibility rules are the shared ones", () => {
  it("the action queue counts supply with the feed's own predicate", () => {
    const src = read("src/lib/admin-action-queue-data.ts");
    expect(src).toContain("withPublicMerchant(");
    expect(src).toContain("merchants!inner(status,is_visible,is_shadow_banned,is_demo)");
    expect(src).toContain("classifyMerchant(");
  });

  it("keeps every action-queue category free of synthetic marketplace rows", () => {
    const src = read("src/lib/admin-action-queue-data.ts");
    // Redemption-backed conditions use the full D188 chain: the redemption,
    // merchant and deal must all be non-demo. Direct merchant-backed reads use
    // their own is_demo predicate, while nullable merchant relations (fraud
    // events and tasks) retain merchantless records and reject only known demo.
    expect(src.match(/genuineTagged\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(src).toContain("genuineJoinSelect(");
    expect(src).toMatch(/\.eq\("status", "pending"\)\s*\.eq\("is_demo", false\)/);
    expect(
      src.match(/merchants!inner\(merchant_name,is_demo\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
    expect(
      src.match(/\.eq\("merchants\.is_demo", false\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(3);
    expect(src.match(/\.is_demo !== true/g)).toHaveLength(2);
  });

  it("defines a genuine admin deal as a non-demo deal under a non-demo merchant", () => {
    const src = read("src/app/admin/deals/page.tsx");
    expect(src).toContain("merchants!inner(merchant_name, status, is_demo)");
    expect(src).toMatch(
      /query = query\.eq\("is_demo", false\)\.eq\("merchants\.is_demo", false\)/
    );
  });

  it("the founder command centre takes external evidence from the manifest, never from a demo flag", () => {
    const src = read("src/app/founder/page.tsx");
    expect(src).toContain("externalCohort()");
    expect(src).toContain("externalCohortSize()");
    expect(src).not.toMatch(/external[A-Za-z]*\s*=\s*[^;]*is_demo/);
    expect(src.match(/genuineTagged\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(src).toMatch(/\.in\("merchant_id", externalIds\)/);
  });

  it("the founder command centre reads money through the one shared reader", () => {
    const src = read("src/app/founder/page.tsx");
    expect(src.match(/readLedgerFeeTotals\(service, \{/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/from\("merchant_transactions"\)/);
  });

  it("the founder's 'Right now' queues agree with the Action Queue about what is human work (Codex P2, PR #319)", () => {
    const src = read("src/app/founder/page.tsx");
    // Held claims: the D188 three-parent predicate, not a raw status count.
    expect(src).toMatch(/genuineCount\(\(q\) => q\.eq\("status", "flagged"\)\)/);
    expect(src).not.toMatch(/from\("redemptions"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("status", "flagged"\)/);
    // Pending shops: synthetic shops are never awaiting a human.
    expect(src).toMatch(/\.eq\("status", "pending"\)\s*\.eq\("is_demo", false\)/);
  });

  it("the deals directory fails closed when the fraud-signal read hits its cap (Codex P2, PR #319)", () => {
    const src = read("src/app/admin/deals/page.tsx");
    expect(src).toMatch(/from\("fraud_events"\)\s*\.select\("merchant_id", \{ count: "exact" \}\)/);
    expect(src).toMatch(/fraudTruncated = eventsRes\.count !== null && eventsRes\.count > fraudRows\.length/);
    expect(src).toMatch(/Review markers unavailable/);
    // A truncated read draws no marker at all rather than a partial set.
    expect(src).toMatch(/flaggedMerchants === null\s*\?\s*null/);
  });

  it("the platform report names the population of each money card beside the all-rows verified count (Codex P2, PR #319)", () => {
    const src = read("src/components/admin/platform-report.tsx");
    expect(src).toMatch(/label="Verified redemptions"[\s\S]*?hint="Every success row — internal and synthetic included"/);
    expect(src.match(/hint="Genuine-tagged rows only \(ledger contract\)"/g)?.length ?? 0).toBe(3);
  });

  it("an unreadable ladder is not rung zero on the founder page (Codex P2, PR #319, D246)", () => {
    const src = read("src/app/founder/page.tsx");
    // The rung card branches on the ladder being null before it reads the rung.
    expect(src).toMatch(/label="Rung reached"[\s\S]*?external\.ladder === null[\s\S]*?"—"/);
    expect(src).toMatch(/Ladder unreadable — a read error, not rung zero/);
  });

  it("an unreadable demo flag blocks an evidence step on the founder page (Codex P1, PR #319, D246)", () => {
    const src = read("src/app/founder/page.tsx");
    expect(src).toMatch(/nextMove\.requiresDemoOff && !demoMode\.ok/);
    expect(src).toMatch(/Demo mode could not be read — do not run this step yet/);
    // The unreadable branch comes first, so it cannot be shadowed by the ON branch.
    expect(src.indexOf("nextMove.requiresDemoOff && !demoMode.ok")).toBeLessThan(
      src.indexOf("demoMode.ok && demoMode.enabled && nextMove.requiresDemoOff")
    );
  });

  it("open tasks are counted the way the Action Queue counts them (Codex P2, PR #319, D247)", () => {
    const src = read("src/app/founder/page.tsx");
    // No shop: kept. A shop: only when it is not demo.
    expect(src).toMatch(/from\("agent_tasks"\)[\s\S]*?\.eq\("is_complete", false\)\s*\.is\("merchant_id", null\)/);
    expect(src).toMatch(/from\("agent_tasks"\)\s*\.select\("id, merchants!inner\(is_demo\)"[\s\S]*?\.eq\("merchants\.is_demo", false\)/);
    expect(src).not.toMatch(/from\("agent_tasks"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("is_complete", false\),/);
    // Either read failing makes the figure unknown, never a partial sum.
    expect(src).toMatch(/openTasksNoShop === null \|\| openTasksShop === null \? null/);
  });

  it("Operations leaves reachable counts unknown when the demo flag is unreadable (Codex P2, PR #319, D251)", () => {
    const src = read("src/app/admin/operations/page.tsx");
    // Reachability includes synthetic shops only when demo mode is ON, and an
    // unreadable flag defaults that to false — so the count is a guess, and a
    // guess rendered as a number is a false operational statement.
    expect(src).toMatch(/demoMode\.ok \? fmt\(n\(reachableRes\)\) : "—"/);
    // The caption must not call them "genuine shops only" on a failed read.
    expect(src).toMatch(/demo-mode flag could not be read/);
    expect(src).toMatch(/unknown, not false/);
  });

  it("Merchant 360's fee cards name their narrower population (Codex P2, PR #319, D252)", () => {
    const src = read("src/app/admin/merchants/[id]/page.tsx");
    // The counts and ledger on this page are every row for the shop; the fee
    // reader excludes demo-tagged rows, so on a synthetic shop the cards can
    // read KES 0 beside a non-zero redeemed count. Same disclosure D245 put on
    // the platform report.
    expect(src.match(/hint="Genuine-tagged rows only \(ledger contract\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/narrower than the counts above/);
  });

  it("Merchant 360 derives no all-time fact from a capped page (Codex P2 ×2, PR #319, D248)", () => {
    const src = read("src/app/admin/merchants/[id]/page.tsx");
    // The fraud read carries a count and the note shows the true total.
    expect(src).toMatch(/from\("fraud_events"\)\s*\.select\("id, event_type, severity, created_at", \{ count: "exact" \}\)/);
    expect(src).toMatch(/fraudTotal/);
    expect(src).toMatch(/most recent shown/);
    // The opening credit has its own read, keyed on the reference prefix, and
    // is no longer derived from the newest-N ledger page.
    expect(src).toMatch(/OPENING_CREDIT_REFERENCE_PREFIX/);
    expect(src).not.toMatch(/openingCreditAmount\(ledger\b/);
    expect(src).toMatch(/openingRes\.error \? "—"/);
  });

  it("merchant 360 reads money from the ledger, not from the claim's fee column", () => {
    const src = read("src/app/admin/merchants/[id]/page.tsx");
    expect(src).toContain("readLedgerFeeTotals(service, { merchantIds: [m.id]");
    expect(src).not.toMatch(/success_fee_charged/);
  });
});

describe("the founder command centre gates every admin link", () => {
  const src = read("src/app/founder/page.tsx");

  it("decides admin access from the guard's own role read", () => {
    expect(src).toContain("canAccessAdminConsole(user.role)");
  });

  it("renders no /admin href outside a capability check", () => {
    const adminHrefs = src.match(/href="\/admin[^"]*"/g) ?? [];
    expect(adminHrefs.length).toBeGreaterThan(0);
    for (const href of adminHrefs) {
      const idx = src.indexOf(href);
      const window = src.slice(Math.max(0, idx - 700), idx + 700);
      expect(window, `ungated admin link: ${href}`).toContain("canOpenAdminConsole");
    }
    expect(src).not.toContain('href="/admin/support"');
  });

  it("keeps the next move deterministic and the ladder apart from enrolment", () => {
    expect(src).toContain("pilotNextMove(");
    expect(src).toContain("ladderPosition(");
    expect(src).toContain("killCriterionClock(");
    expect(src).toContain("tripwireReading(");
    // Enrolment is a prerequisite, never a rung.
    expect(src).toMatch(/Enrolling a merchant does not move it/);
  });
});

describe("merchant 360 — anchors and honest controls", () => {
  const src = read("src/app/admin/merchants/[id]/page.tsx");

  it("carries every section anchor the action queue links to", () => {
    for (const id of ["identity", "staff", "deals", "activity", "economics", "support", "actions", "audit"]) {
      expect(src, `missing #${id}`).toContain(`id="${id}"`);
    }
  });

  it("draws no control the backend does not enforce", () => {
    // Pause/resume and allocation are merchant-only; blacklisting has no admin route.
    expect(src).not.toMatch(/action:\s*["']pause["']/);
    expect(src).not.toMatch(/api\/deals\//);
    expect(src).not.toMatch(/is_blacklisted:\s*(true|false)/);
    expect(src).toMatch(/Not available from the console, by design/);
  });

  it("separates claims from redemptions by stage", () => {
    expect(src).toContain('from "@/lib/visit-funnel"');
    expect(src).toContain("visitStage(");
  });
});

describe("visits & redemptions — the funnel is derived, never inferred", () => {
  const src = read("src/app/admin/visits/page.tsx");

  it("places every row through the shared stage rule", () => {
    expect(src).toContain('from "@/lib/visit-funnel"');
    expect(src).toContain("countStages(");
    expect(src).toContain("reachedColumns(");
    expect(src).toContain("visitStage(");
  });

  it("embeds the queue rows so in-queue is read from evidence, not assumed", () => {
    expect(src).toContain("merchant_presentations(status, expires_at)");
  });

  it("reports a capped staff-queue snapshot as incomplete, never as the whole queue (Codex P2, PR #319)", () => {
    // The presentations read is bounded; without a count a page that hit the
    // cap rendered the survivors — or "Nobody is waiting" after the in-memory
    // redemption filter — as a complete snapshot.
    expect(src).toMatch(/from\("merchant_presentations"\)[\s\S]*?count: "exact"[\s\S]*?\.limit\(QUEUE_CAP\)/);
    expect(src).toMatch(/queueRes\.count !== null && queueRes\.count > queueRows\.length/);
    expect(src).toMatch(/queueTruncated \?/);
    expect(src).toMatch(/Incomplete, not empty/);
  });

  it("windows by claimed_at and says pre-tracking rows are excluded", () => {
    expect(src).toMatch(/\.gte\("claimed_at", since\)/);
    expect(src).toMatch(/recorded before claim-time tracking/);
  });
});
