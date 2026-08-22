import { requireAdminPage } from "@/lib/admin";
import {
  ADMIN_RESOURCES,
  AUDIENCE_LABELS,
  type ResourceAudience,
} from "@/lib/admin-resources";
import { NEW_TAB_HINT } from "@/components/nav/live-product-links";

export const dynamic = "force-dynamic";

/**
 * Admin resource centre — every audience-facing resource in one audited place.
 *
 * Three states, rendered differently on purpose: live surfaces open (new tab,
 * same rule as the sidebar's live-product links), references say exactly where
 * the document lives since the app cannot serve `docs/` or Notion, and missing
 * items say so plainly — a visible gap gets written, an omitted one gets
 * rediscovered.
 */
export default async function AdminResourcesPage() {
  await requireAdminPage();

  const order: ResourceAudience[] = ["shopper", "merchant", "agent", "mall_operator", "ops"];

  return (
    <main className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink">Resources</h1>
      <p className="mt-1 text-sm text-muted">
        Everything audience-facing, by audience. Live pages open in a new tab; documents the
        app cannot serve name their exact home; missing items are listed so the gap stays
        visible.
      </p>

      {order.map((aud) => {
        const items = ADMIN_RESOURCES.filter((r) => r.audience === aud);
        return (
          <section key={aud} className="mt-7">
            <h2 className="text-base font-bold text-ink">{AUDIENCE_LABELS[aud]}</h2>
            <div className="mt-2 space-y-2">
              {items.map((r) => {
                const base =
                  "flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card bg-white shadow-card px-4 py-3";
                if (r.access.kind === "live") {
                  return (
                    <a
                      key={r.title}
                      href={r.access.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${base} hover:bg-stone-soft`}
                    >
                      <span className="text-sm font-semibold text-ink">{r.title}</span>
                      <span className="text-xs text-muted">{r.description}</span>
                      <span className="ml-auto font-code text-xs text-secondary">
                        {r.access.href}
                      </span>
                      <span className="sr-only">{NEW_TAB_HINT}</span>
                    </a>
                  );
                }
                if (r.access.kind === "reference") {
                  return (
                    <div key={r.title} className={base}>
                      <span className="text-sm font-semibold text-ink">{r.title}</span>
                      <span className="text-xs text-muted">{r.description}</span>
                      <span className="ml-auto font-code text-xs text-secondary">
                        {r.access.location}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={r.title} className={`${base} border-dashed`}>
                    <span className="text-sm font-semibold text-secondary">{r.title}</span>
                    <span className="text-xs text-muted">{r.description}</span>
                    <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-muted">
                      Not written yet · {r.access.owner}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="mt-8 text-xs text-muted">
        Live legal pages are the less-sensitive versions by construction: they render the
        draft set without the counsel note, behind the draft banner, and none is
        lawyer-reviewed yet. The counsel set stays in <span className="font-code">docs/legal/</span>.
      </p>
    </main>
  );
}
