/**
 * Elite trial launch-offer helpers for operator surfaces.
 *
 * The DB enforces the first-100 BBS Mall cap (`elite_trial_cap_status`,
 * `trg_enforce_elite_trial_cap`). These helpers only format that truth for the
 * admin UI — they do not invent policy.
 */

export type EliteTrialCapStatus = {
  cap: number;
  granted: number;
  remaining: number;
};

export type EliteTrialOutcome = "granted" | "skipped_cap_reached" | "unknown";

/**
 * Approve-notice copy, ruled 2026-08-09 (design brief v1.4, item A2 wording;
 * drift D78). Single-sourced here because the strings render twice — the
 * approve API returns them and `approveOutcomeMessage` synthesises them when
 * the response body is incomplete — and two copies is how they drift apart.
 */
export const APPROVE_NOTICE_TRIAL_SKIPPED =
  "Shop approved on Standard — the 30-day Elite trial launch offer is fully claimed.";
export const APPROVE_NOTICE_TRIAL_UNCONFIRMED =
  "Approved — trial outcome unconfirmed. The shop is live. We could not confirm whether the trial was applied — check Plans & trials.";

/** Normalise elite_trial_cap_status() RPC payloads (row or single-element array). */
export function parseEliteTrialCapStatus(capRows: unknown): EliteTrialCapStatus | null {
  if (Array.isArray(capRows) && capRows[0]) {
    const row = capRows[0] as Record<string, unknown>;
    return {
      cap: Number(row.cap),
      granted: Number(row.granted),
      remaining: Number(row.remaining),
    };
  }
  if (capRows && typeof capRows === "object" && "cap" in capRows) {
    const row = capRows as EliteTrialCapStatus;
    return {
      cap: Number(row.cap),
      granted: Number(row.granted),
      remaining: Number(row.remaining),
    };
  }
  return null;
}

/** One-line cap readout for admin approve / billing surfaces. */
export function formatEliteTrialCapLine(status: EliteTrialCapStatus): string {
  const { cap, granted, remaining } = status;
  if (remaining <= 0) {
    return `Elite trial launch offer fully claimed (${granted}/${cap}). New approvals go live on Standard even if the trial box is ticked.`;
  }
  return `Elite trial launch offer: ${remaining} of ${cap} slots left (${granted} granted).`;
}

/**
 * Operator-facing message after POST /api/admin/merchants/[id]/approve.
 * Prefer the API `notice` when present; otherwise synthesise a clear outcome
 * so a silent refresh cannot look like "trial granted".
 */
export function approveOutcomeMessage(input: {
  grantRequested: boolean;
  eliteTrialGranted?: boolean;
  eliteTrialOutcome?: EliteTrialOutcome | null;
  notice?: string | null;
}): string {
  if (input.notice?.trim()) return input.notice.trim();

  if (!input.grantRequested) {
    return "Shop approved on Standard.";
  }

  const outcome = input.eliteTrialOutcome;
  if (outcome === "granted" || input.eliteTrialGranted === true) {
    return "Shop approved with a 30-day Elite trial.";
  }
  if (outcome === "skipped_cap_reached") {
    return APPROVE_NOTICE_TRIAL_SKIPPED;
  }
  if (outcome === "unknown") {
    return APPROVE_NOTICE_TRIAL_UNCONFIRMED;
  }
  // Response shape incomplete — still do not imply a trial.
  return "Shop approved. Confirm the plan on this page before telling the merchant about a trial.";
}

/**
 * Merchant-facing trial / grace state for the 10g Plan screen — frame 14n
 * wording, ruled 2026-08-09 (D80). Deliberately separate from
 * `formatAdminTrialStatus`: the admin string set names the nightly job, and
 * ops vocabulary must not reach a merchant surface — that leak is why this
 * formatter exists.
 *
 * Grace is shown from the moment the trial ends, not from the moment the
 * nightly job stamps `grace_period_ends_at`: the stamp is always
 * trial_ends_at + 7 days (frozen rule; migration 20260701110443), so deriving
 * the same timestamp for display closes the window where a merchant would
 * otherwise see an ended trial with no explanation.
 */
export const TRIAL_GRACE_DAYS = 7;

export type MerchantTrialStatus = { label: string; body?: string };

export function formatMerchantTrialStatus(input: {
  eliteTrialActive: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt?: string | null;
  nowMs?: number;
}): MerchantTrialStatus | null {
  if (!input.eliteTrialActive) return null;
  const now = input.nowMs ?? Date.now();
  const day = 24 * 3600_000;
  const trialEnd = input.trialEndsAt ? new Date(input.trialEndsAt).getTime() : NaN;
  const stampedGraceEnd = input.gracePeriodEndsAt
    ? new Date(input.gracePeriodEndsAt).getTime()
    : NaN;
  const graceEnd = Number.isFinite(stampedGraceEnd)
    ? stampedGraceEnd
    : Number.isFinite(trialEnd)
      ? trialEnd + TRIAL_GRACE_DAYS * day
      : NaN;

  if (Number.isFinite(trialEnd) && trialEnd > now) {
    const days = Math.max(0, Math.ceil((trialEnd - now) / day));
    return { label: `Elite trial · ${days} day${days === 1 ? "" : "s"} left` };
  }

  if (Number.isFinite(graceEnd) && graceEnd > now) {
    const days = Math.max(0, Math.ceil((graceEnd - now) / day));
    return {
      label: `Grace period · ${days} day${days === 1 ? "" : "s"} to convert`,
      body: "Your trial ended. Elite features stay on until you convert or the grace period runs out.",
    };
  }

  if (Number.isFinite(graceEnd)) {
    return {
      label: "Grace period ended",
      body: "Your trial and grace period have ended. Your plan returns to Standard.",
    };
  }

  return { label: "Elite trial active" };
}

/** Admin merchant-detail trial / grace line. Returns null when not on trial. */
export function formatAdminTrialStatus(input: {
  eliteTrialActive: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt?: string | null;
  nowMs?: number;
}): string | null {
  if (!input.eliteTrialActive) return null;
  const now = input.nowMs ?? Date.now();
  const trialEnd = input.trialEndsAt ? new Date(input.trialEndsAt).getTime() : NaN;
  const graceEnd = input.gracePeriodEndsAt
    ? new Date(input.gracePeriodEndsAt).getTime()
    : NaN;

  if (Number.isFinite(graceEnd) && graceEnd > now) {
    const days = Math.max(0, Math.ceil((graceEnd - now) / (24 * 3600_000)));
    return `Elite trial grace · ${days} day${days === 1 ? "" : "s"} left`;
  }

  if (Number.isFinite(trialEnd) && trialEnd > now) {
    const days = Math.max(0, Math.ceil((trialEnd - now) / (24 * 3600_000)));
    return `Elite trial · ${days} day${days === 1 ? "" : "s"} left`;
  }

  if (Number.isFinite(trialEnd) && trialEnd <= now && !Number.isFinite(graceEnd)) {
    return "Elite trial ended — awaiting nightly grace / downgrade job";
  }

  return "Elite trial active";
}
