import { Skeleton } from "@/components/ui/states";

/**
 * Admin loading skeleton — the sidebar lives in the layout; this fills the
 * padded content column (approvals, merchants, deals, redemptions, billing,
 * reports, support, customers) so an operator sees structure while a query
 * resolves. 7c.
 */
export default function AdminLoading() {
  return (
    <div>
      <p className="sr-only" role="status">
        Loading
      </p>
      <Skeleton className="h-7 w-48" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
