import Link from "next/link";
import { cn } from "@/lib/ui";

/**
 * §4 Buttons — primary yellow / secondary black / ghost / destructive,
 * disabled/loading, sticky CTA bar. Pill-shaped per wireframes.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "destructive-outline";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // L4: primary CTA is amber fill + BLACK label (12.67:1). Never white on amber.
  primary:
    "bg-brand text-black font-semibold hover:brightness-95 active:brightness-90",
  secondary:
    "bg-ink text-white font-semibold hover:bg-ink-soft active:brightness-125",
  // Button/tertiary — border only. Not black, not amber.
  ghost:
    "bg-white text-ink font-semibold border border-ink hover:bg-cream active:bg-cream-dark",
  destructive:
    "bg-flame text-white font-semibold hover:brightness-95 active:brightness-90",
  "destructive-outline":
    "bg-white text-flame font-semibold border border-flame hover:bg-flame-tint",
};

const SIZE_CLASSES = {
  sm: "h-9 px-4 text-sm rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-12 px-6 text-base rounded-full",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE_CLASSES;
  full?: boolean;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  size = "lg",
  full = false,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const isDisabled = disabled || loading;
  return (
    <button
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors",
        loading
          ? "bg-ink text-white font-semibold" // loading: black w/ spinner (no emoji, L9)
          : VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        full && "w-full",
        // L9b: a disabled control is NEVER amber. Grey fill + grey label.
        isDisabled && !loading && "!bg-cream-dark !text-faint !border-0 cursor-not-allowed",
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      ) : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "lg",
  full = false,
  className,
  children,
  href,
  ...rest
}: CommonProps & { href: string } & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    "href"
  >) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        full && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** 4d Sticky CTA bar — fixed to the bottom of mobile screens. */
export function StickyCtaBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto max-w-mobile">
      <div className="pointer-events-auto border-t border-line bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur">
        {children}
      </div>
    </div>
  );
}
