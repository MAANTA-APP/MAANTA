import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  join(root, "..", "supabase/migrations/20260824120000_redemptions_claimed_at.sql"),
  "utf8"
);

/** The columns `public.redemptions` actually has, per the migration chain. */
const REDEMPTION_COLUMNS = [
  "id", "deal_id", "merchant_id", "user_id", "otp_code", "success_fee_charged",
  "consumer_device_id", "merchant_device_id", "distance_from_shop", "status",
  "fraud_flags", "review_required", "expires_at", "redeemed_at", "consumer_gps",
  "amount_kes", "is_demo", "demo_batch_id", "demo_source", "claimed_at",
];

/** Every `.gte("x", …)`/`.lte`/`.gt`/`.lt` filter inside a redemptions query. */
function redemptionFilters(source: string): string[] {
  const found: string[] = [];
  const re = /from\("redemptions"\)([\s\S]{0,400}?)(?=\n\s*(?:service|\)|\],))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const chunk = m[1];
    const f = /\.(?:gte|lte|gt|lt|eq)\("([a-z_]+)"/g;
    let g: RegExpExecArray | null;
    while ((g = f.exec(chunk))) found.push(g[1]);
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

  it("both dashboards use the SAME claim definition, so the two never disagree", () => {
    expect(admin).toContain('.gte("claimed_at", since7d)');
    expect(founder).toContain('.gte("claimed_at", since7d)');
  });
});

describe("D164 — a failed read can no longer look like a real zero", () => {
  it("admin inspects query errors instead of destructuring them away", () => {
    // The regression was `const [{ count: claims7d }, …] = await Promise.all(…)`,
    // which throws every `error` on the floor.
    expect(admin).toMatch(/const results = await Promise\.all\(/);
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
