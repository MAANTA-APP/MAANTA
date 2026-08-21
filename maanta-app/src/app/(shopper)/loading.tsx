import { DealCardSkeleton, Skeleton } from "@/components/ui/states";

/**
 * Generic shopper loading skeleton — covers deals, my-deals, search, shops,
 * tickets, profile, help, notifications (the feed keeps its own richer
 * skeleton). Every shopper route now shows structure instead of a blank frame
 * on navigation. 7c.
 */
export default function ShopperLoading() {
  return (
    <main className="px-4 pt-5">
      <p className="sr-only" role="status">
        Loading deals
      </p>
      <Skeleton className="h-7 w-40" />
      <div className="mt-6 space-y-4">
        <DealCardSkeleton />
        <DealCardSkeleton />
        <DealCardSkeleton />
      </div>
    </main>
  );
}
