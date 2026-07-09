"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import { IconMenu, IconX } from "@/components/ui/icons";

/** 5e Admin left sidebar (black, yellow active item) — collapses to ☰ on mobile (11k). */
const ITEMS = [
  { href: "/admin", label: "Approvals" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/deals", label: "Deals" },
  { href: "/admin/redemptions", label: "Redemptions" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/billing", label: "Billing" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          onClick={() => setOpen(false)}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-semibold",
            isActive(pathname, i.href)
              ? "text-brand"
              : "text-white/80 hover:bg-white/10 hover:text-white"
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 rounded-r-2xl bg-ink lg:block">
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
          <div className="absolute inset-y-0 left-0 w-64 bg-ink">
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
