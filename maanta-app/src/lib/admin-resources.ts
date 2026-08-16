/**
 * The admin resource centre's registry (11-series console).
 *
 * One audited list of every resource an admin reaches for — shopper, merchant,
 * agent and mall-operator material — instead of bookmarks and tribal memory.
 * Three access kinds, because the honest states differ:
 *
 *  - **live**: served by this app right now. The four legal routes are the
 *    "less sensitive" versions by construction — they render
 *    `src/content/legal/*.md` (the DRAFT set, behind the draft banner) without
 *    the counsel note that stays in `docs/legal/`.
 *  - **reference**: exists, but outside the deployment. Vercel's root directory
 *    is `maanta-app`, so nothing under `docs/` or in Notion is in the production
 *    bundle — the app cannot open these, only say exactly where they live.
 *    Shipping them into the bundle is also not wanted: several runbooks carry
 *    operational detail that has no business in client-adjacent code.
 *  - **missing**: asked for and not yet written. Welcome packs are the standing
 *    example — none exists for any audience. Listed rather than omitted, because
 *    a gap you can see gets written and a gap you can't gets rediscovered.
 */

export type ResourceAudience = "shopper" | "merchant" | "agent" | "mall_operator" | "ops";

export type ResourceAccess =
  | { kind: "live"; href: string }
  | { kind: "reference"; location: string }
  | { kind: "missing"; owner: string };

export type AdminResource = {
  title: string;
  description: string;
  audience: ResourceAudience;
  access: ResourceAccess;
};

export const AUDIENCE_LABELS: Record<ResourceAudience, string> = {
  shopper: "Shoppers",
  merchant: "Merchants",
  agent: "Agents",
  mall_operator: "Mall operators",
  ops: "Ops — all audiences",
};

export const ADMIN_RESOURCES: AdminResource[] = [
  // ── Shoppers ────────────────────────────────────────────────────────────
  {
    title: "How Maanta works — shoppers",
    description: "The public explainer: claim, code, counter.",
    audience: "shopper",
    access: { kind: "live", href: "/shoppers" },
  },
  {
    title: "Help centre",
    description: "Live help content shoppers see.",
    audience: "shopper",
    access: { kind: "live", href: "/help" },
  },
  {
    title: "FAQ",
    description: "Public questions and answers.",
    audience: "shopper",
    access: { kind: "live", href: "/faq" },
  },
  {
    title: "Install the app",
    description: "The PWA install landing shoppers are sent to.",
    audience: "shopper",
    access: { kind: "live", href: "/download" },
  },
  {
    title: "Terms of service (DRAFT)",
    description: "Live public version — no counsel note. Not lawyer-reviewed.",
    audience: "shopper",
    access: { kind: "live", href: "/terms" },
  },
  {
    title: "Privacy policy (DRAFT)",
    description: "Live public version — no counsel note. Not lawyer-reviewed.",
    audience: "shopper",
    access: { kind: "live", href: "/privacy" },
  },
  {
    title: "Cookie notice (DRAFT)",
    description: "Live public version — no counsel note. Not lawyer-reviewed.",
    audience: "shopper",
    access: { kind: "live", href: "/cookies" },
  },
  {
    title: "Shopper welcome pack",
    description: "Does not exist yet — nothing to hand a first-time shopper beyond the app.",
    audience: "shopper",
    access: { kind: "missing", owner: "founder" },
  },

  // ── Merchants ───────────────────────────────────────────────────────────
  {
    title: "Merchant pitch page",
    description: "What a prospect sees: success fee, opening credit, Elite trial.",
    audience: "merchant",
    access: { kind: "live", href: "/merchants" },
  },
  {
    title: "Merchant join flow",
    description: "The self-serve entry to onboarding.",
    audience: "merchant",
    access: { kind: "live", href: "/merchants/join" },
  },
  {
    title: "Pricing & the success fee",
    description: "Public pricing — Standard and Elite, never 'Free'.",
    audience: "merchant",
    access: { kind: "live", href: "/pricing" },
  },
  {
    title: "Merchant terms (DRAFT)",
    description: "Live public version — includes the opening-credit clause (§7.8).",
    audience: "merchant",
    access: { kind: "live", href: "/merchant-terms" },
  },
  {
    title: "Merchant lifecycle runbook",
    description: "Pending → active → live states and who moves them.",
    audience: "merchant",
    access: { kind: "reference", location: "repo: docs/ops/merchant-lifecycle.md" },
  },
  {
    title: "Merchant welcome pack",
    description: "Does not exist yet — activation is currently verbal plus the app.",
    audience: "merchant",
    access: { kind: "missing", owner: "founder" },
  },

  // ── Agents ──────────────────────────────────────────────────────────────
  {
    title: "Agent rotations and roles",
    description: "Pairs, swaps and rota rules for the BBS floor team.",
    audience: "agent",
    access: { kind: "reference", location: "Notion: Agent rotations and roles – MAANTA BBS rehearsal" },
  },
  {
    title: "Field templates and launch rota",
    description: "Day-sheet templates the floor team fills in.",
    audience: "agent",
    access: { kind: "reference", location: "Notion: Field templates and launch rota – MAANTA BBS" },
  },
  {
    title: "Role tasks — Nairobi 150",
    description: "Per-role task list for the launch push.",
    audience: "agent",
    access: { kind: "reference", location: "repo: docs/ops/role-tasks-nairobi-150-2026-07.md" },
  },
  {
    title: "Agent welcome pack / SOP",
    description: "Does not exist yet — agent onboarding is run from the rota docs above.",
    audience: "agent",
    access: { kind: "missing", owner: "founder" },
  },

  // ── Mall operators ──────────────────────────────────────────────────────
  {
    title: "Mall operators page",
    description: "The public pitch to a mall operator.",
    audience: "mall_operator",
    access: { kind: "live", href: "/mall-operators" },
  },
  {
    title: "BBS Mall page",
    description: "The Node 0 mall surface.",
    audience: "mall_operator",
    access: { kind: "live", href: "/malls/bbs-mall" },
  },
  {
    title: "Mall operator email sequence",
    description: "The outreach sequence, by segment.",
    audience: "mall_operator",
    access: { kind: "reference", location: "repo: docs/maanta-mall-operator-email-sequence.md" },
  },
  {
    title: "Mall operator welcome pack",
    description: "Does not exist yet.",
    audience: "mall_operator",
    access: { kind: "missing", owner: "founder" },
  },

  // ── Ops, all audiences ──────────────────────────────────────────────────
  {
    title: "Launch ops runbook",
    description: "The day-to-day operating SOP for launch.",
    audience: "ops",
    access: { kind: "reference", location: "repo: docs/maanta-launch-ops-runbook.md" },
  },
  {
    title: "Demo mode runbook",
    description: "How to check and flip demo mode, and what it gates.",
    audience: "ops",
    access: { kind: "reference", location: "repo: docs/ops/demo-mode-runbook.md" },
  },
  {
    title: "Redemption disputes SOP",
    description: "Verify-anyway aftermath: how disputes route and resolve.",
    audience: "ops",
    access: { kind: "reference", location: "repo: docs/skills/redemption-disputes.md" },
  },
];
