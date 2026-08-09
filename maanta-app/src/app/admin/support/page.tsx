import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { computeSla, resolvedAtFromAuditLine, slaAgeHours, slaHoursLabel } from "@/lib/sla";
import { SlaBadge } from "@/components/ui/chips";
import { cn, friendlyTime } from "@/lib/ui";
import { OverrideButton } from "./override-button";

export const dynamic = "force-dynamic";

/**
 * 11e Support / issue resolution — agent_tasks queue with audit-trailed
 * override.
 *
 * D81 SLA aging: the 72h clock starts at `created_at` — the moment the case
 * entered this queue (a case raised on an old redemption starts at zero
 * operational hours). `created_at` is never updated, so reassignment or a
 * refresh cannot reset it. A resolved task's resolution instant is its
 * `admin_ops_log` override row (durable), with the audit line the override
 * appends to the description as the fallback; a hand-completed row with
 * neither gets no verdict rather than an invented one — resolved-late must
 * stay countable, so it is never guessed.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  await requireAdminPage();

  const view = searchParams.view === "resolved" ? "resolved" : "open";
  const service = createServiceClient();
  const { data: tasks } = await service
    .from("agent_tasks")
    .select(
      "id, task_type, priority, description, is_complete, created_at, assigned_to, merchants(merchant_name)"
    )
    .eq("is_complete", view === "resolved")
    .order("created_at", { ascending: false })
    .limit(50);

  const resolvedAt = new Map<string, string>();
  if (view === "resolved" && (tasks ?? []).length > 0) {
    const { data: ops } = await service
      .from("admin_ops_log")
      .select("target_id, created_at")
      .eq("target_type", "agent_task")
      .eq("action", "agent_task.override")
      .in(
        "target_id",
        (tasks ?? []).map((t) => t.id)
      )
      .order("created_at", { ascending: true });
    for (const op of ops ?? []) {
      if (!resolvedAt.has(op.target_id)) resolvedAt.set(op.target_id, op.created_at);
    }
    for (const t of tasks ?? []) {
      if (!resolvedAt.has(t.id)) {
        const parsed = resolvedAtFromAuditLine(t.description);
        if (parsed) resolvedAt.set(t.id, parsed);
      }
    }
  }
  const now = new Date();

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
              view === v ? "bg-ink text-white" : "bg-cream text-muted"
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
          (tasks ?? []).map((t) => {
            const resolved = view === "resolved" ? (resolvedAt.get(t.id) ?? null) : null;
            const sla =
              view === "open" || resolved
                ? computeSla(t.created_at, { resolvedAt: resolved, now })
                : null;
            const owner = t.assigned_to ? "Agent" : "Admin";
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5"
              >
                {/* 11o — the SLA badge leads the support card on mobile; the
                    full hours stay readable (SlaBadge never truncates). */}
                {sla ? (
                  <div className="w-full sm:hidden">
                    <SlaBadge sla={sla} />
                  </div>
                ) : null}
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
                  <p className="mt-0.5 text-xs text-muted">
                    Opened {friendlyTime(t.created_at)}
                    {view === "open"
                      ? ` · Open for ${slaHoursLabel(slaAgeHours(t.created_at, now))}`
                      : ""}
                    {" · "}
                    {owner}
                  </p>
                </div>
                {sla ? (
                  <div className="hidden shrink-0 sm:block">
                    <SlaBadge sla={sla} />
                  </div>
                ) : null}
                {view === "open" ? <OverrideButton taskId={t.id} /> : null}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
