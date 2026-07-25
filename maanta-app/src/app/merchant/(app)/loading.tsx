import { Skeleton } from "@/components/ui/states";

/**
 * Merchant app loading skeleton — the top/bottom bars live in the layout and
 * stay put; this fills the content slot for dashboard, deals, wallet, topup,
 * plan, staff, redemptions, etc. so navigation shows structure, not a frozen
 * frame. 7c.
 */
export default function MerchantLoading() {
  return (
    <main className="px-5 pt-5">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="mt-6 h-5 w-32" />
      <div className="mt-3 space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </main>
  );
}
