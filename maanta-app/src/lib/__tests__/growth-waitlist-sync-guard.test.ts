import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "@/lib/__tests__/helpers/comment-stripping";

const APP = path.resolve(__dirname, "../..");
const SYNC = path.join(APP, "app/api/admin/growth/waitlist/sync/route.ts");
const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260904130000_waitlist_supabase_mirror.sql"
);

const syncSource = stripComments(readFileSync(SYNC, "utf8"));
const migrationSql = readFileSync(MIGRATION, "utf8");

/**
 * The backfill is the only way a pre-cutover signup reaches the mirror, and it
 * is not reachable by a unit test — it needs Resend and a database. These are
 * source ratchets on the two mistakes that made it silently import nobody.
 */
describe("waitlist sync — the backfill can actually insert", () => {
  // `resend_status` is NOT NULL with no DEFAULT, deliberately. Omitting it from
  // the insert payload made every new contact fail 23502, the route counted it
  // as `failed`, and the dry run (the default) skipped the write entirely and
  // reported failed:0 — so the operator got no warning before confirming.
  it("supplies resend_status, which the table requires and never defaults", () => {
    expect(migrationSql).toMatch(/resend_status\s+TEXT NOT NULL/);
    expect(migrationSql).not.toMatch(/resend_status\s+TEXT NOT NULL[^,]*DEFAULT/);
    expect(syncSource).toMatch(/resend_status:\s*"already_exists"/);
  });

  // A blind upsert's DO UPDATE overwrites every payload column, which would
  // rewrite a live public_form row's provenance and reset the population flag
  // from whatever Resend happened to hold — laundering a real signup into the
  // test population, or the reverse (the D188 failure mode).
  it("never lets a sync overwrite the public form's own record", () => {
    expect(syncSource).not.toMatch(/\.upsert\(/);
    expect(syncSource).toMatch(/\.update\(patch\)/);
    // The columns Resend owns, and only those.
    expect(syncSource).toMatch(/signup_source:\s*"backfill"/);
    const updateCall = syncSource.slice(syncSource.indexOf(".update(patch)"));
    for (const owned of ["signup_source:", "is_test:", "segment:", "consent_at:"]) {
      expect(updateCall.slice(0, 400)).not.toContain(owned);
    }
  });

  it("treats a duplicate address as the patch path, not a failure", () => {
    expect(syncSource).toMatch(/23505/);
  });

  // Reading several hundred people's personal data out of Resend is the reveal
  // route's class of act. The audit must land before the walk, not after.
  it("audits before it acts, and refuses when the audit cannot be written", () => {
    // Call sites, not the import line at the top of the file.
    const auditAt = syncSource.indexOf('.from("admin_ops_log")');
    const walkAt = syncSource.indexOf("await listAudienceContacts(");
    expect(auditAt).toBeGreaterThan(-1);
    expect(walkAt).toBeGreaterThan(auditAt);
    expect(syncSource).toMatch(/Could not record the sync, so it did not run/);
  });

  // A unique violation on this table renders the address verbatim (SEC-011).
  it("never logs an error message from an email-keyed write", () => {
    for (const m of syncSource.matchAll(/console\.error\(([^;]*)\)/g)) {
      expect(m[1]).not.toContain(".message");
    }
  });
});
