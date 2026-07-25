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
        "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px]",
        active ? "font-semibold text-ink" : "text-faint"
      )}
      aria-current={active ? "page" : undefined}
    >
      {/* R1 — the TabBar active indicator bar is the only amber here. */}
      {active ? (
        <span className="absolute top-0 h-[3px] w-11 rounded-full bg-brand" />
      ) : null}
      <Icon className="h-[18px] w-[18px]" />
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
// Widens to lg:max-w-3xl to stay flush with the merchant frame, which itself
// widens at lg for the tablet-at-the-till two-pane redeem layout. (Was capped
// at max-w-mobile, leaving a 430px nav island under a 768px column.)
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
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-mobile border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:max-w-3xl">
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
