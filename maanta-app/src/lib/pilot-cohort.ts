/**
 * Node 0 pilot cohort manifest — who counts as external field validation.
 *
 * ## Why a manifest and not a flag
 *
 * There are THREE evidence classes and only one of them is derivable from the
 * database:
 *
 *   1. **genuine-tagged** — the D188 parent join: the redemption, its merchant
 *      AND its deal are all non-demo. This is a *data* property, computed in
 *      SQL (see `lib/evidence-scope.ts`). It is necessary for field evidence
 *      and nowhere near sufficient.
 *   2. **internal** — MAANTA testing itself. Explicitly listed below.
 *   3. **external field validation** — a real merchant who chose MAANTA and was
 *      explicitly enrolled in the pilot. Explicitly listed below.
 *
 * A merchant row carries no column that separates (2) from (3): both are
 * `is_demo = false`. Production holds two non-demo merchants and **both are
 * internal** — a founder registration exercise run with a family member, and a
 * shop created by the full-role E2E sweep (D184). The single genuine-tagged
 * `success` redemption belongs to the second one. So a census that counted
 * "non-demo merchants" as field evidence would read 2 when the true answer is
 * 0, and the KES 30 willingness-to-pay hypothesis would look tested when
 * nothing has been tested.
 *
 * ## The rule that makes this fail closed
 *
 * External is an **allow-list**, never "everything that is not known internal"
 * (founder ruling, 2026-08-27). A merchant absent from this manifest is
 * `unclassified` — genuine-tagged if its data says so, but **never counted as
 * external field validation**. That ordering matters: under the inverse rule a
 * forgotten internal account, a support fixture, or a half-finished signup
 * would silently promote itself into the evidence that decides whether Node 0
 * is working.
 *
 * **External field validation is therefore 0 until Merchant 01 is added here**,
 * by hand, with its cohort position and the reason it qualifies.
 *
 * ## Adding Merchant 01
 *
 * Append an entry with `classification: "external"`, the next `position`, the
 * merchant id, a `source` naming the evidence, and `onboardedAt` when known.
 * The guard suite (`pilot-cohort.test.ts`) enforces the manifest's shape;
 * nothing else needs to change.
 *
 * Sources of truth: CLAUDE.md "Operating state: Node 0 Field Validation Mode",
 * drift rows D174 / D184 / D188, and
 * `docs/ops/node0-evidence-protocol-2026-08-24.md`.
 */

/** What the manifest asserts about a merchant. Absence is not a value here. */
export type PilotClassification = "internal" | "external";

/**
 * The classification a surface actually renders. `unclassified` is the
 * fail-closed default for any non-demo merchant the manifest does not name.
 */
export type EvidenceClass = PilotClassification | "unclassified";

export type PilotCohortEntry = {
  merchantId: string;
  classification: PilotClassification;
  /**
   * Cohort position — 1 is Merchant 01, 2 is Merchant 02, and so on. Only
   * external entries hold a position: internal accounts are not rungs on the
   * 1 → 5 → 10 ladder and must never be numbered as though they were.
   */
  position: number | null;
  /** Why this merchant carries this classification. Cite the evidence. */
  source: string;
  /** ISO date the merchant was enrolled or created, where known. */
  onboardedAt: string | null;
};

/**
 * The manifest itself.
 *
 * Both current entries are internal. **There are no external entries yet, and
 * that is the correct state** — no real merchant has been enrolled at Node 0.
 * Do not add one to make a dashboard look busier.
 */
export const NODE0_COHORT_MANIFEST: readonly PilotCohortEntry[] = [
  {
    merchantId: "bf66a041-fb06-46a9-bcb0-2146e68d278d",
    classification: "internal",
    position: null,
    source:
      "SKANDI SKAN — a founder registration exercise run with a family member, not a BBS Mall merchant who chose MAANTA (D184).",
    onboardedAt: "2026-08-16",
  },
  {
    merchantId: "67fe233d-563c-4d56-b81e-27ed78eb160f",
    classification: "internal",
    position: null,
    source:
      "E2E Full Sweep Shop — created by the full-role E2E sweep; owns the one internal genuine-tagged success redemption (D174, D184).",
    onboardedAt: "2026-08-23",
  },
] as const;

const BY_ID = new Map(NODE0_COHORT_MANIFEST.map((e) => [e.merchantId, e]));

/**
 * Classify one merchant.
 *
 * Fail-closed: an id the manifest does not name is `unclassified`, never
 * `external`. Callers that count field evidence must require `"external"`
 * explicitly rather than testing `!== "internal"`.
 */
export function classifyMerchant(merchantId: string): EvidenceClass {
  return BY_ID.get(merchantId)?.classification ?? "unclassified";
}

/** The manifest entry for a merchant, or null when it is not enrolled. */
export function cohortEntry(merchantId: string): PilotCohortEntry | null {
  return BY_ID.get(merchantId) ?? null;
}

/** Cohort position, or null for internal and unclassified merchants. */
export function cohortPosition(merchantId: string): number | null {
  return BY_ID.get(merchantId)?.position ?? null;
}

/** Enrolled external merchants, in ladder order. Empty until Merchant 01. */
export function externalCohort(): PilotCohortEntry[] {
  return NODE0_COHORT_MANIFEST.filter((e) => e.classification === "external").sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
}

/** Explicitly listed internal/E2E merchants. */
export function internalMerchantIds(): string[] {
  return NODE0_COHORT_MANIFEST.filter((e) => e.classification === "internal").map(
    (e) => e.merchantId
  );
}

/**
 * How many merchants are enrolled as external field validation.
 *
 * This is the number the 1 → 5 → 10 ladder counts, and it is **0** today. It
 * is deliberately not derived from any row count: a query cannot tell a real
 * merchant from a test one, and the day it appears to is the day the evidence
 * stops meaning anything.
 */
export function externalCohortSize(): number {
  return externalCohort().length;
}

/** Human label for an evidence class, for table cells and legends. */
export function evidenceClassLabel(c: EvidenceClass): string {
  if (c === "external") return "External";
  if (c === "internal") return "Internal";
  return "Unclassified";
}
