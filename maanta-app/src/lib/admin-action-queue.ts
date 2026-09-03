/**
 * The unified Action Queue — every rule that turns operational state into an
 * item an admin can act on, in one pure module.
 *
 * Deliberately shaped like `admin-ops-health.ts` and `pilot-command-centre.ts`:
 * no I/O, no score, no ranking beyond severity and age, and every item names
 * the exact condition that fired. The page (`/admin/queue`) does the reads and
 * hands the rows in; this file decides what they mean. That split is what
 * makes the rules testable without a database and keeps "what needs my
 * attention" from being re-derived differently on the Home page and the queue.
 *
 * ## Three doctrines
 *
 * 1. **A failed read is never an empty queue** (D164 / D185). Every input that
 *    can fail is `T[] | null`, and a null input produces ONE item saying that
 *    category could not be read — never silence, which an operator reads as
 *    an all-clear.
 * 2. **An item points at the record, not at a list.** The founder's brief:
 *    dashboard → record/action, not dashboard → list → filter → record. Where
 *    a record has no page of its own (a fraud event, a support task) the link
 *    goes to the surface that carries its action, with the entity named.
 * 3. **Doctrine travels with the item.** The zero-balance rule carries the
 *    2026-08-24 ruling that nobody raises the credit wall with the merchant,
 *    because an alert that says "low balance" without it invites exactly the
 *    conversation that destroys the willingness-to-pay signal.
 */

import { claimAllocation } from "@/lib/claim-allocation";
import { minutesSinceArrival, type VisitFacts } from "@/lib/visit-funnel";
import { publicMerchantBlocker } from "@/lib/merchant-visibility";
import type { EvidenceClass } from "@/lib/pilot-cohort";

export type ActionCategory =
  | "approval"
  | "merchant"
  | "shopper"
  | "deal"
  | "visit"
  | "redemption"
  | "support"
  | "security"
  | "evidence"
  | "balance";

export const ACTION_CATEGORY_LABELS: Record<ActionCategory, string> = {
  approval: "Approval",
  merchant: "Merchant",
  shopper: "Shopper",
  deal: "Deal",
  visit: "Visit",
  redemption: "Redemption",
  support: "Support",
  security: "Security",
  evidence: "Evidence",
  balance: "Account / balance",
};

export type ActionSeverity = "urgent" | "attention";

export type ActionItem = {
  /** Stable, unique per condition + entity, so a UI can key on it. */
  id: string;
  category: ActionCategory;
  severity: ActionSeverity;
  /** What happened, in one line. */
  title: string;
  /** The record this is about. */
  entity: { kind: "merchant" | "redemption" | "deal" | "user" | "task" | "fraud_event" | "config"; id: string; name: string };
  /** Why attention is required — the exact condition, never a vibe. */
  reason: string;
  /** ISO timestamp the condition has existed since, or null when unknown. */
  since: string | null;
  /** Where the admin goes to act. */
  href: string;
  /** What acting looks like, when the surface offers a control. */
  action: string;
  /** True when this item reports a read failure rather than a condition. */
  unavailable?: boolean;
};

/** Every row shape the rules read. Each array is null when its read failed. */
export type ActionQueueInput = {
  now: Date;
  pendingMerchants: { id: string; merchant_name: string; created_at: string }[] | null;
  heldRedemptions: {
    id: string;
    redeemed_at: string;
    merchant_name: string | null;
  }[] | null;
  appealableRedemptions: {
    id: string;
    redeemed_at: string;
    merchant_name: string | null;
  }[] | null;
  fraudEvents: {
    id: string;
    event_type: string;
    severity: string;
    created_at: string;
    merchant_id: string | null;
    merchant_name: string | null;
  }[] | null;
  openTasks: {
    id: string;
    task_type: string;
    priority: string;
    created_at: string;
    due_at: string | null;
    merchant_id: string;
    merchant_name: string | null;
  }[] | null;
  merchants: {
    id: string;
    merchant_name: string;
    status: string;
    is_visible: boolean;
    is_shadow_banned: boolean;
    is_demo: boolean;
    account_balance: number;
    outstanding_arrears: number;
    updated_at: string | null;
    evidence: EvidenceClass;
    /** Shopper-visible deal count, or null when it could not be read. */
    visibleDeals: number | null;
  }[] | null;
  cappedLiveDeals: {
    id: string;
    title: string;
    merchant_id: string;
    merchant_name: string | null;
    max_claims: number | null;
    /** `claims_reserved` — the derived occupancy the cap is tested against (D236/D224). */
    claims_reserved: number;
    updated_at: string | null;
  }[] | null;
  unlinkedStaffSeats: {
    id: string;
    staff_name: string;
    merchant_id: string;
    merchant_name: string | null;
    merchant_status: string;
    invited_at: string;
  }[] | null;
  blacklistedLiveClaims: {
    id: string;
    user_id: string;
    full_name: string | null;
    claimed_at: string | null;
    merchant_name: string | null;
  }[] | null;
  staleArrivals: (VisitFacts & {
    id: string;
    merchant_name: string | null;
  })[] | null;
  stuckTopups: {
    api_ref: string;
    merchant_id: string;
    merchant_name: string | null;
    amount: number;
    currency: string;
    created_at: string;
  }[] | null;
  /** `null` when the flag could not be read. */
  demoModeEnabled: boolean | null;
};

/** Arrived-but-unverified this long is a counter problem, not a shopper browsing. */
export const STALE_ARRIVAL_MINUTES = 30;
/** A top-up initiated this long ago and still `initiated` did not complete. */
export const STUCK_TOPUP_MINUTES = 60;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function unavailable(category: ActionCategory, what: string): ActionItem {
  // The id keys the React list AND distinguishes one failure from another, so
  // it is per failed READ, not per category (Codex P2 on PR #319, D249).
  // Four categories carry two reads each — redemption (held, declined),
  // merchant (states, staff seats), balance (balances, top-ups) and evidence
  // (classification, demo flag) — so a correlated outage, exactly when this
  // state matters most, produced two items with the same key.
  return {
    id: `unavailable:${category}:${what.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    category,
    severity: "urgent",
    title: `${what} could not be read`,
    entity: { kind: "config", id: category, name: what },
    reason:
      "This is a read failure, not an empty queue. Reload before concluding there is nothing to do in this category.",
    since: null,
    href: "/admin/queue",
    action: "Reload",
    unavailable: true,
  };
}

/**
 * Link to the fraud review, filtered to this event type when the destination
 * can filter by it.
 *
 * `/admin/redemptions` offers a fixed pill row, and `fraud_events.event_type`
 * allows more values than that row lists. An unsupported value used to be
 * passed anyway: the page fell back to `all` and the operator was handed a
 * newest-50 list that need not contain the event the item was about. Sending
 * no `reason` for those types is the honest version of the same link — the
 * unfiltered list, arrived at deliberately rather than by a silent rejection.
 *
 * `FRAUD_REVIEW_FILTERS` is asserted against the page's own `REASONS` in
 * `admin-action-queue.test.ts`, so adding a pill there without widening this
 * (or the reverse) fails rather than quietly dropping filters again.
 */
export const FRAUD_REVIEW_FILTERS = ["geofence", "velocity", "collusion"] as const;

export function fraudReviewHref(eventType: string): string {
  return (FRAUD_REVIEW_FILTERS as readonly string[]).includes(eventType)
    ? `/admin/redemptions?reason=${encodeURIComponent(eventType)}`
    : "/admin/redemptions";
}

export function buildActionQueue(input: ActionQueueInput): ActionItem[] {
  const items: ActionItem[] = [];
  const t = input.now.getTime();
  const minutesAgo = (iso: string) => Math.floor((t - new Date(iso).getTime()) / 60_000);

  // --- Approvals ---------------------------------------------------------
  if (input.pendingMerchants === null) items.push(unavailable("approval", "Pending approvals"));
  else {
    for (const m of input.pendingMerchants) {
      items.push({
        id: `approval:${m.id}`,
        category: "approval",
        severity: "attention",
        title: `${m.merchant_name} is waiting for approval`,
        entity: { kind: "merchant", id: m.id, name: m.merchant_name },
        reason: "Status is pending. Onboarding cannot complete until an admin approves or rejects the shop.",
        since: m.created_at,
        href: `/admin/merchants/${m.id}#actions`,
        action: "Approve or reject",
      });
    }
  }

  // --- Redemptions held / appealable -------------------------------------
  if (input.heldRedemptions === null) items.push(unavailable("redemption", "Held redemptions"));
  else {
    for (const r of input.heldRedemptions) {
      items.push({
        id: `held:${r.id}`,
        category: "redemption",
        severity: "urgent",
        title: `Redemption held at ${r.merchant_name ?? "an unknown shop"}`,
        entity: { kind: "redemption", id: r.id, name: r.merchant_name ?? "Redemption" },
        reason: "Guardian soft-blocked this verification and no fee has moved. A shopper at the counter is waiting on a human decision.",
        since: r.redeemed_at,
        href: `/admin/redemptions/${r.id}`,
        action: "Release or reject",
      });
    }
  }
  if (input.appealableRedemptions === null) items.push(unavailable("redemption", "Declined redemptions"));
  else {
    for (const r of input.appealableRedemptions) {
      items.push({
        id: `appeal:${r.id}`,
        category: "redemption",
        severity: "attention",
        title: `Declined by Guardian at ${r.merchant_name ?? "an unknown shop"} — appeal open`,
        entity: { kind: "redemption", id: r.id, name: r.merchant_name ?? "Redemption" },
        reason: "Hard-blocked at the counter with no fee moved, and not yet upheld. Approve if it was a false positive, or uphold the block.",
        since: r.redeemed_at,
        href: `/admin/redemptions/${r.id}`,
        action: "Approve appeal or uphold",
      });
    }
  }

  // --- Security: unresolved fraud events ---------------------------------
  if (input.fraudEvents === null) items.push(unavailable("security", "Fraud events"));
  else {
    for (const e of input.fraudEvents) {
      items.push({
        id: `fraud:${e.id}`,
        category: "security",
        severity: e.severity === "high" ? "urgent" : "attention",
        title: `${e.event_type} signal at ${e.merchant_name ?? "an unknown shop"}`,
        entity: { kind: "fraud_event", id: e.id, name: e.merchant_name ?? "Fraud event" },
        reason: `Unresolved ${e.event_type} event, severity ${e.severity}. Deals from this merchant show as flagged until it is approved or rejected.`,
        since: e.created_at,
        // Only a reason the destination actually offers; anything else would
        // land on the unfiltered newest-50 list, which may not contain this
        // event at all (Codex P2 on PR #319, D250).
        href: fraudReviewHref(e.event_type),
        action: "Approve or reject the event",
      });
    }
  }

  // --- Support -------------------------------------------------------------
  if (input.openTasks === null) items.push(unavailable("support", "Open support tasks"));
  else {
    for (const task of input.openTasks) {
      const overdue = task.due_at !== null && new Date(task.due_at).getTime() < t;
      items.push({
        id: `task:${task.id}`,
        category: "support",
        severity: overdue || task.priority === "critical" ? "urgent" : "attention",
        title: `${task.task_type.replace(/_/g, " ")} · ${task.merchant_name ?? "merchant"}${overdue ? " — overdue" : ""}`,
        entity: { kind: "task", id: task.id, name: task.merchant_name ?? "Support task" },
        reason: overdue
          ? `Open past its due time (${task.priority} priority). Resolve it, or override with an audit line.`
          : `Open, ${task.priority} priority. Resolve it, or override with an audit line.`,
        since: task.created_at,
        href: `/admin/merchants/${task.merchant_id}#support`,
        action: "Resolve or override",
      });
    }
  }

  // --- Merchants: visibility, supply, evidence class, balance ------------
  if (input.merchants === null) {
    items.push(unavailable("merchant", "Merchant states"));
    items.push(unavailable("balance", "Merchant balances"));
    items.push(unavailable("evidence", "Evidence classification"));
  } else {
    for (const m of input.merchants) {
      if (m.is_demo) continue; // synthetic shops are never operational exceptions

      if (m.status === "suspended") {
        items.push({
          id: `suspended:${m.id}`,
          category: "merchant",
          severity: "attention",
          title: `${m.merchant_name} is suspended`,
          entity: { kind: "merchant", id: m.id, name: m.merchant_name },
          reason: "Suspended by an admin. Verification is blocked at this counter and nothing of theirs reaches shoppers. Review whether the suspension still stands.",
          since: m.updated_at,
          href: `/admin/merchants/${m.id}#actions`,
          action: "Reinstate or leave suspended",
        });
      } else if (m.status === "active") {
        const blocker = publicMerchantBlocker({
          status: m.status,
          isVisible: m.is_visible,
          isShadowBanned: m.is_shadow_banned,
        });
        if (blocker === "is_shadow_banned") {
          items.push({
            id: `shadow:${m.id}`,
            category: "merchant",
            severity: "attention",
            title: `${m.merchant_name} is shadow-banned`,
            entity: { kind: "merchant", id: m.id, name: m.merchant_name },
            reason: "Active, but shadow-banned: its deals look live to the merchant and reach no shopper. Lift the ban or record why it stands.",
            since: m.updated_at,
            href: `/admin/merchants/${m.id}#actions`,
            action: "Lift shadow-ban or leave",
          });
        } else if (blocker === "is_visible") {
          items.push({
            id: `hidden:${m.id}`,
            category: "merchant",
            severity: "attention",
            title: `${m.merchant_name} is hidden from shoppers`,
            entity: { kind: "merchant", id: m.id, name: m.merchant_name },
            reason: "Active, but is_visible is false — the trust metric dropped below 0.50 and the database hid the shop. No console control lifts this; review the redemption history.",
            since: m.updated_at,
            href: `/admin/merchants/${m.id}#activity`,
            action: "Review",
          });
        } else if (m.visibleDeals === 0) {
          items.push({
            id: `no-supply:${m.id}`,
            category: "deal",
            severity: "urgent",
            title: `${m.merchant_name} has no shopper-visible deal`,
            entity: { kind: "merchant", id: m.id, name: m.merchant_name },
            reason: "Active and visible, with zero live, unpaused, unexpired deals. No claim can be made against this shop at all.",
            since: null,
            href: `/admin/merchants/${m.id}#deals`,
            action: "Check with the merchant",
          });
        } else if (m.visibleDeals === null && input.demoModeEnabled !== null) {
          // The supply count for this shop failed to read. A null used to fall
          // through silently, which is the one thing this queue must never do:
          // an unreadable count is indistinguishable from "no supply" until it
          // reads, so the no-supply alert cannot be evaluated and the operator
          // has to be told that, per shop. (When the demo-mode flag itself is
          // unreadable no count is attempted for any shop, and the single
          // "Demo mode flag" item below already says so — one item, not one
          // per merchant.)
          items.push({
            id: `supply-unread:${m.id}`,
            category: "deal",
            severity: "attention",
            title: `${m.merchant_name}: live-deal count could not be read`,
            entity: { kind: "merchant", id: m.id, name: m.merchant_name },
            reason: "The shopper-visible supply read for this shop failed. This is a read error, not zero — whether the shop has a live deal is unknown until it reads, and the no-supply alert is withheld, not cleared.",
            since: null,
            href: `/admin/merchants/${m.id}#deals`,
            action: "Reload",
            unavailable: true,
          });
        }

        if (m.outstanding_arrears > 0) {
          items.push({
            id: `arrears:${m.id}`,
            category: "balance",
            severity: "attention",
            title: `${m.merchant_name} owes arrears`,
            entity: { kind: "merchant", id: m.id, name: m.merchant_name },
            reason: `Outstanding arrears of KES ${Math.round(m.outstanding_arrears).toLocaleString()}: success fees were recorded that the wallet could not cover. Settles automatically from the next top-up.`,
            since: m.updated_at,
            href: `/admin/merchants/${m.id}#economics`,
            action: "Review the ledger",
          });
        } else if (m.account_balance <= 0) {
          items.push({
            id: `zero-balance:${m.id}`,
            category: "balance",
            severity: "attention",
            title: `${m.merchant_name} is at zero balance`,
            entity: { kind: "merchant", id: m.id, name: m.merchant_name },
            reason: "Wallet is empty, so the zero-balance gate stops new deals; existing deals keep running and fees go to arrears. Do NOT raise this with the merchant — what they say about it unprompted is the measurement (ruling 2026-08-24).",
            since: m.updated_at,
            href: `/admin/merchants/${m.id}#economics`,
            action: "Observe only",
          });
        }
      }

      if (m.evidence === "unclassified" && m.status !== "churned") {
        items.push({
          id: `unclassified:${m.id}`,
          category: "evidence",
          severity: "attention",
          title: `${m.merchant_name} is not classified as evidence`,
          entity: { kind: "merchant", id: m.id, name: m.merchant_name },
          reason: "Non-demo merchant the Node 0 cohort manifest does not name. Its activity is genuine-tagged but counts as neither internal nor external field validation until a founder classifies it.",
          since: null,
          href: `/admin/merchants/${m.id}#identity`,
          action: "Founder classifies in the manifest",
        });
      }
    }
  }

  // --- Deals: allocation exhausted while still live -----------------------
  if (input.cappedLiveDeals === null) items.push(unavailable("deal", "Live deal allocations"));
  else {
    for (const d of input.cappedLiveDeals) {
      const a = claimAllocation({ maxClaims: d.max_claims, claimsReserved: d.claims_reserved });
      if (!a.fullyClaimed) continue;
      items.push({
        id: `fully-claimed:${d.id}`,
        category: "deal",
        severity: "attention",
        title: `"${d.title}" is fully claimed`,
        entity: { kind: "deal", id: d.id, name: d.title },
        reason: `Claim allocation ${a.allocation} reached — ${a.issued} claims holding a slot, none remaining. Still discoverable; no new claim can be issued until a held claim expires unused, or the merchant raises the allocation.`,
        since: d.updated_at,
        href: `/admin/merchants/${d.merchant_id}#deals`,
        action: "Tell the merchant if asked",
      });
    }
  }

  // --- Staff seats invited but never linked ------------------------------
  if (input.unlinkedStaffSeats === null) items.push(unavailable("merchant", "Staff seats"));
  else {
    for (const s of input.unlinkedStaffSeats) {
      if (s.merchant_status !== "active") continue;
      items.push({
        id: `seat:${s.id}`,
        category: "merchant",
        severity: "attention",
        title: `Staff seat for ${s.staff_name} at ${s.merchant_name ?? "merchant"} is not linked`,
        entity: { kind: "merchant", id: s.merchant_id, name: s.merchant_name ?? "Merchant" },
        reason: "Invited, but no account has claimed the seat, so this person cannot verify at the counter yet. The seat links on their first verified sign-in.",
        since: s.invited_at,
        href: `/admin/merchants/${s.merchant_id}#staff`,
        action: "Check the invite reached them",
      });
    }
  }

  // --- Shoppers: blacklisted account holding a live claim -----------------
  if (input.blacklistedLiveClaims === null) items.push(unavailable("shopper", "Blacklisted accounts"));
  else {
    for (const c of input.blacklistedLiveClaims) {
      items.push({
        id: `blacklisted-claim:${c.id}`,
        category: "shopper",
        severity: "urgent",
        title: `Blacklisted account holds a live claim at ${c.merchant_name ?? "a shop"}`,
        entity: { kind: "user", id: c.user_id, name: c.full_name ?? "Blacklisted account" },
        reason: "Blacklisted after this claim was issued. By design the code still works at the counter (verify-anyway, D171) — the block stops NEW claims only. Review the claim; unblock from the shopper's account if the block was wrong.",
        since: c.claimed_at,
        href: `/admin/redemptions/${c.id}`,
        action: "Review the claim",
      });
    }
  }

  // --- Visits: arrived and still unverified ------------------------------
  if (input.staleArrivals === null) items.push(unavailable("visit", "Arrivals"));
  else {
    for (const r of input.staleArrivals) {
      const mins = minutesSinceArrival(r, input.now);
      if (mins === null || mins < STALE_ARRIVAL_MINUTES) continue;
      items.push({
        id: `stale-arrival:${r.id}`,
        category: "visit",
        severity: "attention",
        title: `Shopper arrived at ${r.merchant_name ?? "a shop"} ${mins} min ago and is still unverified`,
        entity: { kind: "redemption", id: r.id, name: r.merchant_name ?? "Redemption" },
        reason: `Checked in by counter QR ${mins} minutes ago; the claim is still pending. An arrival is not a redemption — staff may not have verified, or the shopper left.`,
        since: r.arrived_at ?? null,
        href: `/admin/redemptions/${r.id}`,
        action: "Check with the counter",
      });
    }
  }

  // --- Balance: top-ups that never completed -----------------------------
  if (input.stuckTopups === null) items.push(unavailable("balance", "Pending top-ups"));
  else {
    for (const tu of input.stuckTopups) {
      const mins = minutesAgo(tu.created_at);
      if (mins < STUCK_TOPUP_MINUTES) continue;
      items.push({
        id: `topup:${tu.api_ref}`,
        category: "balance",
        severity: "attention",
        title: `Top-up by ${tu.merchant_name ?? "merchant"} never completed`,
        entity: { kind: "merchant", id: tu.merchant_id, name: tu.merchant_name ?? "Merchant" },
        reason: `${tu.currency} ${Math.round(tu.amount).toLocaleString()} initiated ${Math.floor(mins / 60)}h ${mins % 60}m ago and still not confirmed by the provider. No money has been credited.`,
        since: tu.created_at,
        href: `/admin/merchants/${tu.merchant_id}#economics`,
        action: "Check the provider record",
      });
    }
  }

  // --- Evidence: demo mode -------------------------------------------------
  if (input.demoModeEnabled === null) items.push(unavailable("evidence", "Demo mode flag"));
  else if (input.demoModeEnabled) {
    items.push({
      id: "demo-mode",
      category: "evidence",
      severity: "attention",
      title: "Demo mode is ON",
      entity: { kind: "config", id: "demo_mode_enabled", name: "Demo mode" },
      reason: "Synthetic deals are shopper-visible. Merchant 01's onboarding and Shopper 01's claim must happen with demo mode OFF or that evidence is contaminated (D189). Founder-owned; no console control flips it.",
      since: null,
      href: "/admin/operations",
      action: "Founder decides",
    });
  }

  return sortActionItems(items);
}

/** Urgent first; within a severity, the oldest condition first; unknown age last. */
export function sortActionItems(items: ActionItem[]): ActionItem[] {
  const rank = (s: ActionSeverity) => (s === "urgent" ? 0 : 1);
  return [...items].sort((a, b) => {
    if (a.unavailable !== b.unavailable) return a.unavailable ? -1 : 1;
    const r = rank(a.severity) - rank(b.severity);
    if (r !== 0) return r;
    if (a.since === null && b.since === null) return 0;
    if (a.since === null) return 1;
    if (b.since === null) return -1;
    return a.since.localeCompare(b.since);
  });
}

/** Counts per category, for chips and the Home summary. */
export function countByCategory(items: ActionItem[]): Record<ActionCategory, number> {
  const out = Object.fromEntries(
    (Object.keys(ACTION_CATEGORY_LABELS) as ActionCategory[]).map((c) => [c, 0])
  ) as Record<ActionCategory, number>;
  for (const i of items) out[i.category] += 1;
  return out;
}

export function isActionCategory(v: string | undefined): v is ActionCategory {
  return v !== undefined && Object.prototype.hasOwnProperty.call(ACTION_CATEGORY_LABELS, v);
}

/** "3 urgent · 7 need attention" — or the read-failure count first. */
export function summariseQueue(items: ActionItem[]): string {
  const unavailableCount = items.filter((i) => i.unavailable).length;
  const urgent = items.filter((i) => !i.unavailable && i.severity === "urgent").length;
  const attention = items.filter((i) => !i.unavailable && i.severity === "attention").length;
  const parts: string[] = [];
  // "read", not "category": two reads in one category can fail together, and
  // calling that two unreadable categories overstated the outage (D249).
  if (unavailableCount > 0) parts.push(`${unavailableCount} ${plural(unavailableCount, "read")} unreadable`);
  parts.push(`${urgent} urgent`);
  parts.push(`${attention} ${attention === 1 ? "needs" : "need"} attention`);
  return parts.join(" · ");
}
