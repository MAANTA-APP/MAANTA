import { cn } from "@/lib/ui";
import { HeadingMd, Body } from "@/components/ui/claude/typography";

/** Page shell — mobile-first max width, stone wash, consistent padding. */
export function Page({
  children,
  className,
  as: Tag = "main",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "main" | "div" | "section";
}) {
  return (
    <Tag className={cn("mx-auto w-full max-w-mobile bg-stone pb-8", className)}>
      {children}
    </Tag>
  );
}

/** Section with title / optional subtitle and generous vertical rhythm. */
export function Section({
  title,
  subtitle,
  action,
  children,
  className,
  /** When false, children are full-bleed (rails); header stays padded. */
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("mt-section", className)}>
      {title || action ? (
        <div
          className={cn(
            "mb-3 flex items-end justify-between gap-3",
            "px-4"
          )}
        >
          <div className="min-w-0">
            {title ? <HeadingMd>{title}</HeadingMd> : null}
            {subtitle ? (
              <Body className="mt-0.5 text-faint" as="p">
                {subtitle}
              </Body>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(padded && "px-4")}>{children}</div>
    </section>
  );
}

/** Horizontal rail scroller used on Discover. */
export function RailScroller({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1",
        className
      )}
    >
      {children}
    </div>
  );
}
