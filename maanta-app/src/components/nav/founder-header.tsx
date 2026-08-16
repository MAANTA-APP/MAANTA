import Link from "next/link";
import { LIVE_PRODUCT_LINKS, NEW_TAB_HINT } from "@/components/nav/live-product-links";

/**
 * Founder shell header.
 *
 * The founder dashboard shipped with no navigation of any kind — the layout was a
 * guard plus providers, so the only way off `/founder` was the four `/admin/*`
 * cards inside the page, or the browser. This is the shell's nav.
 *
 * `canOpenAdminConsole` is passed rather than assumed, because the two roles that
 * reach this shell do not have the same reach beyond it: `canAccessFounderDashboard`
 * admits `admin` and `cofounder`, while `canAccessAdminConsole` is `admin` alone
 * by deliberate design. Rendering an unconditional "Admin console" link would put
 * a co-founder one click from a redirect back to `/`.
 *
 * Sober by intent: this is an operator surface, so navigation is quiet ink and
 * line, never amber. Amber is the one primary action per screen, and looking at
 * the live product is not it.
 */
export function FounderHeader({ canOpenAdminConsole }: { canOpenAdminConsole: boolean }) {
  const link =
    "flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-ink";

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 lg:px-10">
        <span className="text-sm font-black tracking-tight text-ink">MAANTA</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Founder
        </span>

        <nav aria-label="Founder navigation" className="ml-auto flex items-center gap-5">
          {canOpenAdminConsole ? (
            <Link href="/admin" className={link}>
              Admin console
            </Link>
          ) : null}
          {LIVE_PRODUCT_LINKS.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className="sr-only">{NEW_TAB_HINT}</span>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
