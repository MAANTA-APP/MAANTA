/**
 * Founder command centre — the deterministic readings behind the verdict.
 *
 * Pure functions, no I/O, so every reading can be tested and traced to the
 * written protocol (`docs/ops/node0-evidence-protocol-2026-08-24.md`, CLAUDE.md
 * "Operating state: Node 0 Field Validation Mode"). Nothing here scores,
 * predicts or recommends beyond what the protocol already states in prose.
 */

import { MIN_CLAIMS_FOR_MERCHANT_RATIO } from "@/lib/pilot-command-centre";

/** The ladder: 1 → 5 → 10 genuine verified redemptions by enrolled merchants. */
export const LADDER_RUNGS = [1, 5, 10] as const;

/** The kill criterion's time arm: eight weeks from Merchant 01 going live. */
export const KILL_CRITERION_WEEKS = 8;

/**
 * Claim → walk-in floor: "under roughly 1 in 3 stops the ladder for a
 * diagnosis". A tripwire, not a target — there is no pass percentage.
 */
export const TRIPWIRE_FLOOR = 1 / 3;

/** Which rung the ladder has reached, and which comes next. */
export function ladderPosition(successes: number | null): {
  reached: number | null;
  next: number | null;
} {
  if (successes === null) return { reached: null, next: LADDER_RUNGS[0] };
  let reached: number | null = null;
  let next: number | null = null;
  for (const r of LADDER_RUNGS) {
    if (successes >= r) reached = r;
    else if (next === null) next = r;
  }
  return { reached, next };
}

/**
 * The eight-week clock, from the day Merchant 01 went live.
 *
 * "Not started" until a merchant holds position 1 in the manifest with a
 * known `onboardedAt`. Stated as weeks elapsed of eight, and "elapsed" once
 * the window has passed — never a verdict, which is the founder's.
 */
export function killCriterionClock(
  merchant01OnboardedAt: string | null,
  now: Date
): { state: "not_started" | "running" | "elapsed"; weeks: number | null; label: string } {
  if (!merchant01OnboardedAt) {
    return { state: "not_started", weeks: null, label: "Not started" };
  }
  const start = new Date(merchant01OnboardedAt).getTime();
  const days = Math.floor((now.getTime() - start) / (24 * 3600_000));
  const weeks = Math.max(0, Math.floor(days / 7));
  if (weeks >= KILL_CRITERION_WEEKS) {
    return { state: "elapsed", weeks, label: `${KILL_CRITERION_WEEKS} weeks elapsed` };
  }
  return { state: "running", weeks, label: `Week ${weeks + 1} of ${KILL_CRITERION_WEEKS}` };
}

/**
 * Claim → walk-in, over genuine field claims only.
 *
 * `success` over all claims, where a claim that never became a success is a
 * claim that never came (or is still open). Not computed below the minimum
 * sample: a 1-of-1 conversion is not a 100% conversion, and rendering one
 * would invite exactly the causal claim the protocol forbids.
 */
export function tripwireReading(input: { claims: number | null; successes: number | null }): {
  state: "not_computable" | "clear" | "tripped";
  ratio: number | null;
  label: string;
} {
  if (input.claims === null || input.successes === null) {
    return { state: "not_computable", ratio: null, label: "—" };
  }
  if (input.claims < MIN_CLAIMS_FOR_MERCHANT_RATIO) {
    return { state: "not_computable", ratio: null, label: "Not computable yet" };
  }
  const ratio = input.successes / input.claims;
  const label = `${input.successes} of ${input.claims} claims walked in`;
  return { state: ratio < TRIPWIRE_FLOOR ? "tripped" : "clear", ratio, label };
}

/**
 * The next move, from the written priority sequence:
 * Merchant 01 → Staff 01 → genuine Deal 01 → Shopper 01 → verified contact →
 * claim → physical visit → merchant verification → first genuine success →
 * 5 → 10 → observe the KES 300 credit wall → continuation / payment signal.
 *
 * Deterministic from two numbers. The text is the sequence, not advice.
 */
export function pilotNextMove(input: { enrolled: number; ladder: number | null }): {
  title: string;
  detail: string;
  /** True when the step is one whose evidence demo mode would contaminate. */
  requiresDemoOff: boolean;
} {
  if (input.enrolled === 0) {
    return {
      title: "Merchant 01 — one genuine, independent merchant at BBS Mall",
      detail:
        "Self-serve onboarding with a verified email and no phone (the outstanding D158 evidence), then founder review and approval. Record what actually happens; do not coach. Once approved, add the merchant to the cohort manifest as external, position 1 — it becomes the third non-demo merchant row, not the first.",
      requiresDemoOff: true,
    };
  }
  if (input.ladder === null) {
    return {
      title: "Ladder unreadable",
      detail: "The genuine verified count could not be read. Reload before acting; a dash is unknown, not zero.",
      requiresDemoOff: false,
    };
  }
  if (input.ladder === 0) {
    return {
      title: "First genuine success — Deal 01, Staff 01, Shopper 01",
      detail:
        "A genuine deal live, a staff seat linked, a recruited Shopper 01 with a verified contact who claims, walks in, and is verified at the counter. The first genuine success moves the ladder; nothing before it does. Cohort one is pushed by design and cannot test pull.",
      requiresDemoOff: true,
    };
  }
  if (input.ladder < 5) {
    return {
      title: `Rung 1 reached — continue to 5 (${input.ladder} so far)`,
      detail:
        "Keep the loop running and read the claim → walk-in tripwire as claims accumulate. Under roughly 1 in 3 stops the ladder for a diagnosis before another merchant is added.",
      requiresDemoOff: true,
    };
  }
  if (input.ladder < 10) {
    return {
      title: `Rung 5 reached — continue to 10 (${input.ladder} so far)`,
      detail:
        "Around ten verified redemptions the KES 300 opening credit is spent and the merchant cannot post a new deal. Expected, and the measurement. Nobody raises the wall with the merchant.",
      requiresDemoOff: true,
    };
  }
  return {
    title: "Rung 10 reached — observe the credit wall",
    detail:
      "The opening credit is spent. What the merchant does or says unprompted — a repost, a payment question, or silence — is the willingness-to-pay signal, and the day sheet's prompted/organic record is what makes it count. Pull is a separate named phase after cohort one.",
    requiresDemoOff: false,
  };
}
