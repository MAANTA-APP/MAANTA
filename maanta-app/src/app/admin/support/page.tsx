import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/ui";
import { OverrideButton } from "./override-button";

export const dynamic = "force-dynamic";

/** 11e Support / issue resolution — agent_tasks queue with audit-trailed override. */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const view = searchParams.view === "resolved" ? "resolved" : "open";
  const service = createServiceClient();
  const { data: tasks } = await service
    .from("agent_tasks")
    .select("id, task_type, priority, description, is_complete, created_at, merchants(merchant_name)")
    .eq("is_complete", view === "resolved")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">
        {view === "open" ? `Open issues (${(tasks ?? []).length})` : "Resolved issues"}
      </h1>

      <div className="mt-5 flex gap-2">
        {(["open", "resolved"] as const).map((v) => (
          <Link
            key={v}
            href={`/admin/support${v === "resolved" ? "?view=resolved" : ""}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize",
              view === v ? "bg-brand text-ink" : "bg-cream text-muted"
            )}
          >
            {v}
          </Link>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(tasks ?? []).length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            {view === "open" ? "No open issues" : "Nothing resolved yet"}
          </p>
        ) : (
          (tasks ?? []).map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">
                  {(t.merchants as unknown as { merchant_name: string } | null)
                    ?.merchant_name ?? "Platform"}
                  {" · "}
                  <span className="font-normal capitalize text-muted">
                    {t.task_type.replace(/_/g, " ")} · {t.priority}
                  </span>
                </p>
                {t.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.description}</p>
                ) : null}
              </div>
              {view === "open" ? <OverrideButton taskId={t.id} /> : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
