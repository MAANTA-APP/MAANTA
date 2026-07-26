"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/ui";
import { Button, ButtonLink, type ButtonVariant } from "@/components/ui/button";
import { IconChevronDown, IconChevronLeft } from "@/components/ui/icons";

/** Primary CTA — wraps Frozen Button (amber + black label). */
export function PrimaryButton(
  props: React.ComponentProps<typeof Button>
) {
  return <Button variant="primary" {...props} />;
}

export function PrimaryButtonLink(
  props: React.ComponentProps<typeof ButtonLink>
) {
  return <ButtonLink variant="primary" {...props} />;
}

export function SecondaryButton({
  variant = "secondary",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant"> & {
  variant?: ButtonVariant;
}) {
  return <Button variant={variant} {...props} />;
}

export function SecondaryButtonLink(
  props: React.ComponentProps<typeof ButtonLink>
) {
  return <ButtonLink variant="ghost" {...props} />;
}

/** Square/round icon control — 44px touch target. */
export function IconButton({
  children,
  className,
  label,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink shadow-card transition motion-safe:active:scale-[0.97]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Neutral informational chip. */
export function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-stone-soft px-2.5 py-1 text-[11px] font-semibold text-ink",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Toggleable filter chip (Browse category / time). */
export function FilterChip({
  children,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition",
        active
          ? "bg-ink text-white"
          : "border border-line bg-white text-muted hover:bg-stone-soft",
        className
      )}
    >
      {children}
    </button>
  );
}

type Option = { value: string; label: string };

/** Compact dropdown for feed/deals filter and sort controls. */
export function FilterDropdown({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative min-w-0 flex-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-full border border-line bg-white px-3 text-left text-[12px] font-semibold text-ink shadow-card"
      >
        <span className="truncate">
          <span className="text-muted">{label}: </span>
          {selected}
        </span>
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-card border border-line bg-white py-1 shadow-card"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-[12px] font-semibold",
                  o.value === value ? "bg-stone-soft text-ink" : "text-muted hover:bg-stone-soft/70"
                )}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Back affordance — uses history when available, else a safe fallback route. */
export function BackButton({
  fallback = "/feed",
  label = "Back",
  className,
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold text-ink transition hover:text-muted",
        className
      )}
    >
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white shadow-card"
        aria-hidden
      >
        <IconChevronLeft className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}

/** Icon-only back for hero headers (deal detail, tickets). */
export function BackIconButton({
  fallback = "/feed",
  className,
  ariaLabel = "Back",
}: {
  fallback?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={cn(
        "rounded-full bg-white/90 p-2 text-ink shadow",
        className
      )}
    >
      <IconChevronLeft className="h-5 w-5" />
    </button>
  );
}

/**
 * Compact segmented control (My deals Deals/Shops, Active/Past).
 * Link-based so server pages can filter via searchParams without client state.
 */
export function SegmentedLinks({
  tabs,
  active,
  className,
}: {
  tabs: { href: string; label: string; value: string }[];
  active: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-8 overflow-hidden rounded-full border border-line bg-stone-soft p-0.5",
        className
      )}
      role="tablist"
    >
      {tabs.map((t) => {
        const selected = active === t.value;
        return (
          <Link
            key={t.value}
            href={t.href}
            role="tab"
            aria-selected={selected}
            className={cn(
              "flex h-full flex-1 items-center justify-center rounded-full text-[12px] font-semibold transition",
              selected ? "bg-ink text-white" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Back to You — history-aware with /you fallback. */
export function BackToYouLink({ className }: { className?: string }) {
  return <BackButton fallback="/you" className={className} />;
}

/** @deprecated Use BackToYouLink — kept for gradual migration. */
export const BackToProfileLink = BackToYouLink;

/** Current location pill — Discover / Browse top bar. */
export function LocationPill({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex max-w-[85%] items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-left shadow-card transition hover:bg-stone-soft motion-safe:active:scale-[0.99]",
        className
      )}
      aria-label={`Current location: ${label}. Change mall.`}
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
          Current location
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-ink">
          <span className="truncate">{label}</span>
          <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </span>
      </span>
    </button>
  );
}
