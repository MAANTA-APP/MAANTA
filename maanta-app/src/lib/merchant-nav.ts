import type { StaffPermissions } from "@/lib/merchant";

/**
 * Single source of truth for "which merchant surfaces is this user allowed to
 * use", so the bottom bar, the More list, the top-bar wallet chip and the
 * dashboard quick actions can never drift apart.
 *
 * This is UI CLARITY ONLY — it hides entry points a staff member would only
 * bounce off. The authoritative checks stay server-side:
 *   - `requireMerchant("can_*")` in `src/lib/merchant-api.ts` for every write,
 *   - the per-page permission states rendered from `getMerchantContext()`.
 * Owners hold every permission (OWNER_PERMISSIONS in `src/lib/merchant.ts`),
 * so nothing here changes what an owner sees.
 */

/** A merchant surface that a staff permission gates. */
export type MerchantSurface =
  | "redeem"
  | "deals"
  | "wallet"
  | "topup"
  | "plan"
  | "more";

/**
 * Surface → the ONE staff permission that makes it usable. `null` marks a
 * read-only/informational surface every merchant user keeps (dashboard,
 * redemption history, alerts, settings, support live behind "more").
 */
const SURFACE_PERMISSION: Record<
  MerchantSurface,
  keyof StaffPermissions | null
> = {
  redeem: "can_verify",
  deals: "can_deals",
  // The wallet tab exists to move money (top up); its ledger stays readable by
  // deep link, but staff who can't top up don't get the entry point.
  wallet: "can_topup",
  topup: "can_topup",
  plan: "can_purchase",
  more: null,
};

/** Can this user act on `surface`? Owners pass everything. */
export function canUseMerchantSurface(
  surface: MerchantSurface,
  permissions: StaffPermissions
): boolean {
  const required = SURFACE_PERMISSION[surface];
  return required === null ? true : permissions[required];
}

export type MerchantNavItem = {
  surface: MerchantSurface;
  href: string;
  label: string;
  /** Path prefixes that light this tab up. */
  match: string[];
};

/** 5b Merchant bottom bar — Redeem / Deals / Wallet / More, in that order. */
const BOTTOM_NAV: MerchantNavItem[] = [
  {
    surface: "redeem",
    href: "/merchant/redeem",
    label: "Redeem",
    match: ["/merchant/redeem"],
  },
  {
    surface: "deals",
    href: "/merchant/deals",
    label: "Deals",
    match: ["/merchant/deals"],
  },
  {
    surface: "wallet",
    href: "/merchant/wallet",
    label: "Wallet",
    match: ["/merchant/wallet", "/merchant/topup"],
  },
  {
    surface: "more",
    href: "/merchant/more",
    label: "More",
    match: [
      "/merchant/more",
      "/merchant/dashboard",
      "/merchant/settings",
      "/merchant/plan",
      "/merchant/staff",
      "/merchant/support",
      "/merchant/alerts",
      "/merchant/redemptions",
    ],
  },
];

/**
 * The bottom-bar tabs this user can actually use. "More" is unconditional, so
 * even a staff member with every permission revoked keeps a usable shell
 * (dashboard, history, settings, support) instead of an empty bar.
 */
export function merchantBottomNavItems(
  permissions: StaffPermissions
): MerchantNavItem[] {
  return BOTTOM_NAV.filter((item) =>
    canUseMerchantSurface(item.surface, permissions)
  );
}

/**
 * Where the merchant console should land this user. Owners and verify-capable
 * staff get the keypad; a staff member without `can_verify` would otherwise
 * land on a permission notice, so send them to their first usable tab.
 */
export function merchantHomeHref(permissions: StaffPermissions): string {
  return merchantBottomNavItems(permissions)[0].href;
}

export type MerchantMoreRow = { href: string; label: string };

/** Rows on the "More" tab, filtered the same way as the bottom bar. */
export function merchantMoreRows(
  permissions: StaffPermissions,
  isOwner: boolean
): MerchantMoreRow[] {
  const rows: MerchantMoreRow[] = [
    { href: "/merchant/dashboard", label: "Dashboard" },
    { href: "/merchant/redemptions", label: "Redemption history" },
    { href: "/merchant/alerts", label: "Alerts" },
  ];
  // Staff roster is owner-only (the staff page and /api/staff both enforce it).
  if (isOwner) rows.push({ href: "/merchant/staff", label: "Staff" });
  if (canUseMerchantSurface("plan", permissions)) {
    rows.push({ href: "/merchant/plan", label: "Plan & billing" });
  }
  rows.push(
    { href: "/merchant/settings", label: "Settings" },
    { href: "/merchant/support", label: "Support" }
  );
  return rows;
}
