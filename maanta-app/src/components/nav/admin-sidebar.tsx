"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import { IconMenu, IconX } from "@/components/ui/icons";
import { LIVE_PRODUCT_LINKS, NEW_TAB_HINT } from "@/components/nav/live-product-links";
import SignOutButton from "@/app/sign-out-button";

/**
 * The sign-out control's look on ink. `SignOutButton`'s default is an ink
 * label for white shells; on this sidebar that would be black on black, so
 * the same tokens as every other row here are passed in — white/80, the
 * hover wash, the same padding — and the button reads as the last row of
 * the list rather than a control of a different species (D258).
 */
const SIGN_OUT_ON_INK =
  "block w-full rounded-lg px-4 py-2.5 text-left text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white";
/** The "still signed in" line, on the same ground. */
const SIGN_OUT_MESSAGE_ON_INK = "px-4 text-white/80";

/**
 * Admin left sidebar (black, amber active item) — collapses to ☰ on mobile.
 *
 * ## Task-oriented, not resource-oriented (founder brief 2026-09-03)
 *
 * The previous list was thirteen database objects in a column. An operator
 * had to decide which table their task lived in before they could start it.
 * The list now follows the work: what needs attention, then the four things
 * an operator actually handles — merchants, shoppers, deals, and the physical
 * visit — then support, how the node is running, and the audit trail.
 *
 * Nothing was deleted. `/admin/approvals`, `/admin/pilot`, `/admin/agents`
 * and `/admin/redemptions` still exist and are reached from the surfaces that
 * own them (the Action Queue and Home link straight to an approval; Operations
 * carries the pilot and field-agent views; Visits carries the Guardian and
 * fraud review). They are simply not top-level decisions any more.
 *
 * Below the first rule sit the low-frequency system tools. Below the second
 * rule, everything that leaves the console: `/founder` is a different shell,
 * and the live-product links are the public product.
 */
const ITEMS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/queue", label: "Action queue" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/customers", label: "Shoppers" },
  { href: "/admin/deals", label: "Deals" },
  { href: "/admin/visits", label: "Visits & redemptions" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/operations", label: "Operations" },
  { href: "/admin/audit", label: "Audit" },
];

/** Lower-frequency system tools, below a visual divider. */
const SYSTEM_ITEMS = [
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/resources", label: "Resources" },
];

/**
 * Routes that are reached from a section rather than listed. Each is
 * highlighted under its owning section so an operator on `/admin/approvals`
 * sees "Merchants" lit, not nothing.
 */
const OWNED_BY: Record<string, string> = {
  "/admin/approvals": "/admin/merchants",
  "/admin/redemptions": "/admin/visits",
  "/admin/pilot": "/admin/operations",
  "/admin/agents": "/admin/operations",
};

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  return Object.entries(OWNED_BY).some(
    ([owned, owner]) =>
      owner === href && (pathname === owned || pathname.startsWith(`${owned}/`))
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const item = (i: { href: string; label: string }) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={() => setOpen(false)}
      aria-current={isActive(pathname, i.href) ? "page" : undefined}
      className={cn(
        "rounded-lg px-4 py-2.5 text-sm font-semibold",
        isActive(pathname, i.href)
          ? "text-brand"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      )}
    >
      {i.label}
    </Link>
  );

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      {ITEMS.map(item)}

      {/* System tools — legitimate, low-frequency, and not where the work is. */}
      <div className="mt-3 flex flex-col gap-1 border-t border-white/15 pt-3">
        <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
          System
        </p>
        {SYSTEM_ITEMS.map(item)}
      </div>

      {/* Everything past this rule leaves the admin console.

          `/founder` needs no group label — its own name is the label — and it keeps
          <Link> and the same tab, because switching shells is a deliberate move,
          unlike the live-product links below where the point is to glance without
          losing your place in a queue. Every role that can see this sidebar can
          reach it: `canAccessAdminConsole` is `admin` alone and
          `canAccessFounderDashboard` admits `admin`, so it is never a link into a
          wall. It carries **no active state** on purpose — `/founder` renders
          `FounderHeader` in its own layout, not this sidebar, so an `isActive`
          branch here could never be true. */}
      <div className="mt-3 border-t border-white/15 pt-3">
        <Link
          href="/founder"
          onClick={() => setOpen(false)}
          className="block rounded-lg px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          Founder
        </Link>

        {/* Live product — quiet, and never amber: amber marks the active console
            item, and these are somewhere to look, not the work. Plain <a> rather
            than <Link> because leaving the app shell entirely is the point.
            white/70, not /40: at 11px on ink, 40% composites to ~3.3:1 and fails
            the 4.5:1 floor for small text. */}
        <p className="mt-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
          Live product
        </p>
        {LIVE_PRODUCT_LINKS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className="sr-only">{NEW_TAB_HINT}</span>
          </a>
        ))}
      </div>

      {/* Ending the session is the last thing in the list and the only thing
          past this rule. Until 2026-09-03 neither privileged shell had it: an
          admin on a shared device ended a session by navigating out to a
          shopper or merchant surface and finding the control there (D258).
          The same strategy-aware button as `/you` and merchant settings —
          never a second logout implementation. It is inside `nav`, so it is
          in the desktop sidebar and the phone drawer alike. */}
      <div className="mt-3 border-t border-white/15 pt-3">
        <SignOutButton className={SIGN_OUT_ON_INK} messageClassName={SIGN_OUT_MESSAGE_ON_INK} />
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto rounded-r-2xl bg-ink lg:block">
        <div className="px-6 pb-2 pt-6 text-lg font-black tracking-tight text-white">
          MAANTA
        </div>
        {nav}
      </aside>

      {/* Mobile: hamburger + drawer */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed left-4 top-3.5 z-40 rounded-lg bg-white p-1.5 text-ink lg:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-ink">
            <div className="flex items-center justify-between px-6 pt-5 text-white">
              <span className="text-lg font-black tracking-tight">MAANTA</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
    </>
  );
}
