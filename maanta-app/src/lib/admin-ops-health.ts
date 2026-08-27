export type AdminAttentionInput = {
  pendingMerchants: number;
  heldRedemptions: number;
  openTasks: number;
  merchantsInArrears: number;
  activeMerchants: number;
  liveDeals: number;
  genuineClaims7d: number | null;
  genuineVerified7d: number | null;
};

export type AdminAttentionItem = {
  id:
    | "approvals"
    | "held"
    | "support"
    | "arrears"
    | "supply"
    | "claim-conversion";
  label: string;
  reason: string;
  href: string;
  severity: "attention" | "urgent";
};

const MIN_CLAIMS_FOR_CONVERSION_ALERT = 10;
const LOW_CONVERSION_THRESHOLD = 0.2;

/**
 * Deterministic Node-0 attention rules. No opaque score: every surfaced item
 * states the exact condition that fired.
 */
export function buildAdminAttentionItems(
  input: AdminAttentionInput
): AdminAttentionItem[] {
  const items: AdminAttentionItem[] = [];

  if (input.heldRedemptions > 0) {
    items.push({
      id: "held",
      label: `${input.heldRedemptions} redemption${input.heldRedemptions === 1 ? "" : "s"} held`,
      reason: "Guardian has redemptions waiting for a human decision.",
      href: "/admin/redemptions",
      severity: "urgent",
    });
  }

  if (input.pendingMerchants > 0) {
    items.push({
      id: "approvals",
      label: `${input.pendingMerchants} merchant${input.pendingMerchants === 1 ? "" : "s"} awaiting approval`,
      reason: "Merchant onboarding cannot complete until an admin reviews them.",
      href: "/admin/approvals",
      severity: "attention",
    });
  }

  if (input.openTasks > 0) {
    items.push({
      id: "support",
      label: `${input.openTasks} open support task${input.openTasks === 1 ? "" : "s"}`,
      reason: "Operational tasks are still marked incomplete.",
      href: "/admin/support",
      severity: "attention",
    });
  }

  if (input.merchantsInArrears > 0) {
    items.push({
      id: "arrears",
      label: `${input.merchantsInArrears} merchant${input.merchantsInArrears === 1 ? "" : "s"} in arrears`,
      reason: "Outstanding merchant arrears are greater than zero.",
      href: "/admin/billing",
      severity: "attention",
    });
  }

  if (input.activeMerchants > 0 && input.liveDeals === 0) {
    items.push({
      id: "supply",
      label: "No live deals",
      reason: `${input.activeMerchants} active merchant${input.activeMerchants === 1 ? " has" : "s have"} no shopper-live supply.`,
      href: "/admin/merchants",
      severity: "urgent",
    });
  }

  if (
    input.genuineClaims7d != null &&
    input.genuineVerified7d != null &&
    input.genuineClaims7d >= MIN_CLAIMS_FOR_CONVERSION_ALERT &&
    input.genuineVerified7d / input.genuineClaims7d <
      LOW_CONVERSION_THRESHOLD
  ) {
    items.push({
      id: "claim-conversion",
      label: "Low claim → verified conversion",
      reason: `${input.genuineVerified7d}/${input.genuineClaims7d} genuine-tagged claims verified in 7 days (<20%, minimum sample 10).`,
      href: "/admin/redemptions",
      severity: "attention",
    });
  }

  return items;
}
