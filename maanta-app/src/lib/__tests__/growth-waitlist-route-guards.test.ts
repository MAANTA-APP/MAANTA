import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Source-level guards for the 2026-09-05 security review of the waitlist
 * mirror. Each pins a property that a later "tidy-up" would most plausibly
 * undo without noticing why it was there. Same pattern as the sync guard.
 */
const APP = path.resolve(__dirname, "..", "..", "app");
const read = (rel: string) => readFileSync(path.join(APP, rel), "utf8");

describe("public waitlist route", () => {
  const src = read("api/waitlist/route.ts");

  // api_rate_limit_buckets keeps its rows and has no reaper; the address must
  // not be the key (SEC-011), and the key must be bounded.
  it("keys the rate limit on a digest of the address, never the address", () => {
    expect(src).toMatch(/createHash\("sha256"\)\.update\(email/);
    expect(src).not.toMatch(/waitlist:\$\{[^}]*\}:\$\{email/);
    expect(src).toMatch(/\.slice\(0,\s*45\)/);
  });
});

describe("waitlist export route", () => {
  const src = read("api/admin/growth/waitlist/export/route.ts");

  // Bulk personal data leaving the system is the act being audited; if the
  // trail cannot record it, the file is withheld — like revealing a number.
  it("audits before it answers, and refuses when the audit cannot be written", () => {
    expect(src).not.toMatch(/logAdminOp/);
    const audit = src.indexOf('action: "growth.waitlist.export"');
    const response = src.indexOf("new NextResponse(toCsv(");
    expect(audit).toBeGreaterThan(-1);
    expect(response).toBeGreaterThan(audit);
    expect(src.slice(audit, response)).toMatch(/status:\s*503/);
  });

  it("does not record the search term in the audit details", () => {
    const audit = src.indexOf('action: "growth.waitlist.export"');
    expect(src.slice(audit, audit + 600)).not.toMatch(/details:\s*\{[^}]*\bq\b/);
  });
});

describe("lead stage route", () => {
  const src = read("api/admin/growth/leads/[id]/route.ts");

  it("never logs an error message from the leads table", () => {
    expect(src).not.toMatch(/Error\.message/);
    expect(src).toMatch(/code: readError\.code/);
    expect(src).toMatch(/code: writeError\.code/);
  });
});

describe("waitlist sync route", () => {
  const src = read("api/admin/growth/waitlist/sync/route.ts");

  // properties_unreadable is backfill-only by CHECK; an update carrying it into
  // a public_form row would fail that contact on every sync, forever.
  it("never carries properties_unreadable into a public_form row", () => {
    const live = src.indexOf('.eq("signup_source", "public_form")');
    expect(live).toBeGreaterThan(-1);
    expect(src.slice(0, live)).toMatch(/delete livePatch\.properties_unreadable/);
    expect(src).toMatch(/\.update\(patch\)[\s\S]{0,120}\.eq\("signup_source", "backfill"\)/);
  });
});
