import Link from "next/link";

/**
 * The founder dashboard's Operations block.
 *
 * Every card here points into `/admin/*`, and the two roles that reach this
 * dashboard do not both get in: `canAccessFounderDashboard` admits `admin` and
 * `cofounder`, while `canAccessAdminConsole` is `admin` alone. Rendered
 * unconditionally — as they were until now — all four are one click from
 * `requireAdminPage`'s `redirect("/")` for a co-founder: the dashboard would
 * offer work the reader is not allowed to open, and bounce them off the product
 * for trying.
 *
 * The fix keeps the information and drops the action. A co-founder still sees
 * every queue and its count, because that is executive read-only context and the
 * point of the role; they just do not get a link into a console that will refuse
 * them, and one plain line says why rather than leaving four dead cards to
 * explain themselves.
 */
const CARD =
  "rounded-card border border-line bg-white px-4 py-4 shadow-card";

export function OperationsLinks({
  canOpenAdminConsole,
  pendingMerchants,
}: {
  canOpenAdminConsole: boolean;
  pendingMerchants: number;
}) {
  const items = [
    { href: "/admin/support", title: "Support queue", sub: "Review and resolve agent tasks" },
    { href: "/admin", title: "Merchant approvals", sub: `${pendingMerchants} shops waiting` },
    { href: "/admin/reports", title: "Platform reports", sub: "14-day redemption chart + KPIs" },
    {
      href: "/admin/redemptions",
      title: "Redemptions",
      sub: "Guardian, disputes, fee reversals",
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) =>
          canOpenAdminConsole ? (
            <Link key={i.href} href={i.href} className={`${CARD} transition hover:bg-stone-soft`}>
              <p className="text-sm font-semibold text-ink">{i.title}</p>
              <p className="mt-0.5 text-xs text-muted">{i.sub}</p>
            </Link>
          ) : (
            <div key={i.href} className={CARD}>
              <p className="text-sm font-semibold text-ink">{i.title}</p>
              <p className="mt-0.5 text-xs text-muted">{i.sub}</p>
            </div>
          )
        )}
      </div>
      {canOpenAdminConsole ? null : (
        <p className="mt-3 text-xs text-muted">
          Read-only. These queues are worked in the admin console, which this role does not
          open.
        </p>
      )}
    </>
  );
}
