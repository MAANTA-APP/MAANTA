import { Skeleton } from "@/components/ui/states";

/**
 * Agent loading skeleton. The agent layout adds no chrome — each screen frames
 * itself in a mobile column — so this mirrors that frame (max-w-mobile border-x)
 * to stay on-brand while a leads/console query resolves. 7c.
 */
export default function AgentLoading() {
  return (
    <main className="mx-auto min-h-dvh max-w-mobile border-x border-line bg-white px-5 pt-6">
      <p className="sr-only" role="status">
        Loading
      </p>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-4 h-20 w-full" />
      <Skeleton className="mt-6 h-5 w-28" />
      <div className="mt-3 space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </main>
  );
}
