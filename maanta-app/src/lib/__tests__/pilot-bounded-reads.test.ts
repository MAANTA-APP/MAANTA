import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Every list-building read on the two Pilot surfaces is bounded.
 *
 * ## Why this file exists, stated plainly
 *
 * PostgREST applies a server-side max-rows and returns the first page **with
 * no error**, so an unbounded `.select()` that overflows it is
 * indistinguishable from a complete result. Codex found this three times on
 * this PR, in three different places, across three consecutive rounds:
 *
 *   1. `merchantsClaimedButNotVerified` — a truncated day could INVERT an
 *      alert, naming a merchant as "claims but no verified visit" when its
 *      `success` rows simply fell past the cap;
 *   2. `merchantsWithoutVisibleSupply` — same shape, found by me while fixing
 *      (1), and it would drop merchants from a no-supply list, which is an
 *      all-clear for exactly the ones it dropped;
 *   3. the `/admin/pilot` cohort read — `allCohort.length` was a page size
 *      rather than a cohort size, so "showing 50 of N" understated N.
 *
 * After (1) and (2) I wrote a guard that asserted the property — and scoped it
 * to one file, so (3) sailed through. That is the same mistake as fixing the
 * reported instance instead of the rule, one level up. This guard therefore
 * walks BOTH pages and every read in them, and it is written so that adding a
 * third page means adding it here rather than discovering the gap in review.
 */

const PAGES = [
  "src/app/admin/pilot/page.tsx",
  "src/app/founder/yesterday/page.tsx",
] as const;

/**
 * Extract each `.from("table")…` query chain with a paren-balanced scan.
 *
 * A regex cannot do this: these chains contain multi-line calls like
 * `.in("reference_id", ids.map(...))`, and a naive terminator stops at the
 * first `)` inside one — which produced two false "unbounded" reports when I
 * first swept this by hand. The scan walks forward tracking depth and ends the
 * chain at a `;` at depth 0, or when depth drops below where it started
 * (the end of an enclosing `Promise.all([...])` element).
 */
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
        if (depth === 0) break; // closed an enclosing call — chain ends here
        depth--;
      } else if (c === ";" && depth === 0) break;
    }
    out.push({
      table: m[1],
      body: src.slice(start, i),
      line: src.slice(0, start).split("\n").length,
    });
  }
  return out;
}

describe("no unbounded list read on the pilot surfaces", () => {
  for (const rel of PAGES) {
    it(`bounds every list-building read in ${rel}`, () => {
      const src = stripComments(
        readFileSync(path.join(process.cwd(), rel), "utf8")
      );
      const chains = queryChains(src);
      // Sanity: the scanner must actually find the reads, or this guard is
      // vacuous — the failure mode that has bitten this repo before (D38).
      expect(chains.length).toBeGreaterThan(3);

      const unbounded = chains.filter(
        (c) =>
          // A count-only read returns no rows, so it cannot be truncated.
          !c.body.includes("head: true") &&
          // Anything that returns rows must say how many at most.
          !c.body.includes(".limit(")
      );

      expect(
        unbounded.map((c) => `${rel}:${c.line} ${c.table}`),
        "every read that returns rows must carry an explicit .limit(), or a truncated page is indistinguishable from a complete result"
      ).toEqual([]);
    });
  }

  it("does not treat a page length as a total anywhere on these surfaces", () => {
    // The specific defect in the cohort read: `allCohort.length` was the size
    // of whatever PostgREST happened to return, then presented as the cohort
    // size. A total must come from an exact count.
    const pilot = stripComments(
      readFileSync(path.join(process.cwd(), PAGES[0]), "utf8")
    );
    expect(pilot).toMatch(/\{ count: "exact" \}/);
    expect(pilot).not.toMatch(/allCohort\.length/);
    expect(pilot).toMatch(/cohortTotal === null/);
  });

  it("says the total is unknown rather than implying there are no more", () => {
    // A null count with a full page means "at least this many, total unknown".
    // Rendering nothing there would read as "that is all of them".
    const pilot = readFileSync(path.join(process.cwd(), PAGES[0]), "utf8");
    expect(pilot).toMatch(/cohort total could not be established/i);
  });
});

describe("no partial re-statement of the public-merchant rule", () => {
  /**
   * Codex round 8, and the fifth consecutive round finding the same class of
   * defect in a sibling. The rule this time is the public-merchant predicate:
   * `status = 'active' AND is_visible = TRUE AND is_shadow_banned = FALSE`.
   *
   * `pilotMerchantStatus` was fixed to use the canonical predicate in round 3.
   * The candidate query in `merchantsWithoutVisibleSupply` — different file,
   * different mechanism, same rule — still filtered on `status` alone, so an
   * active-but-hidden or shadow-banned merchant became a candidate, its
   * public-filtered deal count was necessarily zero, and the brief accused it
   * of having no supply when its real problem was that it cannot be public.
   *
   * Guarding "use the helper" would be too blunt: `/admin/pilot`'s cohort read
   * deliberately lists every non-demo merchant INCLUDING pending, suspended
   * and hidden ones, because it diagnoses each row individually and reports
   * the visibility block first. That is correct and must stay allowed.
   *
   * So the guard bans the dangerous SHAPE instead: filtering merchants by
   * `status = "active"` while ignoring the other two conditions. That is
   * precisely the partial predicate, and it is what a fourth copy would look
   * like.
   */
  for (const rel of PAGES) {
    it(`never filters merchants on status alone in ${rel}`, () => {
      const src = stripComments(
        readFileSync(path.join(process.cwd(), rel), "utf8")
      );
      for (const chain of queryChains(src)) {
        if (chain.table !== "merchants") continue;
        if (!chain.body.includes('.eq("status", "active")')) continue;
        // Having asserted status = active by hand, it must assert the rest of
        // the rule by hand too — or, better, go through the helper.
        const complete =
          chain.body.includes("withPublicMerchantRows") ||
          (chain.body.includes('.eq("is_visible", true)') &&
            chain.body.includes('.eq("is_shadow_banned", false)'));
        expect(
          complete,
          `${rel}:${chain.line} filters merchants on status alone — a hidden or shadow-banned merchant passes and is then diagnosed on its supply`
        ).toBe(true);
      }
    });
  }

  it("routes the zero-supply candidate list through the canonical helper", () => {
    const src = stripComments(
      readFileSync(path.join(process.cwd(), PAGES[1]), "utf8")
    );
    const fn = src.slice(src.indexOf("async function merchantsWithoutVisibleSupply"));
    expect(fn.slice(0, 900)).toContain("withPublicMerchantRows(");
  });
});

describe("the ladder headline is rendered from the external class only", () => {
  it("does not render an undifferentiated activity total beside the ladder", () => {
    // The defect was structural, not arithmetic: `cohortTotals(rows)` is
    // correct, it was simply the wrong set to put in the headline. So the
    // guard is that the activity cards read from the external split.
    const src = stripComments(
      readFileSync(path.join(process.cwd(), PAGES[0]), "utf8")
    );
    expect(src).toContain("totalsByEvidence(");
    for (const field of ["claims", "arrivals", "verified", "successFeesKes"]) {
      expect(
        src,
        `activity card must read byClass.external.${field}, never the all-rows total`
      ).toContain(`byClass.external.${field}`);
      expect(
        src,
        `totals.${field} is the all-rows sum and must not reach a KPI card`
      ).not.toContain(`fmt(totals.${field})`);
    }
  });

  it("still shows internal and unclassified activity, rather than hiding it", () => {
    // Kept as technical evidence (D184). Suppressing it would be its own lie.
    const src = readFileSync(path.join(process.cwd(), PAGES[0]), "utf8");
    expect(src).toContain("byClass.internal");
    expect(src).toContain("byClass.unclassified");
  });
});

describe("the Yesterday brief keeps the ladder's counters apart too", () => {
  const brief = () =>
    stripComments(
      readFileSync(path.join(process.cwd(), PAGES[1]), "utf8")
    );

  it("scopes external activity by the cohort manifest, never by is_demo", () => {
    const src = brief();
    expect(src).toContain("externalCohort()");
    expect(src).toContain("externalDayTotals(");
    // The ladder's scope is an explicit id list.
    expect(src).toMatch(/\.in\("merchant_id", externalIds\)/);
  });

  it("renders external counters from the external totals, not the all-class ones", () => {
    const src = brief();
    for (const f of ["claims", "verified", "arrivals", "fastVisits"]) {
      expect(src).toContain(`external.${f}`);
    }
  });

  it("labels the all-class figures as all-class, so the two are not confused", () => {
    const src = readFileSync(path.join(process.cwd(), PAGES[1]), "utf8");
    expect(src).toMatch(/All genuine-tagged activity/);
    expect(src).toMatch(/external, internal and\s+unclassified together/);
  });

  it("says an empty cohort is zero by construction, not unread", () => {
    // Otherwise a reader cannot tell "nobody enrolled" from "we could not
    // establish it" — the failure-vs-zero rule applied to the ladder itself.
    expect(readFileSync(path.join(process.cwd(), PAGES[1]), "utf8")).toMatch(
      /zero by construction rather than unread/
    );
  });
});

describe("the ladder counts genuine verified redemptions, not enrolments", () => {
  /**
   * Codex round 10 (P1), against MAANTA's own frozen doctrine.
   *
   * CLAUDE.md is explicit: "Ladder: 1 → 5 → 10 genuine verified redemptions",
   * and "External field validation: 0 genuine merchant successes ... starts at
   * zero until a real merchant serves a real shopper". The card rendered
   * `externalCohortSize()` and its hint claimed that was what the ladder
   * counts — so the day Merchant 01 was enrolled, before serving anyone, the
   * experiment would have reported its first rung.
   *
   * Two distinct metrics now: cohort SIZE (a prerequisite) and ladder
   * PROGRESS (cumulative successes).
   */
  const pilot = () =>
    stripComments(readFileSync(path.join(process.cwd(), PAGES[0]), "utf8"));

  it("derives the ladder from external successful redemptions", () => {
    const src = pilot();
    expect(src).toContain("ladderSuccesses");
    // Scoped to enrolled merchants, filtered to successes.
    expect(src).toMatch(/\.in\("merchant_id", externalIds\)[\s\S]{0,120}?\.eq\("status", "success"\)/);
    // And genuine-tagged, so a demo parent cannot walk the ladder.
    expect(src).toMatch(/genuineTagged\([\s\S]{0,300}?\.in\("merchant_id", externalIds\)/);
  });

  it("never renders the enrolment count as the ladder", () => {
    const src = pilot();
    // The card that carries the ladder must not read the cohort size.
    expect(src).not.toMatch(/1 → 5 → 10 ladder counts/);
    expect(src).toMatch(/value=\{fmt\(ladderSuccesses\)\}/);
  });

  it("keeps enrolment as its own metric, called what it is", () => {
    const src = pilot();
    expect(src).toContain("External merchants enrolled");
    expect(src).toMatch(/never a rung on it/);
  });

  it("counts the ladder cumulatively, not inside the display window", () => {
    // A windowed ladder would walk backwards as a success aged out of 7 days.
    const src = pilot();
    const m = src.match(/const ladderRes =[\s\S]*?;\n/);
    expect(m, "ladder read not found").not.toBeNull();
    expect(m![0]).not.toContain("since");
  });

  it("treats an empty cohort as a true zero and a failed read as unknown", () => {
    const src = pilot();
    expect(src).toMatch(/ladderRes === null \? 0 : ladderRes\.error \? null : ladderRes\.count \?\? 0/);
  });
});

describe("the brief states the scope its queries actually carry", () => {
  it("does not claim Node 0 for reads that have no node predicate", () => {
    const src = stripComments(readFileSync(path.join(process.cwd(), PAGES[1]), "utf8"));
    // The all-class section previously said "at Node 0" while claimsIn,
    // verifiedIn, arrivals, Fast Visits and fees carried no node filter.
    expect(src).not.toMatch(/genuine-tagged merchant at Node 0/);
    expect(src).toMatch(/marketplace-wide/);
  });

  it("never interpolates a possibly-undefined delta into a hint", () => {
    // `All classes. ${delta(...)}` rendered the literal "All classes. undefined"
    // when either side of the comparison failed to read.
    const src = stripComments(readFileSync(path.join(process.cwd(), PAGES[1]), "utf8"));
    expect(src).not.toMatch(/\$\{delta\(/);
    expect(src).toContain("withAllClasses(");
  });
});

describe("current-state snapshots are not filed under yesterday's date", () => {
  /**
   * Codex round 11. `merchantsLive` inspects merchant state now, and
   * `visibleDeals` compares `expires_at` against this instant — neither is a
   * figure for the displayed day. I grouped both under a heading ending in
   * yesterday's date while fixing the P1, so a reload could attribute this
   * morning's supply change to yesterday and the brief stopped being
   * reproducible.
   *
   * Fixed with a separate heading rather than a caveat on the cards, because a
   * reader scans headings and skips hints.
   */
  const brief = () =>
    stripComments(readFileSync(path.join(process.cwd(), PAGES[1]), "utf8"));

  it("puts every snapshot card under the snapshot heading", () => {
    const src = brief();
    const snapshotIdx = src.indexOf(">Right now<");
    const datedIdx = src.indexOf("All genuine-tagged activity");
    expect(snapshotIdx).toBeGreaterThan(-1);
    expect(datedIdx).toBeGreaterThan(-1);
    const snapshotSection = src.slice(snapshotIdx, datedIdx);
    // All three current-state figures, including enrolment — which is neither
    // activity from the displayed day nor derived through the genuine-tagged
    // predicate, and moves the moment a merchant joins the manifest.
    expect(snapshotSection).toContain("Merchants live");
    expect(snapshotSection).toContain("Shopper-visible deals");
    expect(snapshotSection).toContain("External merchants enrolled");
  });

  it("keeps current-state cards out of the dated section", () => {
    const src = brief();
    const dated = src.slice(src.indexOf("All genuine-tagged activity"));
    expect(dated).not.toContain('label="Merchants live"');
    expect(dated).not.toContain('label="Shopper-visible deals"');
    expect(dated).not.toContain('label="External merchants enrolled"');
  });

  it("says out loud that the snapshot is not a figure for the displayed day", () => {
    expect(readFileSync(path.join(process.cwd(), PAGES[1]), "utf8")).toMatch(
      /not figures for \{label\}/
    );
  });
});

describe("no windowed heading covers a figure that has no window", () => {
  /**
   * The audit behind Codex round 12. Every card was checked against the time
   * basis of the query behind it, on both pages, rather than fixing the two
   * that were reported:
   *
   * | Figure | Real basis |
   * |---|---|
   * | ladder | cumulative, all time |
   * | cohort counts, enrolment | current |
   * | visible deals (both pages) | current snapshot |
   * | claims/arrivals/verified/fees | windowed or dated |
   *
   * Three headings previously spanned a mix. A heading that claims a period
   * its figures do not have makes the page irreproducible — reload it and a
   * "last 7 days" number moves.
   */
  const pilot = () =>
    stripComments(readFileSync(path.join(process.cwd(), PAGES[0]), "utf8"));

  it("keeps supply out of the windowed evidence section on /admin/pilot", () => {
    const src = pilot();
    const windowedIdx = src.indexOf("External field validation · last {days} days");
    const internalIdx = src.indexOf("Internal and unclassified");
    expect(windowedIdx).toBeGreaterThan(-1);
    const windowed = src.slice(windowedIdx, internalIdx);
    expect(windowed).not.toContain("Shopper-visible deals");
  });

  it("gives pilot supply its own snapshot heading", () => {
    const src = pilot();
    expect(src).toContain("External field validation · supply right now");
    expect(src).toMatch(/not a figure for the last \{days\}/);
  });

  it("labels the unwindowed evidence grid rather than leaving it headless", () => {
    // The ladder is cumulative and the cohort counts are current; neither
    // moves with the day selector, and nothing said so.
    const src = pilot();
    expect(src).toContain("Evidence · not windowed");
    expect(src).toMatch(/None of these move with the \{days\}-day selector/);
  });

  it("marks the internal/unclassified supply column as a snapshot", () => {
    const src = pilot();
    expect(src).toMatch(/Visible deals<span[\s\S]{0,80}?\(now\)/);
  });
});

describe("synthetic supply is never counted as field evidence", () => {
  /**
   * Codex round 12: `includeDemo: demoMode.enabled` let a demo-tagged deal on
   * an enrolled non-demo merchant count in the external evidence card while
   * demo mode is on — synthetic supply presented as field validation.
   *
   * Two counts now, because two different questions are asked. The no-supply
   * DIAGNOSIS must include demo deals (a shopper really can see them, so
   * alerting "no shopper-visible supply" would be false); the EVIDENCE card
   * must exclude them (a synthetic deal is never field validation).
   */
  const pilot = () =>
    stripComments(readFileSync(path.join(process.cwd(), PAGES[0]), "utf8"));

  it("reads the evidence card from the genuine-only count", () => {
    expect(pilot()).toContain("byClass.external.genuineVisibleDeals");
  });

  it("keeps a demo-inclusive count for the no-supply diagnosis", () => {
    // Both must exist; collapsing them makes one of the two questions wrong.
    const src = pilot();
    expect(src).toMatch(/includeDemo: demoMode\.enabled/);
    expect(src).toMatch(/includeDemo: false/);
    expect(src).toContain("genuineVisibleDeals: count(genuineVisibleDealsRes)");
  });

  it("never renders the demo-inclusive count as evidence", () => {
    const src = pilot();
    // The evidence cards and the class table must not read shopperVisibleDeals.
    const evidenceIdx = src.indexOf("External field validation · supply right now");
    const alertsIdx = src.indexOf("Needs attention");
    expect(src.slice(evidenceIdx, alertsIdx)).not.toContain(
      "external.shopperVisibleDeals"
    );
  });
});

describe("the founder dashboard teaser matches what the brief reports", () => {
  it("does not advertise supply as yesterday's change", () => {
    const src = stripComments(
      readFileSync(path.join(process.cwd(), "src/app/founder/page.tsx"), "utf8")
    );
    expect(src).not.toMatch(/What changed yesterday: supply/);
    expect(src).toMatch(/snapshot,\s*not as yesterday/);
  });
});
