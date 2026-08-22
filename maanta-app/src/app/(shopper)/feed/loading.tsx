import { Skeleton } from "@/components/ui/states";

/** 7c Loading skeleton for the feed — mirrors the Direction A shapes:
 *  one lead card, the rail it heads, then compact rows. */
export default function FeedLoading() {
  return (
    <main className="px-4 pt-4">
      <p className="sr-only" role="status">
        Loading deals
      </p>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-6 h-72 w-full rounded-card" />
      <div className="mt-3 flex gap-3 overflow-hidden">
        <Skeleton className="h-24 w-64 shrink-0" />
        <Skeleton className="h-24 w-64 shrink-0" />
      </div>
      <div className="mt-6 space-y-4">
        <Skeleton className="h-[104px] w-full rounded-card" />
        <Skeleton className="h-[104px] w-full rounded-card" />
        <Skeleton className="h-[104px] w-full rounded-card" />
      </div>
    </main>
  );
}
