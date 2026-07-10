"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import {
  IconHome,
  IconSearch,
  IconTicket,
  IconUser,
  IconKeypad,
  IconWallet,
  IconMore,
} from "@/components/ui/icons";

function BarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold",
        active ? "text-ink" : "text-faint"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={cn(
          "flex h-8 w-12 items-center justify-center rounded-full",
          active && "bg-brand"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </Link>
  );
}

/** 5a Shopper bottom bar — Feed / Search / Deals / You. */
export function ShopperBottomBar() {
  const pathname = usePathname();
  const items = [
    { href: "/feed", label: "Feed", icon: IconHome, match: ["/feed", "/deals"] },
    { href: "/search", label: "Search", icon: IconSearch, match: ["/search"] },
    { href: "/my-deals", label: "Deals", icon: IconTicket, match: ["/my-deals", "/tickets"] },
    { href: "/profile", label: "You", icon: IconUser, match: ["/profile", "/help", "/notifications"] },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-mobile border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {items.map((i) => (
          <BarLink
            key={i.href}
            href={i.href}
            label={i.label}
            icon={i.icon}
            active={i.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))}
          />
        ))}
      </div>
    </nav>
  );
}

/** 5b Merchant bottom bar — Redeem / Deals / Wallet / More. */
export function MerchantBottomBar() {
  const pathname = usePathname();
  const items = [
    { href: "/merchant/redeem", label: "Redeem", icon: IconKeypad, match: ["/merchant/redeem"] },
    { href: "/merchant/deals", label: "Deals", icon: IconTicket, match: ["/merchant/deals"] },
    { href: "/merchant/wallet", label: "Wallet", icon: IconWallet, match: ["/merchant/wallet", "/merchant/topup"] },
    {
      href: "/merchant/more",
      label: "More",
      icon: IconMore,
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
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-mobile border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {items.map((i) => (
          <BarLink
            key={i.href}
            href={i.href}
            label={i.label}
            icon={i.icon}
            active={i.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))}
          />
        ))}
      </div>
    </nav>
  );
}
