import { cn } from "@/lib/ui";

type TextProps = {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
};

/** Large page / hero heading — calm, high contrast. */
export function HeadingLg({ children, className, as: Tag = "h1" }: TextProps) {
  return (
    <Tag
      className={cn(
        "text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[2rem]",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** Section heading (Discover rails, Browse list). */
export function HeadingMd({ children, className, as: Tag = "h2" }: TextProps) {
  return (
    <Tag
      className={cn(
        "text-[1.0625rem] font-semibold leading-snug tracking-[-0.02em] text-ink",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** Card / compact heading. */
export function HeadingSm({ children, className, as: Tag = "h3" }: TextProps) {
  return (
    <Tag
      className={cn(
        "text-sm font-semibold leading-snug tracking-[-0.015em] text-ink",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** Body copy. */
export function Body({ children, className, as: Tag = "p" }: TextProps) {
  return (
    <Tag className={cn("text-sm leading-relaxed text-secondary", className)}>
      {children}
    </Tag>
  );
}

/** Form / chip labels. */
export function Label({ children, className, as: Tag = "span" }: TextProps) {
  return (
    <Tag
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** Secondary meta (distance, collection window). */
export function Meta({ children, className, as: Tag = "span" }: TextProps) {
  return (
    <Tag className={cn("text-[11px] leading-snug text-faint", className)}>
      {children}
    </Tag>
  );
}
