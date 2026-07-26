"use client";

import Link from "next/link";
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

/** Back to You — chevron + label (wireframe canonical route). */
export function BackToYouLink({ className }: { className?: string }) {
  return (
    <Link
      href="/you"
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
      Back
    </Link>
  );
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
