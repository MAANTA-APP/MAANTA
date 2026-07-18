import { cn } from "@/lib/ui";

/**
 * InlineAlert (registry §3) — persistent, undismissible money/state notice.
 * `warning` is rust (never yellow, L6); `error` is the dark-red error tone.
 * Icon + word so the state survives greyscale (L12). Never a Toast for money.
 */
export function InlineAlert({
  variant = "warning",
  title,
  children,
  className,
}: {
  variant?: "warning" | "error";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tone = variant === "error" ? "border-flame text-flame" : "border-rust text-rust";
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2.5 rounded-card border-[1.5px] border-l-[5px] bg-white p-3",
        tone,
        className
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px] text-[10px]",
          tone
        )}
      >
        !
      </span>
      <div className="text-sm leading-snug text-ink">
        {title ? <span className="font-bold">{title}</span> : null}
        {title && children ? " " : null}
        {children}
      </div>
    </div>
  );
}
