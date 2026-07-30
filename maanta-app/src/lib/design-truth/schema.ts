import { z } from "zod";

/**
 * Zod mirror of `design/current-reality/frames.schema.json`.
 *
 * Single source of truth for types: everything downstream uses `z.infer`, so
 * there is no hand-maintained parallel `interface` to drift away from the
 * runtime checks. When the JSON schema changes, change this file — the contract
 * test then tells you which frames stopped parsing.
 *
 * The seven anti-fake-sync rules from the JSON schema's `allOf` are reproduced
 * here as `superRefine` checks, because that is where they actually run in CI.
 */

export const ROLES = [
  "shopper",
  "merchant",
  "agent",
  "founder",
  "admin",
  "public",
] as const;

export const STATUSES = [
  "live",
  "gated",
  "blocked",
  "rehearsal",
  "design-ahead",
] as const;

export const PROTOTYPE_STATUSES = [
  "clickable",
  "blocked-design",
  "blocked-product",
  "blocked-code",
  "current-not-clickable",
] as const;

export const CAPTURE_READINESS = [
  "safe-now",
  "after-copy",
  "after-data",
  "internal-only",
] as const;

export const EVIDENCE_SOURCES = ["repo", "repo+notion", "repo-partial"] as const;

/**
 * Valid `requiredRole` values: the six product roles plus the test-only personas
 * the E2E helper can resolve to a stored session. A free-form string let a typo
 * ("merchant-staff-noverify") pass Layer 1 and only fail at Layer 2 — which is
 * skipped wherever that role has no provisioned account, so the typo could reach
 * main unnoticed. Keep in step with `Role` in e2e/helpers/roles.ts.
 */
export const REQUIRED_ROLES = [
  "shopper",
  "shopper-unverified-phone",
  "merchant",
  "merchant-staff-no-verify",
  "agent",
  "founder",
  "admin",
  "public",
] as const;

export const AUTH_STATES = [
  "anonymous",
  "authenticated",
  "authenticated-unverified-phone",
  "role-session",
] as const;

const BLOCKED_PROTOTYPE_STATUSES = [
  "blocked-design",
  "blocked-product",
  "blocked-code",
  "current-not-clickable",
] as const;

const RULE_ID = /^R-[A-Z0-9-]+$/;
const DRIFT_ID = /^D-\d{2}$/;

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
    runtimeRule: z.string().regex(RULE_ID),
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
    driftId: z.string().regex(DRIFT_ID).optional(),
    notes: z.string().optional(),
    smoke: z.boolean(),
    expectedHeading: z.string().min(2).optional(),
    expectedAnchor: z.string().min(2).optional(),
    redirectTarget: z.string().regex(/^\//).optional(),
    requiredRole: z.enum(REQUIRED_ROLES).optional(),
    authState: z.enum(AUTH_STATES).optional(),
  })
  .strict();

export const frameSchema = frameBase.superRefine((f, ctx) => {
  const fail = (rule: string, message: string, path: string[] = []) =>
    ctx.addIssue({
      code: "custom",
      message: `${f.id}: ${message} (anti-fake-sync ${rule})`,
      path,
    });

  // 1 — opting into smoke requires a real anchor plus a role and auth state.
  if (f.smoke) {
    if (!f.requiredRole) fail("1", "smoke frame must declare requiredRole", ["requiredRole"]);
    if (!f.authState) fail("1", "smoke frame must declare authState", ["authState"]);
    if (!f.expectedHeading && !f.expectedAnchor) {
      fail("1", "smoke frame must declare expectedHeading or expectedAnchor", [
        "expectedHeading",
      ]);
    }
  }

  // 2 — any blocked prototype status must carry a written reason.
  if (
    (BLOCKED_PROTOTYPE_STATUSES as readonly string[]).includes(f.prototypeStatus) &&
    !f.prototypeBlockedReason
  ) {
    fail("2", `prototypeStatus "${f.prototypeStatus}" needs prototypeBlockedReason`, [
      "prototypeBlockedReason",
    ]);
  }

  // 3 — a design-ahead frame may not claim full repo evidence, and must link its drift row.
  if (f.status === "design-ahead") {
    if (!f.driftId) fail("3", "design-ahead frame must link a driftId", ["driftId"]);
    if (f.evidenceSource !== "repo-partial") {
      fail("3", "design-ahead frame must set evidenceSource: repo-partial", [
        "evidenceSource",
      ]);
    }
    // 4 — smoke asserts shipped behaviour, so unshipped frames may not opt in.
    if (f.smoke) fail("4", "design-ahead frame may not be smoke-tested", ["smoke"]);
  }

  // 5 — ops tooling is never public marketing material.
  if (
    (f.role === "founder" || f.role === "admin") &&
    f.captureReadiness !== "internal-only"
  ) {
    fail("5", `${f.role} frame must be captureReadiness: internal-only`, [
      "captureReadiness",
    ]);
  }

  // 6 — a clickable prototype claim must name the screen that proves it.
  if (f.prototypeStatus === "clickable" && !f.prototypeRef) {
    fail("6", "clickable prototypeStatus must carry a prototypeRef", ["prototypeRef"]);
  }

  // 7 — any capture label other than safe-now must say what blocks it.
  if (f.captureReadiness !== "safe-now" && !f.captureReadinessReason) {
    fail("7", `captureReadiness "${f.captureReadiness}" needs captureReadinessReason`, [
      "captureReadinessReason",
    ]);
  }
});

export const mirrorSchema = z.object({
  artifact: z.literal("maanta-current-reality"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  generatedFrom: z.string().min(8),
  // Guards against the mirror being passed off as generated from the app.
  provenance: z.string().includes("NOT EXTRACTED FROM THE REPO"),
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
  liveNodes: z.array(z.string()).optional(),
  rehearsalNodes: z.array(z.string()).optional(),
  knownRepoDesignMirror: z.string().optional(),
  // Must be modelled, not merely present in the JSON: Zod strips unknown keys,
  // so an unmodelled field reads as `undefined` downstream and any test that
  // guards on it passes vacuously. The contract test asserts it against
  // frames.length.
  frameCount: z.number().int().positive().optional(),
});

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
    id: z.string().regex(DRIFT_ID),
    classification: z.enum([
      "current-mismatch",
      "design-ahead",
      "historical",
      "blocked-on-prototype",
    ]),
    blockedOn: z.enum(["code", "product-decision", "prototype", "provenance", "none"]),
    what: z.string(),
    detail: z.string().min(20),
    where: z.string(),
  })
  .strict();

export const contractSchema = z
  .object({
    $schema: z.string().optional(),
    mirror: mirrorSchema,
    runtimeRules: z.record(z.string().regex(RULE_ID), z.string().min(12)),
    frames: z.array(frameSchema).min(1),
    superseded: z.array(supersededSchema),
    drift: z.array(driftSchema),
    // Landing record: added when the mirror was committed into this repo.
    // Not in the design-side schema, so it stays optional here.
    landedInRepo: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        closesDrift: z.array(z.string().regex(DRIFT_ID)),
        corrections: z.array(
          z.object({
            frame: z.string(),
            field: z.string(),
            was: z.string(),
            now: z.string(),
            evidence: z.string(),
          })
        ),
      })
      .optional(),
  })
  .strict();

export type Frame = z.infer<typeof frameSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type Role = (typeof ROLES)[number];
export type AuthState = (typeof AUTH_STATES)[number];
export type RequiredRole = (typeof REQUIRED_ROLES)[number];

/**
 * A frame that opted into behavioural smoke coverage.
 *
 * The union encodes anti-fake-sync rule 1: a smoke frame carries an anchor. That
 * keeps Layer 2 from reaching for `!` on `expectedAnchor` — the guard proves the
 * anchor exists rather than the caller asserting it.
 */
type SmokeCore = Frame & {
  smoke: true;
  requiredRole: RequiredRole;
  authState: AuthState;
};
export type SmokeFrame = SmokeCore &
  ({ expectedHeading: string } | { expectedAnchor: string });

export function isSmokeFrame(f: Frame): f is SmokeFrame {
  return (
    f.smoke &&
    Boolean(f.requiredRole) &&
    Boolean(f.authState) &&
    Boolean(f.expectedHeading ?? f.expectedAnchor)
  );
}
