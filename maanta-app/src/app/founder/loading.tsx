import { Skeleton } from "@/components/ui/states";

export default function FounderLoading() {
  return (
    <div>
      <p className="sr-only" role="status">
        Loading
      </p>
      <Skeleton className="h-7 w-48" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
