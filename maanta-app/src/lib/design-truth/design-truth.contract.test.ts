import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT, CONTRACT_PATH, loadContract, smokeFrames } from "./load";
import { appRoutes, resolveContractRoute } from "./routes";
import {
  CAPTURE_READINESS,
  DRIFT_BLOCKED_ON,
  DRIFT_CLASSIFICATIONS,
  EVIDENCE_SOURCES,
  PROTOTYPE_STATUSES,
  ROLES,
  STATUSES,
} from "./schema";

/**
 * Layer 1 — the static contract test (design/current-reality/README.md).
 *
 * Pure: no network, no database, no browser. It runs on every PR, and it is the
 * only thing standing between "the mirror describes the app" and "the mirror
 * described the app in July". Layer 2 (Playwright) asserts behaviour and needs a
 * seeded environment; everything checkable from disk belongs here.
 *
 * Enum values the mirror does not currently exercise are listed in
 * ALLOWED_UNUSED with a reason, so an unexercised field is a deliberate note
 * rather than a silent hole (README anti-fake-sync 8).
 */

const contract = loadContract();

/** Layer 2's generated spec, asserted here because Layer 1 owns the filesystem. */
const SMOKE_SPEC = "e2e/design-truth-smoke.spec.ts";

/** Enum values with no instance in the mirror today, and why that is expected. */
const ALLOWED_UNUSED: Record<string, string> = {
  "prototypeStatus:blocked-design":
    "No frame is blocked on a design decision today; D-07 is blocked on product, D-03 on code.",
  "prototypeStatus:blocked-product":
    "No frame is blocked on a product decision today — M8 is blocked-code (D-03).",
  "blockedOn:provenance":
    "D-08 was the only provenance drift and it closed when this mirror landed in the repo. A new one would mean another artifact claiming repo truth from outside the repo.",
};

describe("design-truth contract (Layer 1)", () => {
  it("parses against the schema", () => {
    // loadContract() throws with the frame id on failure; reaching here is the
    // assertion. The counts guard against a truncated or half-written mirror.
    expect(contract.frames.length).toBeGreaterThan(0);
    expect(Object.keys(contract.runtimeRules).length).toBeGreaterThan(0);
  });

  it("keeps the truth order fixed: notion, then repo, then design system", () => {
    expect(contract.mirror.truthOrder).toEqual([
      "notion:product-and-current-state",
      "repo:implementation",
      "design-system:visual",
    ]);
  });

  it("declares itself design-authored, not repo-extracted", () => {
    expect(contract.mirror.provenance).toContain("NOT EXTRACTED FROM THE REPO");
  });

  it("resolves every runtimeRule to a rule in runtimeRules", () => {
    const unresolved = contract.frames
      .filter((f) => !(f.runtimeRule in contract.runtimeRules))
      .map((f) => `${f.id} -> ${f.runtimeRule}`);
    expect(unresolved, `Frames referencing an undefined runtime rule:\n  ${unresolved.join("\n  ")}`)
      .toEqual([]);
  });

  it("has no orphan runtime rules", () => {
    const referenced = new Set(contract.frames.map((f) => f.runtimeRule));
    // A rule no frame references is dead prose — it drifts without anything
    // failing. R-FEE-ON-VERIFIED is the documented exception: it states the
    // charge invariant that R-RESOLVE-THEN-CHARGE enforces at the counter.
    const allowedOrphans = new Set(["R-FEE-ON-VERIFIED", "R-VERIFY-ANYWAY"]);
    const orphans = Object.keys(contract.runtimeRules).filter(
      (id) => !referenced.has(id) && !allowedOrphans.has(id)
    );
    expect(orphans, `Runtime rules no frame references:\n  ${orphans.join("\n  ")}`).toEqual([]);
  });

  it("resolves every driftId to a drift row", () => {
    const ids = new Set(contract.drift.map((d) => d.id));
    const unresolved = contract.frames
      .filter((f) => f.driftId && !ids.has(f.driftId))
      .map((f) => `${f.id} -> ${f.driftId}`);
    expect(unresolved, `Frames linking a missing drift row:\n  ${unresolved.join("\n  ")}`).toEqual([]);
  });

  it("resolves every supersedes to a superseded row", () => {
    const ids = new Set(contract.superseded.map((s) => s.id));
    const unresolved = contract.frames
      .filter((f) => f.supersedes && !ids.has(f.supersedes))
      .map((f) => `${f.id} -> ${f.supersedes}`);
    expect(unresolved, `Frames superseding a missing row:\n  ${unresolved.join("\n  ")}`).toEqual([]);
  });

  it("has unique frame, drift and superseded ids", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(contract.frames.map((f) => f.id))).toEqual([]);
    expect(dupes(contract.drift.map((d) => d.id))).toEqual([]);
    expect(dupes(contract.superseded.map((s) => s.id))).toEqual([]);
  });

  it("points every sourceFiles entry at a file that exists on disk", () => {
    const missing: string[] = [];
    for (const frame of contract.frames) {
      for (const rel of frame.sourceFiles) {
        if (!existsSync(path.join(APP_ROOT, rel))) missing.push(`${frame.id} -> ${rel}`);
      }
    }
    expect(
      missing,
      `sourceFiles that do not exist (the mirror is describing deleted or renamed files):\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("resolves every route to a real page in src/app", () => {
    // The check that catches a stale route name. A frame whose route no longer
    // exists is worse than no frame: reviewers navigate to it and conclude the
    // feature is broken.
    const routes = appRoutes();
    const unresolved = contract.frames
      .filter((f) => resolveContractRoute(f.route, routes) === null)
      .map((f) => `${f.id} (${f.name}) -> ${f.route}`);
    expect(
      unresolved,
      `Frame routes with no matching page under src/app:\n  ${unresolved.join("\n  ")}`
    ).toEqual([]);
  });

  it("keeps every founder and admin surface internal-only", () => {
    const leaks = contract.frames
      .filter((f) => (f.role === "founder" || f.role === "admin") && f.captureReadiness !== "internal-only")
      .map((f) => `${f.id} -> ${f.captureReadiness}`);
    expect(leaks, `Ops surfaces that could leak into marketing:\n  ${leaks.join("\n  ")}`).toEqual([]);
  });

  it("never smoke-tests unshipped behaviour", () => {
    const bad = contract.frames.filter((f) => f.status === "design-ahead" && f.smoke).map((f) => f.id);
    expect(bad, `design-ahead frames marked smoke:\n  ${bad.join(", ")}`).toEqual([]);
  });

  it("gives every smoke frame a role, an auth state and an anchor", () => {
    const incomplete = smokeFrames()
      .filter((f) => !f.requiredRole || !f.authState || !(f.expectedHeading || f.expectedAnchor))
      .map((f) => f.id);
    expect(incomplete, `Smoke frames missing test prerequisites:\n  ${incomplete.join(", ")}`).toEqual([]);
  });

  it("exercises every declared enum value, or records why it does not", () => {
    const used = {
      role: new Set(contract.frames.map((f) => f.role)),
      status: new Set(contract.frames.map((f) => f.status)),
      captureReadiness: new Set(contract.frames.map((f) => f.captureReadiness)),
      prototypeStatus: new Set(contract.frames.map((f) => f.prototypeStatus)),
      evidenceSource: new Set(contract.frames.map((f) => f.evidenceSource)),
      authState: new Set(contract.frames.map((f) => f.authState).filter(Boolean)),
      classification: new Set(contract.drift.map((d) => d.classification)),
      blockedOn: new Set(contract.drift.map((d) => d.blockedOn)),
    };
    const declared: [string, readonly string[], Set<unknown>][] = [
      ["role", ROLES, used.role],
      ["status", STATUSES, used.status],
      ["captureReadiness", CAPTURE_READINESS, used.captureReadiness],
      ["prototypeStatus", PROTOTYPE_STATUSES, used.prototypeStatus],
      ["evidenceSource", EVIDENCE_SOURCES, used.evidenceSource],
      ["classification", DRIFT_CLASSIFICATIONS, used.classification],
      ["blockedOn", DRIFT_BLOCKED_ON, used.blockedOn],
    ];
    const unexplained: string[] = [];
    for (const [field, values, seen] of declared) {
      for (const value of values) {
        const key = `${field}:${value}`;
        if (!seen.has(value) && !(key in ALLOWED_UNUSED)) unexplained.push(key);
      }
    }
    expect(
      unexplained,
      `Enum values with no instance and no ALLOWED_UNUSED reason:\n  ${unexplained.join("\n  ")}`
    ).toEqual([]);
  });

  it("records the contract path the smoke layer reads", () => {
    expect(existsSync(path.join(APP_ROOT, CONTRACT_PATH))).toBe(true);
  });

  describe("the smoke layer is driven from the contract", () => {
    const specPath = path.join(APP_ROOT, SMOKE_SPEC);
    const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : null;

    it("has a smoke spec on disk", () => {
      expect(spec, `${SMOKE_SPEC} is missing — smoke-marked frames would sit uncovered`).not.toBeNull();
    });

    it("generates its tests from the frame list, so the count cannot drift", () => {
      // Anti-fake-sync 6: a smoke-marked frame can never sit uncovered. The spec
      // iterates the contract rather than listing cases, so the only way to
      // satisfy this is to keep generating.
      expect(spec).toContain("smokeFrames()");
      expect(spec).toMatch(/for \(const frame of frames\)/);
    });

    it("never re-declares a contract route in the test file", () => {
      // A route literal in the spec means the contract and the test can disagree
      // while both stay green — the exact failure this layer exists to prevent.
      // Dynamic-segment seed mappings are the one allowed mention: they map a
      // contract route to its seed env var and are asserted against the contract
      // by `covers every dynamic route with a seed mapping` below.
      const seedBlock = spec!.slice(spec!.indexOf("const SEED_ENV"), spec!.indexOf("/** Fill `[id]`"));
      const body = spec!.replace(seedBlock, "");
      const leaked = contract.frames
        .filter((f) => f.smoke && body.includes(`"${f.route}"`))
        .map((f) => `${f.id} -> ${f.route}`);
      expect(
        leaked,
        `Routes hardcoded in the smoke spec instead of read from the contract:\n  ${leaked.join("\n  ")}`
      ).toEqual([]);
    });

    it("covers every dynamic route with a seed mapping", () => {
      const dynamic = contract.frames.filter((f) => f.smoke && f.route.includes("["));
      const unmapped = dynamic
        .filter((f) => !spec!.includes(`"${f.route}":`))
        .map((f) => `${f.id} -> ${f.route}`);
      expect(
        unmapped,
        `Smoke frames on a dynamic route with no seed mapping in SEED_ENV:\n  ${unmapped.join("\n  ")}`
      ).toEqual([]);
    });
  });
});
