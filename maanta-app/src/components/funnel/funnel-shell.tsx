import Link from "next/link";
import { BrandLockup } from "@/components/marketing/BrandLockup";
import { IconArrowLeft } from "@/components/ui/icons";
import { PILOT_EYEBROW } from "@/lib/marketing/pilot-status";

/**
 * The frame every funnel screen sits in (board 2, M4–M8).
 *
 * Mobile: a slim bar — back button and lockup — then a single column.
 * Desktop: the same bar with a text link instead of the button, then two
 * columns: a dark panel that says what the list is for, and the form.
 *
 * **The TEST treatment is three signals, not one** (M8): a striped rust rule
 * under the bar, a `TEST` badge locked to the lockup, and — inside the form —
 * a bordered notice above the first field. Word and structure carry the state,
 * so it survives a greyscale screenshot. Rust, never amber: amber stays on the
 * one real action so the button still behaves like the button testers test.
 */
export function FunnelShell({
  back,
  aside,
  test = false,
  children,
}: {
  back: { href: string; label: string };
  /** The dark left panel on desktop. Omitted on confirmation screens. */
  aside?: React.ReactNode;
  test?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {test ? (
        <div
          aria-hidden
          className="h-[5px] bg-[repeating-linear-gradient(45deg,theme(colors.rust)_0_7px,theme(colors.stone.ink)_7px_14px)]"
        />
      ) : null}
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5 lg:h-[74px] lg:justify-between lg:px-20 lg:py-0">
        <Link
          href={back.href}
          aria-label={back.label}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-white text-ink lg:hidden"
        >
          <IconArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="MAANTA home" className="flex items-center">
            <BrandLockup className="h-5 w-auto lg:h-[26px]" priority />
          </Link>
          {test ? (
            <span className="rounded-[5px] border-[1.5px] border-rust bg-white px-[7px] py-[5px] font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-rust">
              Test
            </span>
          ) : null}
        </div>
        <Link
          href={back.href}
          className="hidden text-[15px] font-medium text-secondary hover:text-ink lg:inline"
        >
          {back.label}
        </Link>
      </header>

      {aside ? (
        <div className="lg:grid lg:min-h-[600px] lg:grid-cols-2">
          <aside className="hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:px-16 lg:py-20 lg:pl-20">
            {aside}
          </aside>
          <div className="px-5 py-6 lg:flex lg:items-center lg:p-20">
            <div className="mx-auto w-full max-w-xl lg:mx-0 lg:max-w-[460px]">{children}</div>
          </div>
        </div>
      ) : (
        <div className="px-5 py-6 lg:py-14">
          <div className="mx-auto w-full max-w-xl lg:max-w-[520px]">{children}</div>
        </div>
      )}
    </div>
  );
}

/** The pilot-status badge at the top of every dark panel. Amber text is fine on ink. */
export function NodeBadge() {
  return (
    <span className="inline-flex items-center rounded-pill border border-white/25 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
      {PILOT_EYEBROW}
    </span>
  );
}

/** Headline + lede for a dark panel. */
export function AsideCopy({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-7">
        <NodeBadge />
      </div>
      <h2 className="max-w-[20ch] text-balance text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-white">
        {title}
      </h2>
      <div className="mt-5 max-w-[44ch] text-pretty text-lg leading-relaxed text-white/70">
        {children}
      </div>
    </div>
  );
}

/** A tick list on the dark panel — "what you get, and what you don't". */
export function AsideChecklist({ items }: { items: { text: string; negative?: boolean }[] }) {
  return (
    <ul className="mt-9 flex flex-col gap-3.5">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              item.negative ? "border-white/30" : "border-white/60"
            }`}
          >
            {item.negative ? (
              <span className="block h-[1.5px] w-2 bg-white/60" />
            ) : (
              <span className="block h-1.5 w-2.5 -translate-y-px -rotate-45 border-b-[1.5px] border-l-[1.5px] border-white" />
            )}
          </span>
          <span className="text-[15px] leading-snug text-white/85">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Six dim code tiles at the foot of the role-selection panel (M4). Decorative
 * — a claim code has six digits, and this is the shape of one, at 35% white.
 * Not a real code, not a number of anything; hidden from assistive tech.
 */
export function CodeTiles() {
  return (
    <div aria-hidden className="flex gap-2 pt-10">
      {["4", "0", "7", "2", "9", "3"].map((d, i) => (
        <span
          key={i}
          className="flex h-[52px] flex-1 items-center justify-center rounded-[11px] border border-white/15 bg-white/5 font-mono text-[22px] font-bold text-white/35 [font-feature-settings:'zero']"
        >
          {d}
        </span>
      ))}
    </div>
  );
}
