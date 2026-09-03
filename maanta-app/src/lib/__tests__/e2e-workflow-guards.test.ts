import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAUD_REVIEW_FILTERS, fraudReviewHref } from "@/lib/admin-action-queue";

/**
 * The two browser-suite workflows carry safety properties that are invisible
 * in the diff that removes them, so they are pinned here.
 *
 * `e2e.yml` drives the money loop — a real claim and a real verified
 * redemption, charging the KES 30 success fee. It is pinned to `main` so a
 * manual dispatch can never run arbitrary branch code with its secrets, and it
 * refuses a production host before checkout.
 *
 * `e2e-admin-founder.yml` is read-only and exists to verify a PR's own preview
 * before merge, so it *must* be dispatchable on a PR ref — the opposite trade.
 * What keeps that safe is the set of properties below: dispatch-only (never
 * `pull_request`, so a fork cannot start it), a protected environment separate
 * from the money suite's, a production refusal before any repository code
 * runs, and a required admin state so the suite cannot self-skip to a green
 * job that tested nothing.
 *
 * The repository is public and the storage states are live Clerk sessions on
 * production identities. That is why these are ratchets and not conventions.
 */

const root = join(process.cwd(), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const GOLDEN = ".github/workflows/e2e.yml";
const ADMIN_FOUNDER = ".github/workflows/e2e-admin-founder.yml";

describe("the golden-path E2E workflow keeps its money-path gates", () => {
  const wf = read(GOLDEN);

  it("refuses a production target before checkout", () => {
    expect(wf).toMatch(/\*maanta\.app\*\)/);
    expect(wf).toMatch(/exit 1/);
    // The guard step must precede the checkout, or it guards nothing.
    expect(wf.indexOf("Guard the E2E target")).toBeLessThan(wf.indexOf("actions/checkout"));
  });

  it("still runs only on main, so a dispatch cannot run branch code with its secrets", () => {
    expect(wf).toMatch(/github\.ref == 'refs\/heads\/main'/);
  });

  it("is never triggered by a pull request", () => {
    expect(wf).not.toMatch(/^\s*pull_request:/m);
  });

  it("binds the secret-bearing job to a protected environment", () => {
    expect(wf).toMatch(/environment: e2e\b/);
  });
});

/** YAML with `#` comment lines removed — for rules about what the file DOES. */
const stripYamlComments = (src: string) =>
  src
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

describe("the admin/founder acceptance workflow is dispatch-only and fails closed", () => {
  const wf = read(ADMIN_FOUNDER);
  const code = stripYamlComments(wf);

  it("is startable only by a manual dispatch — never a pull request or a push", () => {
    expect(wf).toMatch(/workflow_dispatch:/);
    // A `pull_request` trigger would hand the storage states to anyone who can
    // open a PR from a fork. A `push` trigger would do the same for a branch.
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).not.toMatch(/^on:[\s\S]*?^\s{2}push:/m);
  });

  it("runs under an environment separate from the money suite, capping the blast radius", () => {
    expect(wf).toMatch(/environment: e2e-readonly/);
    // What matters is whether the workflow READS those secrets, not whether it
    // names them: the comment block explains the blast radius by naming both,
    // and a guard that failed on the explanation would teach the next author to
    // delete the explanation rather than keep the rule (cf. D38 and
    // `helpers/comment-stripping.ts`, the same trap in the TypeScript guards).
    expect(code).not.toMatch(/secrets\.E2E_SHOPPER_STORAGE/);
    expect(code).not.toMatch(/secrets\.E2E_MERCHANT_STORAGE/);
  });

  it("refuses a production target before any repository code runs", () => {
    expect(wf).toMatch(/\*maanta\.app\*\)/);
    expect(wf.indexOf("Guard the target")).toBeLessThan(wf.indexOf("actions/checkout"));
    // https only, so a plaintext or file target cannot slip through.
    expect(wf).toMatch(/must be an https origin/);
  });

  it("treats a missing admin storage state as an error, not a quiet skip", () => {
    expect(wf).toMatch(/E2E_ADMIN_STORAGE is missing/);
    expect(wf).toMatch(/Require the admin storage state/);
  });

  it("asserts the suite ran, and allows only the co-founder boundary to skip", () => {
    expect(wf).toMatch(/Assert the suite actually ran/);
    expect(wf).toMatch(/No specs ran at all/);
    // With a co-founder state supplied, its skip is a failure like any other.
    expect(wf).toMatch(/haveCofounder \|\| !COFOUNDER\.test/);
    // And an 11-of-12 must never be reported as a full pass.
    expect(wf).toMatch(/never as a full pass/);
  });

  it("exposes the storage states to the steps that need them, not job-wide", () => {
    // A job-level `env:` carrying a secret would expose it to checkout and the
    // installs as well. Only the target URL is job-level here.
    const jobEnv = wf.slice(wf.indexOf("environment: e2e-readonly"), wf.indexOf("steps:"));
    expect(jobEnv).not.toMatch(/E2E_ADMIN_STORAGE/);
    expect(jobEnv).not.toMatch(/E2E_COFOUNDER_STORAGE/);
  });
});

/**
 * The acceptance spec the workflow above runs.
 *
 * Its 12-of-12 result is what closes D240, so two of its properties are
 * load-bearing rather than stylistic: a test that could not exercise its
 * subject must fail rather than annotate itself green (D256), and its
 * destination assertion must accept every destination the queue can actually
 * produce — including the bare `/admin/redemptions` that D250 sends an
 * unfilterable fraud type to on purpose (D257). Both drift silently: nothing
 * in a browser run tells you the spec has stopped agreeing with the product.
 */
describe("the admin/founder acceptance spec proves what its count claims", () => {
  const spec = read("maanta-app/e2e/admin-founder-redesign.spec.ts");

  it("fails the drill-down when the queue is empty, rather than annotating a pass", () => {
    // The old shape recorded a note and passed. If it comes back, a 12/12 can
    // again mean eleven proofs and one skipped subject.
    expect(spec).not.toMatch(/drill-down not exercised/);
    expect(spec).toMatch(/toBeGreaterThan\(0\)/);
    expect(spec).toMatch(/do not count this suite as 12\/12 without it/);
  });

  it("accepts every destination the Action Queue can emit for a fraud item", () => {
    // Extract the spec's own regex rather than restating it, so the assertion
    // under test is the one that ships.
    // No /s flag: the repo's tsc target rejects it (the same trap the D241
    // guard hit), so the class does the work instead.
    const m = spec.match(/expect\(href\)\.toMatch\(\s*\/([\s\S]+?)\/\s*\)/);
    expect(m, "the drill-down destination assertion was not found").toBeTruthy();
    const destination = new RegExp(m![1]);

    // Every filter the destination implements, plus types it does not — the
    // four `fraud_events` allows that `/admin/redemptions` has no pill for.
    const types = [
      ...FRAUD_REVIEW_FILTERS,
      "otp_abuse",
      "device_blacklist",
      "merchant_override",
      "code_rejected",
    ];
    for (const t of types) {
      expect(fraudReviewHref(t), `destination for ${t}`).toMatch(destination);
    }
    // And the record destinations the other rules emit.
    expect("/admin/merchants/0f7d2c11-1111-4444-8888-aaaaaaaaaaaa").toMatch(destination);
    expect("/admin/operations").toMatch(destination);

    // Still a real assertion: a bare directory is the "list, not a record"
    // failure the test is named for, and widening for D250 must not admit it.
    expect("/admin/merchants").not.toMatch(destination);
    expect("/admin/deals").not.toMatch(destination);
    expect("/admin/queue").not.toMatch(destination);
  });
});
