import { cn } from "@/lib/ui";

/**
 * InlineAlert (registry §3) — persistent, undismissible money/state notice.
 * `warning` is rust (never yellow, L6); `error` is the dark-red error tone.
 * Icon + word so the state survives greyscale (L12). Never a Toast for money.
 *
 * `info` is neutral: line border, secondary icon, ink body. It exists because
 * not every persistent money state is a be-careful state — the opening credit is
 * good news, and rendering it rust would say "act" about a balance that needs no
 * action, which is the colour-semantics error D80 corrected on the trial pill.
 * Neutral is also why it is not `role="alert"`: an assertive live region is for a
 * state that changed, not for a note that is simply true on arrival.
 */
export function InlineAlert({
  variant = "warning",
  title,
  children,
  className,
}: {
  variant?: "warning" | "error" | "info";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tone =
    variant === "error"
      ? "border-flame text-flame"
      : variant === "info"
        ? "border-line text-secondary"
        : "border-rust text-rust";
  return (
    <div
      role={variant === "info" ? "note" : "alert"}
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
        {variant === "info" ? "i" : "!"}
      </span>
      <div className="text-sm leading-snug text-ink">
        {title ? <span className="font-bold">{title}</span> : null}
        {title && children ? " " : null}
        {children}
      </div>
    </div>
  );
}
