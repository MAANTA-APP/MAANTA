import Link from "next/link";
import { cn, formatCode, formatKesSigned, friendlyTime, relativeAge } from "@/lib/ui";
import {
  CountdownChip,
  FlashTag,
  BoostedTag,
  PlanChip,
  StatusChip,
  W3wChip,
  LiveChip,
  ComingSoonChip,
} from "@/components/ui/chips";
import { IconCheck, IconChevronRight, IconPin, IconImage } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";

export function CoverImage({
  src,
  alt = "",
  className,
}: {
  src: string | null;
  alt?: string;
  className?: string;
}) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      // Gentle fade so covers settle in instead of popping over the cream fill
      // (reduced-motion users get an instant paint — globals.css).
      className={cn("h-full w-full animate-fade-in object-cover", className)}
    />
  ) : (
    // No cover yet — a quiet picture glyph on the slightly darker surface reads
    // as an intentional placeholder (cream == paper now, so use cream-dark for
    // contrast), never the literal word "img" a real shopper used to see.
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-cream-dark text-faint",
        className
      )}
      role="img"
      aria-label={alt || "No image"}
    >
      <IconImage className="h-7 w-7" />
    </div>
  );
}

/** 1a Deal card (vertical) — feed "Deals Near Me". */
export function DealCardVertical({
  href,
  imageUrl,
  merchantName,
  floor,
  title,
  dealType,
  boosted = false,
  verifiedCount,
  expiresAt,
  pay,
  wasKes,
  extras,
}: {
  href: string;
  imageUrl: string | null;
  merchantName: string;
  floor: string | null;
  title: string;
  dealType: "standard" | "flash";
  boosted?: boolean;
  verifiedCount: number;
  expiresAt?: string | null;
  pay?: number | null;
  wasKes?: number | null;
  extras?: number | null;
}) {
  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-card border border-line bg-white transition hover:shadow-md motion-safe:active:scale-[0.99]"
    >
      <div className="relative h-40 bg-cream">
        <CoverImage src={imageUrl} alt={title} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {dealType === "flash" ? <FlashTag /> : null}
          {boosted ? <BoostedTag /> : null}
        </div>
        {expiresAt ? (
          <div className="absolute bottom-3 left-3">
            <CountdownChip expiresAt={expiresAt} className="bg-white/95" />
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5 p-4">
        <p className="text-xs text-muted">
          {merchantName}
          {floor ? ` · ${floor}` : ""}
        </p>
        <h3 className="text-base font-bold leading-snug text-ink">{title}</h3>
        {pay != null ? (
          <div className="flex items-baseline gap-2 pt-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              You pay
            </span>
            <span className="tnum text-lg font-bold text-ink">
              KES {pay.toLocaleString("en-KE")}
            </span>
            {wasKes != null ? (
              <span className="tnum text-xs text-secondary line-through">
                KES {wasKes.toLocaleString("en-KE")}
              </span>
            ) : null}
          </div>
        ) : null}
        {/* S1 — one-line extras summary (brief §4: everywhere except deal
            detail). text-secondary is the money-context token, never `muted`. */}
        {pay != null && extras != null && extras > 0 ? (
          <p className="tnum text-[11px] text-secondary">
            Includes KES {extras.toLocaleString("en-KE")} in taxes and charges
          </p>
        ) : null}
        <div className="flex items-center gap-2 pt-0.5">
          <PlanChip plan={dealType === "flash" ? "elite" : "standard"} />
          <span className="flex items-center gap-1 text-xs font-medium text-ink">
            <IconCheck className="h-3.5 w-3.5 text-verified" />
            {verifiedCount} verified redemptions
          </span>
        </div>
      </div>
    </Link>
  );
}

/** 1b Deal card (horizontal scroller) — Flash Deals / Priority Placements rails. */
export function DealCardHorizontal({
  href,
  imageUrl,
  title,
  tag,
  verifiedCount,
  pay,
  extras,
}: {
  href: string;
  imageUrl: string | null;
  title: string;
  tag: "flash" | "boosted" | null;
  verifiedCount: number;
  pay?: number | null;
  extras?: number | null;
}) {
  return (
    <Link
      href={href}
      className="flex w-64 shrink-0 snap-start gap-3 rounded-card border border-line bg-white p-3 transition hover:shadow-md motion-safe:active:scale-[0.99]"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
        <CoverImage src={imageUrl} alt="" />
      </div>
      <div className="min-w-0">
        {tag === "flash" ? <FlashTag /> : tag === "boosted" ? <BoostedTag /> : null}
        <h4 className="mt-1 truncate text-sm font-bold text-ink">{title}</h4>
        {pay != null ? (
          <p className="tnum mt-0.5 text-sm font-bold text-ink">
            You pay KES {pay.toLocaleString("en-KE")}
          </p>
        ) : null}
        {/* S1 — one-line extras summary (brief §4). */}
        {pay != null && extras != null && extras > 0 ? (
          <p className="tnum mt-0.5 text-[11px] leading-snug text-secondary">
            Includes KES {extras.toLocaleString("en-KE")} in taxes and charges
          </p>
        ) : null}
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
          <IconCheck className="h-3 w-3 text-verified" />
          {verifiedCount} verified
        </p>
      </div>
    </Link>
  );
}

/** 1c Ticket card — thick black border, cream fill, big mono code. */
export function TicketCard({
  merchantName,
  floor,
  code,
  expiryLabel,
  w3w,
  navigateHref,
  className,
}: {
  merchantName: string;
  floor: string | null;
  code: string;
  expiryLabel: React.ReactNode;
  w3w: string | null;
  navigateHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-r3 rounded-2xl border-[2.5px] border-brand bg-white p-5 text-center",
        className
      )}
    >
      <p className="text-xs font-medium text-muted">
        {merchantName}
        {floor ? ` · ${floor}` : ""}
      </p>
      <p className="font-code mt-2 text-4xl font-medium tracking-[0.14em] text-ink">
        {formatCode(code)}
      </p>
      <p className="mt-2 text-xs font-semibold text-rust">{expiryLabel}</p>
      {w3w ? (
        <div className="mt-3 flex justify-center">
          <W3wChip address={w3w} />
        </div>
      ) : null}
      {navigateHref ? (
        <ButtonLink
          href={navigateHref}
          variant="ghost"
          size="sm"
          full
          className="mt-4 bg-transparent"
          target="_blank"
          rel="noopener noreferrer"
        >
          Navigate
        </ButtonLink>
      ) : null}
    </div>
  );
}

/** 1d Node card — live / coming soon. */
export function NodeCard({
  name,
  live,
  onClick,
  href,
  liveLabel,
  soonLabel,
}: {
  name: string;
  live: boolean;
  onClick?: () => void;
  href?: string;
  liveLabel?: string;
  soonLabel?: string;
}) {
  const inner = (
    <>
      <span className={cn("text-base font-bold", live ? "text-ink" : "text-faint")}>
        {name}
      </span>
      {live ? <LiveChip label={liveLabel} /> : <ComingSoonChip label={soonLabel} />}
    </>
  );
  const cls = cn(
    "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left",
    live ? "border-ink/80 hover:bg-cream" : "border-line cursor-default"
  );
  if (href && live) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={live ? onClick : undefined} className={cls} disabled={!live}>
      {inner}
    </button>
  );
}

/** 1e Merchant deal row (dashboard / deal list). */
export function MerchantDealRow({
  href,
  imageUrl,
  title,
  status,
  expiresAt,
  verifiedCount,
}: {
  href: string;
  imageUrl: string | null;
  title: string;
  status: string;
  expiresAt: string | null;
  verifiedCount: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card border border-line bg-white p-3 hover:bg-cream/50"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream">
        <CoverImage src={imageUrl} alt="" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-bold text-ink">{title}</h4>
        <div className="mt-1 flex items-center gap-2">
          <StatusChip status={status} />
          {status === "active" && expiresAt ? <CountdownChip expiresAt={expiresAt} /> : null}
        </div>
      </div>
      <span className="flex items-center gap-1 text-sm font-bold text-ink">
        <IconCheck className="h-4 w-4 text-verified" />
        {verifiedCount}
      </span>
    </Link>
  );
}

/** 1f KPI card */
export function KpiCard({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-line bg-white p-4", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

/** 1h Redemption history row */
export function RedemptionRow({
  when,
  status,
  amount,
}: {
  when: string;
  status: "success" | "failed" | "flagged" | "pending";
  amount: number | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-0">
      <span className="text-sm text-ink">{friendlyTime(when)}</span>
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-semibold",
          status === "success"
            ? "text-verified"
            : status === "flagged"
              ? "text-flame"
              : "text-muted"
        )}
      >
        {status === "success" ? <IconCheck className="h-3.5 w-3.5" /> : null}
        {status === "success"
          ? "Verified"
          : status === "flagged"
            ? "Flagged"
            : status === "failed"
              ? "Rejected"
              : "Pending"}
      </span>
      <span className="tnum text-sm font-semibold text-ink">
        {status === "success" && amount != null ? `-KES ${Math.round(amount)}` : "—"}
      </span>
    </div>
  );
}

/** 1i Notification row */
export function NotificationRow({
  title,
  body,
  at,
  unread = false,
}: {
  title: string;
  body: string;
  at: string;
  unread?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card border border-line bg-white p-4",
        !unread && "opacity-60"
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          // Unread = dot + bold, never colour alone (L12). Dot is ink, not red.
          unread ? "bg-ink" : "bg-cream-dark"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm text-ink", unread ? "font-bold" : "font-semibold")}>{title}</p>
        <p className="mt-0.5 text-xs text-muted">{body}</p>
      </div>
      <span className="text-[11px] text-faint">{relativeAge(at)}</span>
    </div>
  );
}

/** 1k Settings row */
export function SettingsRow({
  href,
  label,
  value,
  onClick,
}: {
  href?: string;
  label: string;
  value?: string;
  onClick?: () => void;
}) {
  // No href and no onClick → a display-only row: no chevron, no hover, not
  // focusable. Prevents "tap leads nowhere" dead rows.
  const interactive = Boolean(href || onClick);
  const inner = (
    <>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="flex items-center gap-2">
        {value ? <span className="text-sm text-muted">{value}</span> : null}
        {interactive ? <IconChevronRight className="h-4 w-4 text-faint" /> : null}
      </span>
    </>
  );
  const base =
    "flex w-full items-center justify-between rounded-card border border-line bg-white px-4 py-3.5 text-left";
  if (href) {
    return (
      <Link href={href} className={cn(base, "hover:bg-cream/50")}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, "hover:bg-cream/50")}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** 1l Shop card (favourite) */
export function ShopCard({
  href,
  logoUrl,
  name,
  meta,
  verifiedCount,
  favouriteSlot,
}: {
  href: string;
  logoUrl?: string | null;
  name: string;
  meta: string;
  verifiedCount: number;
  favouriteSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cream text-[10px] text-faint">
          {logoUrl ? <CoverImage src={logoUrl} alt="" /> : "logo"}
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold text-ink">{name}</h4>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
            {meta} · <IconCheck className="h-3 w-3 text-verified" /> {verifiedCount} verified
          </p>
        </div>
      </Link>
      {favouriteSlot}
    </div>
  );
}

/** 1m Transaction card rows */
export function TransactionRow({
  href,
  title,
  when,
  amount,
}: {
  href?: string;
  title: string;
  when: string;
  amount: number;
}) {
  const inner = (
    <>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{friendlyTime(when)}</p>
      </div>
      <span
        className={cn(
          "text-sm font-bold",
          amount >= 0 ? "text-verified" : "text-ink"
        )}
      >
        {formatKesSigned(amount)}
      </span>
    </>
  );
  const cls =
    "flex w-full items-center justify-between rounded-card border border-line bg-white px-4 py-3.5 text-left";
  if (href) {
    return (
      <Link href={href} className={cn(cls, "hover:bg-cream/50")}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** Location line: "Fabric House · Floor 2 · ///stove.cactus.rally" */
export function LocationLine({
  merchantName,
  floor,
  w3w,
  className,
}: {
  merchantName: string;
  floor: string | null;
  w3w: string | null;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted", className)}>
      <span className="flex items-center gap-1">
        <IconPin className="h-3.5 w-3.5" />
        {merchantName}
      </span>
      {floor ? <span>· {floor}</span> : null}
      {w3w ? (
        <>
          <span>·</span>
          <W3wChip address={w3w} />
        </>
      ) : null}
    </p>
  );
}
