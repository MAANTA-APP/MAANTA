import { DEAL_GRACE_MINUTES, getDealExpiryState } from "@/lib/deal-expiry";
import { claimAllocation } from "@/lib/claim-allocation";

/**
 * The operational state of a deal as an admin should read it.
 *
 * Derived, never stored: every input is a column that already exists, and the
 * order is the point. A deal that is inactive is *ended* whatever else is true
 * of it; a paused deal is *paused* even if it has also run out of allocation;
 * an expired deal is *expired* before it is fully claimed, because expiry
 * withdraws it from discovery while "fully claimed" leaves it discoverable
 * (founder doctrine 2026-08-28). `in_grace` is the 15-minute window after
 * expiry in which an already-issued claim can still be redeemed at the till —
 * it is not claimable and it is not gone.
 */
export type AdminDealState =
  | "live"
  | "fully_claimed"
  | "paused"
  | "in_grace"
  | "expired"
  | "ended";

export type AdminDealFacts = {
  is_active: boolean | null | undefined;
  is_paused: boolean | null | undefined;
  expires_at: string | null | undefined;
  max_claims: number | null | undefined;
  claims_count: number | null | undefined;
};

export function adminDealState(d: AdminDealFacts, now: Date = new Date()): AdminDealState {
  if (d.is_active === false) return "ended";
  if (d.is_paused === true) return "paused";
  const expiry = d.expires_at ? getDealExpiryState(d.expires_at, now).status : "live";
  if (expiry === "expired") return "expired";
  if (expiry === "in_grace") return "in_grace";
  if (claimAllocation({ maxClaims: d.max_claims, claimsCount: d.claims_count }).fullyClaimed) {
    return "fully_claimed";
  }
  return "live";
}

/**
 * Icon + word for each state, so it survives greyscale (frozen rule 4). No
 * state carries a colour of its own; the word does the work.
 */
export const ADMIN_DEAL_STATE_META: Record<
  AdminDealState,
  { label: string; icon: string; hint: string }
> = {
  live: { label: "Live", icon: "●", hint: "Discoverable and claimable." },
  fully_claimed: {
    label: "Fully claimed",
    icon: "◉",
    hint: "Allocation exhausted — still discoverable, no new claims can be issued.",
  },
  paused: {
    label: "Paused",
    icon: "‖",
    hint: "Withdrawn from discovery by the merchant; issued claims stay redeemable.",
  },
  in_grace: {
    label: "In grace",
    icon: "◔",
    hint: `Past expiry; issued claims can still be redeemed for ${DEAL_GRACE_MINUTES} minutes.`,
  },
  expired: { label: "Expired", icon: "○", hint: "Past expiry and the grace window." },
  ended: { label: "Ended", icon: "○", hint: "Archived or removed; no longer active." },
};

/** Filter values a directory offers, in display order. */
export const ADMIN_DEAL_STATE_FILTERS = [
  "all",
  "live",
  "fully_claimed",
  "paused",
  "expired",
  "ended",
] as const;

export type AdminDealStateFilter = (typeof ADMIN_DEAL_STATE_FILTERS)[number];

export function isAdminDealStateFilter(v: string | undefined): v is AdminDealStateFilter {
  return (ADMIN_DEAL_STATE_FILTERS as readonly string[]).includes(v ?? "");
}

/** Whether a state belongs under a filter. `expired` folds in_grace, on purpose. */
export function matchesDealStateFilter(state: AdminDealState, filter: AdminDealStateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "expired") return state === "expired" || state === "in_grace";
  return state === filter;
}
