import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * D164 — the "Claims (7d)" KPI.
 *
 * Found in production on 2026-08-23: both dashboards counted claims with
 * `.gte("created_at", since7d)` against `public.redemptions`, a column that has
 * never existed. The two surfaces failed in different, equally bad ways:
 *
 *   * `/admin` discarded the error and rendered a confident **0** next to a
 *     genuine "Verified (7d) 1".
 *   * `/founder` shared one Promise.all with every other metric, so the error
 *     tripped its D149 read-failure guard and took the WHOLE dashboard down —
 *     every visit showed "Could not load the dashboard".
 *
 * A runtime test cannot catch this class of bug: the filter is a string handed
 * to PostgREST, so a wrong column name type-checks, builds, and only fails
 * against a real database. These are therefore source assertions — the same
 * shape as the repo's other ratchets (see `claim_deal_otp_csprng_test.sql`
 * Scenario A). The behavioural half lives in
 * `supabase/tests/redemptions_claimed_at_test.sql`, which runs against a real
 * Postgres in CI's db-tests job.
 */

const root = join(__dirname, "..", "..");
const admin = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
const founder = readFileSync(join(root, "app/founder/page.tsx"), "utf8");
const migration = readFileSync(
  join(root, "..", "supabase/migrations/20260824130000_redemptions_claimed_at.sql"),
  "utf8"
);
/**
 * The third consumer of the phantom column, and the only shopper-facing one:
 * it ordered a redemptions lookup by `created_at`, so the query errored, the
 * shopper's existing pending ticket came back undefined, and the page offered
 * "Claim deal" to someone who already held one — a 409 on tap, with the API
 * backstop covering a broken screen.
 */
const shopperDeal = readFileSync(
  join(root, "app/(shopper)/deals/[id]/page.tsx"),
  "utf8"
);

/**
 * The third KPI surface, found by the 2026-08-25 all-screens audit.
 *
 * `/admin/reports` had the identical defect and had simply never been covered:
 * five reads destructured straight off `Promise.all` with every `error`
 * discarded, so one failed query rendered "Verified redemptions 0" and
 * "Success-fee revenue **KES 0**" as confident statements about the business.
 * D149 fixed this shape on /founder and D164 on /admin; this is the surface
 * that puts the zero next to money.
 */
// The report moved into one shared component on 2026-09-03 so /admin/reports
// and /founder/reports render the same money the same way; the guard follows
// the reads, which is where the defect lived.
const adminReports = readFileSync(
  join(root, "components/admin/platform-report.tsx"),
  "utf8"
);

/** The columns `public.redemptions` actually has, per the migration chain. */
const REDEMPTION_COLUMNS = [
  "id", "deal_id", "merchant_id", "user_id", "otp_code", "success_fee_charged",
  "consumer_device_id", "merchant_device_id", "distance_from_shop", "status",
  "fraud_flags", "review_required", "expires_at", "redeemed_at", "consumer_gps",
  "amount_kes", "is_demo", "demo_batch_id", "demo_source", "claimed_at",
];

/**
 * Every column a redemptions query filters or orders on.
 *
 * Deliberately window-based rather than delimiter-based. Two earlier attempts
 * tried to find where the query "ends" — a nested-array boundary, then a
 * semicolon — and BOTH silently captured nothing, because these calls sit
 * inside a `Promise.all([...])` where neither terminator appears nearby. A
 * matcher that finds nothing makes every assertion below pass vacuously, which
 * is precisely the failure mode this file exists to prevent, so the window is
 * capped and the tests assert a non-empty result before checking anything.
 */
function redemptionFilters(source: string): string[] {
  const found: string[] = [];
  // Two shapes filter `redemptions` in this codebase: a literal
  // `from("redemptions")` chain, and the founder page's `genuineCount((q) =>
  // q.<filter>(...))`, which applies its filters to a `from("redemptions")`
  // built once in `baseCount`. The second shape is where every founder
  // redemption filter now lives (D243 moved the last direct read there), so
  // reading only the first left this guard with nothing to check — which its
  // own non-empty assertion caught.
  const anchor = /from\("redemptions"\)|genuineCount\(\(q\) =>/g;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(source))) {
    const rest = source.slice(m.index + m[0].length);
    // Stop at the next table or the next genuineCount so one query's window
    // cannot bleed into another. 900 chars, not 400: this repo puts long
    // explanatory comments between chained calls, and a tighter window dropped
    // the shopper page's .order().
    const next = rest.search(/from\("[a-z_]+"\)|genuineCount\(\(q\) =>/);
    const window = rest.slice(0, next === -1 ? 900 : Math.min(next, 900));
    const f = /\.(?:gte|lte|gt|lt|eq|order)\("([a-z_]+)"/g;
    let g: RegExpExecArray | null;
    while ((g = f.exec(window))) found.push(g[1]);
  }
  return found;
}

describe("D164 — Claims (7d) counts a column that exists", () => {
  it("admin filters redemptions only on real columns", () => {
    const cols = redemptionFilters(admin);
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) {
      expect(REDEMPTION_COLUMNS, `/admin filters redemptions.${c}, which does not exist`).toContain(c);
    }
  });

  it("founder filters redemptions only on real columns", () => {
    const cols = redemptionFilters(founder);
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) {
      expect(REDEMPTION_COLUMNS, `/founder filters redemptions.${c}, which does not exist`).toContain(c);
    }
  });

  it("neither dashboard still filters redemptions.created_at — the exact defect", () => {
    expect(redemptionFilters(admin)).not.toContain("created_at");
    expect(redemptionFilters(founder)).not.toContain("created_at");
  });

  it("the shopper deal page orders its ticket lookup on a real column", () => {
    const cols = redemptionFilters(shopperDeal);
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) {
      expect(
        REDEMPTION_COLUMNS,
        `deals/[id] touches redemptions.${c}, which does not exist`
      ).toContain(c);
    }
    expect(cols).not.toContain("created_at");
  });

  it("the shopper ticket lookup does NOT order by claimed_at — NULLs would sort first", () => {
    // Pre-migration rows have claimed_at NULL, and Postgres DESC puts NULLs
    // first, so ordering on it would surface a stale ticket as the newest.
    // redeemed_at is NOT NULL DEFAULT now() and, while pending, IS the claim time.
    expect(shopperDeal).toContain('.order("redeemed_at", { ascending: false })');
  });

  it("both dashboards use the SAME claim definition, so the two never disagree", () => {
    expect(admin).toContain('.gte("claimed_at", since7d)');
    expect(founder).toContain('.gte("claimed_at", since7d)');
  });
});

describe("D164 — a failed read can no longer look like a real zero", () => {
  it("admin inspects query errors instead of destructuring them away", () => {
    // The regression was `const [{ count: claims7d }, …] = await Promise.all(…)`,
    // which throws every `error` on the floor.
    expect(admin).toMatch(
      /const \[results, claimsTrackingRes(?:,[^\]]+)?\] = await Promise\.all\(/
    );
    expect(admin).toMatch(/results\.find\(\(r\) => \(r as \{ error\?: unknown \}\)\.error\)/);
  });

  it("admin renders the shared honest-error component, not a zeroed dashboard", () => {
    expect(admin).toContain("LeadsReadError");
    expect(admin).toMatch(/read error, not zeroed metrics/);
  });

  it("founder keeps its existing D149 guard", () => {
    expect(founder).toMatch(/find\(\(r\) => r\.error\)/);
    expect(founder).toContain("LeadsReadError");
  });
});

describe("D164 — the SQL fixture cleans up only what it created", () => {
  const sql = readFileSync(
    join(root, "..", "supabase/tests/redemptions_claimed_at_test.sql"),
    "utf8"
  );

  /**
   * These suites run against a database that also holds seeded demo data, so a
   * cleanup wide enough to catch someone else's rows is a data-loss bug wearing
   * a test's clothes. Every DELETE must be scoped to an id the fixture itself
   * created — never a bare table sweep, and never a predicate broad enough to
   * match a row the fixture did not insert.
   */
  it("has no unscoped DELETE", () => {
    const deletes = sql.match(/DELETE FROM[^;]*;/gi) ?? [];
    expect(deletes.length).toBeGreaterThan(0);

    const unscoped = deletes.filter((d) => !/\bWHERE\b/i.test(d));
    expect(unscoped, `unscoped DELETE(s): ${unscoped.join(" | ")}`).toEqual([]);
  });

  it("scopes every DELETE to a fixture-local variable, not a literal or a broad column", () => {
    const deletes = sql.match(/DELETE FROM[^;]*;/gi) ?? [];
    // Every fixture id is a `v_*` PL/pgSQL variable assigned by
    // `INSERT ... RETURNING id INTO`, so it can only ever match this run's rows.
    const bad = deletes.filter((d) => !/=\s*v_[a-z_]+|IN\s*\(\s*v_[a-z_]+/i.test(d));
    expect(bad, `DELETE not scoped to a fixture id: ${bad.join(" | ")}`).toEqual([]);
  });

  it("never truncates or drops", () => {
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
  });
});

describe("D164 — the migration keeps history honest", () => {
  it("adds claimed_at without a default, then sets the default separately", () => {
    // One `ADD COLUMN ... DEFAULT now()` would backfill every historical row
    // with the migration timestamp — a fabricated claim time on an audit record.
    const addIdx = migration.indexOf("ADD COLUMN IF NOT EXISTS claimed_at");
    const defIdx = migration.indexOf("ALTER COLUMN claimed_at SET DEFAULT now()");
    expect(addIdx).toBeGreaterThan(-1);
    expect(defIdx).toBeGreaterThan(addIdx);

    const addStatement = migration.slice(addIdx, migration.indexOf(";", addIdx));
    expect(addStatement.toLowerCase()).not.toContain("default");
  });

  it("leaves the column nullable so unknown historical claims stay unknown", () => {
    expect(migration).not.toMatch(/claimed_at[\s\S]{0,40}NOT NULL/i);
  });

  it("does not backfill historical rows from an unrelated timestamp", () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.redemptions/i);
    expect(migration).not.toMatch(/claimed_at\s*=\s*(expires_at|redeemed_at)/i);
  });

  it("indexes the column the KPI filters on", () => {
    expect(migration).toMatch(/CREATE INDEX[\s\S]{0,80}redemptions \(claimed_at\)/i);
  });

  it("does not touch claim_deal — the audited RPC body stays byte-identical", () => {
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION[\s\S]{0,40}claim_deal/i);
  });
});

/**
 * D164 follow-up — the read-failure guard must scan the metric reads and
 * *only* the metric reads.
 *
 * `/founder` had this right from the start: it lists the guarded results by
 * name and leaves `claimsTrackingRes` out, with a comment saying why. `/admin`
 * carried the same comment — "Deliberately NOT part of the readFailed check" —
 * above a `results.find(…)` that scanned the entire `Promise.all` result,
 * claims-tracking read included. The comment described the intent; the code did
 * the opposite, so a failed `app_config` read would have blanked the console
 * that the rest of D164 exists to keep truthful, and the two dashboards would
 * have disagreed about what counts as broken.
 *
 * The exclusion is now structural on both pages — a separate array literal, not
 * a slice or an index — and this is the ratchet that keeps it that way.
 *
 * **Why the capture is written like this.** The same trap as
 * `redemptionFilters` above, one level harder: these arrays contain nested
 * `Promise.all([…])`, object literals, arrow functions and template strings, so
 * a regex "up to the next `]`" stops at the first inner bracket and a regex
 * "up to the last `]`" swallows the rest of the file. Both fail *open* — a
 * capture that is empty or wrong makes every assertion below pass vacuously,
 * which is the exact failure mode D164 was. So: comments stripped through the
 * repo's single shared lexer (D38 — never write a second one, a private `//`
 * stripper is how that drift returns), brackets matched with string-aware
 * depth counting, and a **non-empty, plausibly-shaped capture asserted first**
 * before any exclusion is checked.
 */

/** Top-level entries in a captured array literal — the two dashboards spell
 * their sets differently (`/admin` holds the query builders inline, `/founder`
 * holds named result identifiers), so entry count is the one shape check that
 * means the same thing on both. */
function topLevelEntries(capture: string): number {
  let depth = 0;
  let quote: string | null = null;
  let commas = 0;
  let sawContent = false;

  for (let i = 0; i < capture.length; i++) {
    const ch = capture[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      sawContent = true;
      continue;
    }
    if (ch === "[" || ch === "(" || ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "]" || ch === ")" || ch === "}") {
      depth -= 1;
      continue;
    }
    if (ch === "," && depth === 1) commas += 1;
    else if (depth === 1 && ch.trim() !== "") sawContent = true;
  }
  // Trailing commas are the house style, so entries === commas when there is
  // content at all. Counting commas alone would report 0 for a one-entry array.
  return sawContent && commas === 0 ? 1 : commas;
}

/** The array literal starting at `openIdx`, matched with depth, ignoring brackets in strings. */
function balancedFrom(src: string, openIdx: number): string {
  let depth = 0;
  let quote: string | null = null;

  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];

    if (quote) {
      if (ch === "\\") i += 1; // escape: consume the next char verbatim
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[" || ch === "(" || ch === "{") depth += 1;
    else if (ch === "]" || ch === ")" || ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return ""; // unbalanced — reported as an empty capture, never as a pass
}

/**
 * The set of reads `/admin`'s `readFailed` actually scans.
 *
 * Anchored on the assignment that produces `results`, then descending one level
 * if the first element is itself a `Promise.all([`. Written to resolve on BOTH
 * shapes on purpose — the pre-fix `const results = await Promise.all([` and the
 * fixed `const [results, claimsTrackingRes] = await Promise.all([Promise.all([`
 * — so that against the old source this returns the array that really was
 * scanned, and the exclusion assertion fails on its merits instead of erroring
 * on a missing anchor.
 */
function adminGuardedSet(source: string): string {
  const src = stripComments(source);
  const anchor = /const \[?results\b[^=]*=\s*await Promise\.all\(/.exec(src);
  if (!anchor) return "";

  const open = src.indexOf("[", anchor.index + anchor[0].length - 1);
  if (open === -1) return "";

  const inner = /^\s*Promise\.all\(\s*\[/.exec(src.slice(open + 1));
  if (inner) {
    const nested = src.indexOf("[", open + 1 + inner[0].length - 1);
    return balancedFrom(src, nested);
  }
  return balancedFrom(src, open);
}

/** The same set on `/founder`, which spells it out as its own literal. */
function founderGuardedSet(source: string): string {
  const src = stripComments(source);
  const anchor = src.indexOf("const readFailed = [");
  if (anchor === -1) return "";
  return balancedFrom(src, src.indexOf("[", anchor));
}

describe("D164 — the claims-tracking read is excluded from the guard, on BOTH dashboards", () => {
  const sets: ReadonlyArray<readonly [string, string, string]> = [
    ["/admin", adminGuardedSet(admin), admin],
    ["/founder", founderGuardedSet(founder), founder],
  ];

  for (const [name, guarded, source] of sets) {
    it(`${name} captures a non-empty, plausible guarded set`, () => {
      // Asserted before anything else: an empty or truncated capture would make
      // the exclusion test below pass while saying nothing at all.
      expect(guarded, `${name}: could not capture the guarded set`).not.toBe("");
      expect(guarded.startsWith("["), `${name}: capture is not an array literal`).toBe(true);
      expect(guarded.endsWith("]"), `${name}: capture is not balanced`).toBe(true);
      // The real set holds every KPI read; a handful is the floor, not the count,
      // so adding or removing a metric does not churn this test.
      expect(
        topLevelEntries(guarded),
        `${name}: capture holds too few entries to be the guarded set`
      ).toBeGreaterThanOrEqual(5);
    });

    it(`${name} does not scan the claims-tracking config read for errors`, () => {
      expect(
        guarded,
        `${name}: the app_config claims-tracking read is inside the readFailed set — ` +
          "a missing or failed config row would blank the dashboard, which is the " +
          "opposite of what its own comment promises"
      ).not.toContain("CLAIMS_TRACKING_CONFIG_KEY");
    });

    it(`${name} still performs the claims-tracking read and feeds claimsWindow`, () => {
      // The exclusion must be achieved by moving the read out of the guarded
      // set, never by deleting the read — which would satisfy the test above
      // and silently take the honest "partial window" label with it.
      const src = stripComments(source);
      expect(src, `${name}: no longer reads the claims-tracking config at all`).toContain(
        "CLAIMS_TRACKING_CONFIG_KEY"
      );
      expect(src, `${name}: no longer derives its window from claimsWindow()`).toContain(
        "claimsWindow("
      );
    });
  }
});

describe("D164 (audit 2026-08-25) — every KPI surface guards its reads", () => {
  /**
   * Deliberately enumerated rather than globbed. A glob would silently pass on
   * the day someone adds a fourth dashboard, which is precisely how
   * /admin/reports went two rulings without the guard: nothing was watching the
   * set, only its known members.
   */
  const KPI_SURFACES: ReadonlyArray<readonly [string, string]> = [
    ["/admin", admin],
    ["/founder", founder],
    ["/admin/reports", adminReports],
  ];

  for (const [name, source] of KPI_SURFACES) {
    it(`${name} inspects read errors rather than discarding them`, () => {
      const src = stripComments(source);
      expect(src, `${name}: no read-failure check at all`).toMatch(
        /readFailed|\.find\(\(r\) =>[\s\S]{0,40}error/
      );
    });

    it(`${name} renders the shared honest-error component`, () => {
      // The same component everywhere, so an operator learns one failure shape.
      expect(source, `${name}: does not render LeadsReadError`).toContain("LeadsReadError");
      expect(source, `${name}: missing the "not zeroed metrics" wording`).toMatch(
        /read error, not zeroed metrics/
      );
    });
  }

  it("admin/reports does not destructure its metrics before checking for errors", () => {
    // The exact regression: `const [{ count: verified }, …] = await Promise.all(…)`.
    const src = stripComments(adminReports);
    expect(
      src,
      "/admin/reports destructures straight off Promise.all again — a failed " +
        "read would render KES 0 revenue as a real figure"
      // Matches a DESTRUCTURING assignment only — `] = await Promise.all(` or
      // `} = await Promise.all(`. A plain `const results = await Promise.all(`
      // is the fixed shape and must still pass.
    ).not.toMatch(/[\]}]\s*=\s*await Promise\.all\(/);
    expect(src).toMatch(/const results = await Promise\.all\(/);
  });
});
