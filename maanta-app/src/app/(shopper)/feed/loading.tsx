import { DealCardSkeleton, Skeleton } from "@/components/ui/states";

/** 7c Loading skeleton for the feed. */
export default function FeedLoading() {
  return (
    <main className="px-4 pt-4">
      <p className="sr-only" role="status">
        Loading deals
      </p>
      <Skeleton className="h-8 w-32" />
      <div className="mt-6 flex gap-3 overflow-hidden">
        <Skeleton className="h-24 w-64 shrink-0" />
        <Skeleton className="h-24 w-64 shrink-0" />
      </div>
      <div className="mt-6 space-y-4">
        <DealCardSkeleton />
        <DealCardSkeleton />
      </div>
    </main>
  );
}
