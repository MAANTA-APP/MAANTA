import { z } from "zod";

/**
 * Zod mirror of `design/current-reality/frames.schema.json`.
 *
 * The JSON Schema is the published contract shape; this is the runtime parser
 * the repo validates against. Types come from `z.infer` — there is deliberately
 * no hand-maintained parallel `interface`, because a second declaration is
 * exactly how a mirror starts lying.
 *
 * Every `.superRefine` below carries the anti-fake-sync rule number from
 * `design/current-reality/README.md`. Rules 1–7 are structural (a bad mirror
 * cannot parse); rules that need the filesystem live in
 * `design-truth.contract.test.ts`, because a schema cannot see disk.
 */

export const ROLES = ["shopper", "merchant", "agent", "founder", "admin", "public"] as const;
export const STATUSES = ["live", "gated", "blocked", "rehearsal", "design-ahead"] as const;
export const CAPTURE_READINESS = ["safe-now", "after-copy", "after-data", "internal-only"] as const;
export const PROTOTYPE_STATUSES = [
  "clickable",
  "blocked-design",
  "blocked-product",
  "blocked-code",
  "current-not-clickable",
] as const;
export const EVIDENCE_SOURCES = ["repo", "repo+notion", "repo-partial"] as const;
export const AUTH_STATES = [
  "anonymous",
  "authenticated",
  "authenticated-unverified-phone",
  "role-session",
] as const;
export const DRIFT_CLASSIFICATIONS = [
  "current-mismatch",
  "design-ahead",
  "historical",
  "blocked-on-prototype",
] as const;
export const DRIFT_BLOCKED_ON = ["code", "product-decision", "prototype", "provenance", "none"] as const;

const BLOCKED_PROTOTYPE_STATUSES = PROTOTYPE_STATUSES.filter((s) => s !== "clickable");

const stateCoverage = z
  .object({
    covered: z.array(z.string()),
    missing: z.array(z.string()),
  })
  .strict();

const frameBase = z
  .object({
    id: z.string().min(2),
    name: z.string().min(3),
    role: z.enum(ROLES),
    // Next.js app-router path; dynamic segments as [id].
    route: z.string().regex(/^\/([\w\-[\]().]+(\/[\w\-[\]().]+)*)?$/),
    status: z.enum(STATUSES),
    job: z.string().min(12),
    primaryAction: z.string().min(3),
    runtimeRule: z.string().regex(/^R-[A-Z0-9-]+$/),
    states: z.array(z.string()).min(1),
    stateCoverage,
    prototypeStatus: z.enum(PROTOTYPE_STATUSES),
    prototypeBlockedReason: z.string().min(15).optional(),
    prototypeRef: z
      .string()
      .regex(/^(shopper|merchant|agent|founder|admin)\/[a-z]+$/)
      .optional(),
    captureReadiness: z.enum(CAPTURE_READINESS),
    captureReadinessReason: z.string().min(10).optional(),
    evidenceSource: z.enum(EVIDENCE_SOURCES),
    sourceFiles: z.array(z.string().regex(/^src\//)).min(1),
    canvasRef: z.string().optional(),
    supersedes: z.string().optional(),
    driftId: z.string().regex(/^D-\d{2}$/).optional(),
    notes: z.string().optional(),
    smoke: z.boolean(),
    expectedHeading: z.string().min(2).optional(),
    expectedAnchor: z.string().min(2).optional(),
    redirectTarget: z.string().regex(/^\//).optional(),
    requiredRole: z.string().min(3).optional(),
    authState: z.enum(AUTH_STATES).optional(),
  })
  .strict();

export const frameSchema = frameBase.superRefine((frame, ctx) => {
  const fail = (message: string, path: string) =>
    ctx.addIssue({ code: "custom", message: `${frame.id}: ${message}`, path: [path] });

  // Anti-fake-sync 1 — opting into smoke coverage requires a real user-facing
  // anchor plus a role and auth state. A smoke frame cannot be declared without
  // saying how to test it.
  if (frame.smoke) {
    if (!frame.requiredRole) fail("smoke frames must declare requiredRole", "requiredRole");
    if (!frame.authState) fail("smoke frames must declare authState", "authState");
    if (!frame.expectedHeading && !frame.expectedAnchor) {
      fail("smoke frames must declare expectedHeading or expectedAnchor", "expectedHeading");
    }
  }

  // Anti-fake-sync 2 — any blocked prototype status must carry a written reason.
  if (
    (BLOCKED_PROTOTYPE_STATUSES as readonly string[]).includes(frame.prototypeStatus) &&
    !frame.prototypeBlockedReason
  ) {
    fail(
      `prototypeStatus "${frame.prototypeStatus}" requires prototypeBlockedReason`,
      "prototypeBlockedReason"
    );
  }

  // Anti-fake-sync 3 — a design-ahead frame must not claim full repo evidence,
  // and must link the drift row that tracks it.
  if (frame.status === "design-ahead") {
    if (!frame.driftId) fail("design-ahead frames must link a driftId", "driftId");
    if (frame.evidenceSource !== "repo-partial") {
      fail("design-ahead frames must set evidenceSource: repo-partial", "evidenceSource");
    }
    // Anti-fake-sync 4 — smoke asserts shipped behaviour, so it may not cover
    // behaviour that is not shipped.
    if (frame.smoke) fail("design-ahead frames may not be smoke-tested", "smoke");
  }

  // Anti-fake-sync 5 — internal-only capture readiness is required for founder
  // and admin surfaces. Ops tooling is never public marketing material.
  if (
    (frame.role === "founder" || frame.role === "admin") &&
    frame.captureReadiness !== "internal-only"
  ) {
    fail(`${frame.role} frames must be captureReadiness: internal-only`, "captureReadiness");
  }

  // Anti-fake-sync 6 — a clickable prototype claim must name the screen that
  // proves it. This is the rule that catches a frame claiming coverage for
  // markup that cannot render.
  if (frame.prototypeStatus === "clickable" && !frame.prototypeRef) {
    fail("clickable prototypeStatus requires prototypeRef", "prototypeRef");
  }

  // Anti-fake-sync 7 — any capture label other than safe-now must say what
  // blocks it, so screenshot planning never guesses.
  if (frame.captureReadiness !== "safe-now" && !frame.captureReadinessReason) {
    fail(
      `captureReadiness "${frame.captureReadiness}" requires captureReadinessReason`,
      "captureReadinessReason"
    );
  }

  // Structural honesty: stateCoverage must partition the declared states. A
  // state that is in neither list, or in both, hides a coverage gap.
  const declared = new Set(frame.states);
  const covered = new Set(frame.stateCoverage.covered);
  const missing = new Set(frame.stateCoverage.missing);
  for (const s of [...frame.stateCoverage.covered, ...frame.stateCoverage.missing]) {
    if (!declared.has(s)) fail(`stateCoverage lists "${s}", which is not a declared state`, "stateCoverage");
  }
  for (const s of frame.states) {
    const inCovered = covered.has(s);
    const inMissing = missing.has(s);
    if (!inCovered && !inMissing) fail(`state "${s}" is in neither covered nor missing`, "stateCoverage");
    if (inCovered && inMissing) fail(`state "${s}" is both covered and missing`, "stateCoverage");
  }
});

export const mirrorSchema = z
  .object({
    artifact: z.literal("maanta-current-reality"),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    generatedFrom: z.string().min(8),
    // Guards against the mirror being passed off as repo-generated.
    provenance: z.string().includes("NOT EXTRACTED FROM THE REPO"),
    // Notion outranks repo, repo outranks design system. Order is fixed.
    truthOrder: z.tuple([
      z.literal("notion:product-and-current-state"),
      z.literal("repo:implementation"),
      z.literal("design-system:visual"),
    ]),
    verifiedAgainst: z.object({
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      branch: z.string(),
      treeSha: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    stage: z.string(),
    /**
     * Honest statement of whether Layer 2 has ever executed. `smoke: true` on a
     * frame means "declared and generated", never "passing" — without this field
     * a reader counts 14 smoke frames and assumes 14 green browser checks.
     * `lastRunAt` stays null until a real run reports back.
     */
    smokeCoverage: z
      .object({
        status: z.enum(["prepared-not-run", "running", "passing", "failing"]),
        detail: z.string().min(20),
        blockedBy: z.array(z.string().min(4)),
        lastRunAt: z.string().nullable(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

export const supersededSchema = z
  .object({
    id: z.string(),
    what: z.string(),
    why: z.string().min(12),
    replacedBy: z.string().min(2),
  })
  .strict();

export const driftSchema = z
  .object({
    id: z.string().regex(/^D-\d{2}$/),
    classification: z.enum(DRIFT_CLASSIFICATIONS),
    blockedOn: z.enum(DRIFT_BLOCKED_ON),
    what: z.string(),
    detail: z.string().min(20),
    where: z.string(),
  })
  .strict();

export const contractSchema = z
  .object({
    $schema: z.string().optional(),
    mirror: mirrorSchema,
    // Rule id to plain-language statement. Frames reference these by id; a
    // frame may not invent an inline rule.
    runtimeRules: z.record(z.string().regex(/^R-[A-Z0-9-]+$/), z.string().min(12)),
    frames: z.array(frameSchema).min(1),
    superseded: z.array(supersededSchema),
    drift: z.array(driftSchema),
  })
  .strict();

export type Frame = z.infer<typeof frameSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type DriftRow = z.infer<typeof driftSchema>;
