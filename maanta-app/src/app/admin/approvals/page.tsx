import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { ButtonLink } from "@/components/ui/button";
import { SearchField } from "@/components/ui/inputs";
import { relativeAgo } from "@/lib/ui";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

/** 11a Merchant approval queue — moved from /admin when the dashboard took the
 * console's front door (2026-08-16). Content unchanged. */
export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireAdminPage();

  const q = (searchParams.q ?? "").trim();
  const service = createServiceClient();
  let query = service
    .from("merchants")
    .select("id, merchant_name, floor, unit_number, phone, email, what3words_address, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("merchant_name", `%${q}%`);
  const { data: pending, error } = await query;

  if (error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Pending approvals</h1>
        <div className="mt-5"><AdminReadError what="pending approvals" /></div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">
        Pending approvals ({(pending ?? []).length})
      </h1>

      <form className="mt-5 max-w-md" action="/admin/approvals">
        <SearchField name="q" defaultValue={q} placeholder="Search shops…" />
      </form>

      <div className="mt-5 space-y-3">
        {(pending ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-8 text-center text-sm text-muted">
            No shops waiting for approval
          </p>
        ) : (
          (pending ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-card bg-white shadow-card px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/merchants/${m.id}`}
                  className="text-sm font-bold text-ink hover:underline"
                >
                  {m.merchant_name}
                  {m.floor ? ` — ${m.floor}` : ""}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  Submitted {relativeAgo(m.created_at)} · {m.phone ?? m.email ?? "No contact"}
                </p>
              </div>
              <ButtonLink href={`/admin/merchants/${m.id}`} size="sm">
                Review
              </ButtonLink>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
