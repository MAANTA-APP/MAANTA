import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { relativeAgo } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireAdminPage();

  const service = createServiceClient();
  const { data: entries, error } = await service
    .from("admin_ops_log")
    .select("id, admin_user_id, action, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">Admin audit</h1>
        <div className="mt-5">
          <AdminReadError what="the admin audit trail" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Admin audit</h1>
        <p className="text-xs text-muted">Latest 100 recorded admin mutations · read only</p>
      </div>

      <div className="mt-5 space-y-2">
        {(entries ?? []).length === 0 ? (
          <p className="rounded-card bg-white px-4 py-8 text-center text-sm text-muted shadow-card">
            No admin actions recorded yet
          </p>
        ) : (
          (entries ?? []).map((entry) => (
            <article key={entry.id} className="rounded-card bg-white px-4 py-3.5 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-ink">{entry.action}</p>
                <p className="text-xs text-muted">{relativeAgo(entry.created_at)}</p>
              </div>
              <p className="mt-1 text-xs text-muted">
                {entry.target_type} · target {String(entry.target_id).slice(0, 8)}… · admin{" "}
                {String(entry.admin_user_id).slice(0, 8)}…
              </p>
              {entry.details && Object.keys(entry.details as Record<string, unknown>).length > 0 ? (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-stone px-3 py-2 text-[11px] leading-relaxed text-secondary">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              ) : null}
            </article>
          ))
        )}
      </div>
    </main>
  );
}
