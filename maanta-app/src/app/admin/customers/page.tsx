import { createServiceClient } from "@/lib/supabase/service";
import { orIlikeAny } from "@/lib/supabase/filters";
import { requireAdminPage } from "@/lib/admin";
import { SearchField } from "@/components/ui/inputs";
import { StatusChip } from "@/components/ui/chips";
import { friendlyTime, maskPhone } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * A2 — Admin customers / users list.
 *
 * Lists rows straight from `public.users` (not a shadow schema). Read-only: no
 * auth/role writes happen here — this only surfaces who exists. Money-free
 * surface, so no money-typography concerns.
 */

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  merchant_admin: "Merchant",
  merchant_staff: "Staff",
  agent: "Agent",
  admin: "Admin",
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: { q?: string; role?: string };
}) {
  await requireAdminPage();

  const q = (searchParams.q ?? "").trim();
  const role = (searchParams.role ?? "").trim();

  const service = createServiceClient();
  let query = service
    .from("users")
    .select("id, full_name, email, phone, role, is_blacklisted, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  // `.or()` takes PostgREST's filter DSL, not a bound value — interpolating `q`
  // straight into it let a comma inject an extra top-level predicate (D69).
  const search = orIlikeAny(["full_name", "email", "phone"], q);
  if (search) query = query.or(search);
  if (role && ROLE_LABEL[role]) query = query.eq("role", role);
  const { data: users } = await query;

  const ROLE_FILTERS = ["all", "customer", "merchant_admin", "agent", "admin"] as const;
  const active = role && ROLE_LABEL[role] ? role : "all";

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Customers</h1>
      <p className="mt-1 text-sm text-muted">
        Everyone with a Maanta account — shoppers, merchants, staff and agents.
      </p>

      <form className="mt-5 max-w-md" action="/admin/customers">
        {role ? <input type="hidden" name="role" value={role} /> : null}
        <SearchField name="q" defaultValue={q} placeholder="Search name, email or phone…" />
      </form>

      {/* Neutral (non-amber) role filter pills — A6: keep the single amber mark
          for the active nav item, not per-filter pills. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {ROLE_FILTERS.map((r) => {
          const href =
            r === "all"
              ? `/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`
              : `/admin/customers?role=${r}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          const on = active === r;
          return (
            <a
              key={r}
              href={href}
              className={
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize " +
                (on
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:bg-cream/50")
              }
            >
              {r === "all" ? "All" : ROLE_LABEL[r]}
            </a>
          );
        })}
      </div>

      <div className="mt-5 overflow-hidden rounded-card border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                  No customers match this view
                </td>
              </tr>
            ) : (
              (users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink">
                      {u.full_name ?? "—"}
                    </span>
                    {u.is_blacklisted ? (
                      <StatusChip
                        status="flagged"
                        label="Blacklisted"
                        className="ml-2 align-middle"
                      />
                    ) : null}
                    <span className="mt-0.5 block font-mono text-[11px] text-faint">
                      {u.id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {u.email ? (
                      <span className="block truncate">{u.email}</span>
                    ) : null}
                    {u.phone ? (
                      <span className="block text-xs text-muted">{maskPhone(u.phone)}</span>
                    ) : null}
                    {!u.email && !u.phone ? <span className="text-muted">—</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border border-ink bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {friendlyTime(u.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-faint">
        Showing up to 100 most-recent accounts. Pagination and per-user detail are
        follow-up work.
      </p>
    </main>
  );
}
