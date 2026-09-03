import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { cn, friendlyTime, relativeAgo } from "@/lib/ui";
import { OverrideButton } from "./override-button";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

/**
 * Support — the `agent_tasks` queue, with an audit-trailed override.
 *
 * Each task names its merchant, and the name opens that merchant's 360 view
 * at the support section, so an operator reads the ticket in the context of
 * the shop's deals, claims and ledger rather than in isolation. Overdue is
 * `due_at < now` on an open task — the column the schema already carries.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  await requireAdminPage();

  const view = searchParams.view === "resolved" ? "resolved" : "open";
  const service = createServiceClient();
  const { data: tasks, error } = await service
    .from("agent_tasks")
    .select("id, task_type, priority, description, is_complete, created_at, due_at, merchant_id, merchants(merchant_name)")
    .eq("is_complete", view === "resolved")
    .order("created_at", { ascending: view !== "open" })
    .limit(50);

  if (error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Support</h1>
        <div className="mt-5"><AdminReadError what="support tasks" /></div>
      </main>
    );
  }

  const now = new Date();
  const overdueCount = (tasks ?? []).filter(
    (t) => !t.is_complete && t.due_at && new Date(t.due_at) < now
  ).length;

  return (
    <main className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {view === "open" ? `Open issues (${(tasks ?? []).length})` : "Resolved issues"}
        </h1>
        {/* Quiet, not amber: the queue's override buttons carry the amber budget. */}
        <Link
          href="/admin/support/new"
          className="rounded-full border border-ink bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-cream"
        >
          Log an issue
        </Link>
      </div>
      {view === "open" && overdueCount > 0 ? (
        <p className="mt-1 text-sm text-ink">
          <strong className="font-semibold">{overdueCount} overdue</strong> — open past the due time.
        </p>
      ) : null}

      <div className="mt-5 flex gap-2">
        {(["open", "resolved"] as const).map((v) => (
          <Link
            key={v}
            href={`/admin/support${v === "resolved" ? "?view=resolved" : ""}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize",
              view === v ? "bg-ink text-white" : "bg-cream text-muted"
            )}
          >
            {v}
          </Link>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(tasks ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-8 text-center text-sm text-muted">
            {view === "open" ? "No open issues" : "Nothing resolved yet"}
          </p>
        ) : (
          (tasks ?? []).map((t) => {
            const overdue = !t.is_complete && t.due_at && new Date(t.due_at) < now;
            const merchantName =
              (t.merchants as unknown as { merchant_name: string } | null)?.merchant_name ?? "Platform";
            return (
              <div
                key={t.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-card border bg-white px-4 py-3.5 shadow-card",
                  overdue ? "border-flame/50" : "border-transparent"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    <Link
                      href={`/admin/merchants/${t.merchant_id}#support`}
                      className="underline-offset-2 hover:underline"
                    >
                      {merchantName}
                    </Link>
                    {" · "}
                    <span className="font-normal capitalize text-muted">
                      {t.task_type.replace(/_/g, " ")} · {t.priority}
                    </span>
                    {overdue ? (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-ink">
                        overdue
                      </span>
                    ) : null}
                  </p>
                  {t.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.description}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-faint">
                    opened {relativeAgo(t.created_at, now)}
                    {t.due_at ? ` · due ${friendlyTime(t.due_at, now)}` : ""}
                  </p>
                </div>
                {view === "open" ? <OverrideButton taskId={t.id} /> : null}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
