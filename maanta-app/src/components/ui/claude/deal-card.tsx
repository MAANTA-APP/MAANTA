"use client";

import Link from "next/link";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip } from "@/components/ui/chips";
import { FavouriteButton } from "@/components/favourite-button";
import { HeadingMd, HeadingSm, Meta, Label } from "@/components/ui/claude/typography";
import { cn } from "@/lib/ui";
import { extrasLine } from "@/lib/pricing";

export type DealRailBadge = "flash" | "boosted" | "standard" | null;

function RailBadge({ tag }: { tag: DealRailBadge }) {
  if (!tag) return null;
  const styles =
    tag === "flash"
      ? "bg-rust text-white"
      : tag === "boosted"
        ? "bg-verified text-white"
        : "bg-stone-soft text-ink";
  const label =
    tag === "flash" ? "Flash" : tag === "boosted" ? "Boosted" : "Standard";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        styles
      )}
    >
      {label}
    </span>
  );
}

/**
 * Claude-style deal card for Discover + Browse.
 * YOU PAY stays ink (Frozen: money never amber).
 */
export function DealCard({
  href,
  imageUrl,
  merchantName,
  mallName,
  title,
  expiryLabel,
  distanceLabel,
  pay,
  wasKes,
  extras,
  tag,
  expiresAt,
  merchantId,
  isFavourite = false,
  variant = "horizontal",
  showFavourite = true,
  className,
}: {
  href: string;
  imageUrl: string | null;
  merchantName: string;
  mallName?: string | null;
  title: string;
  expiryLabel?: string | null;
  distanceLabel?: string | null;
  pay?: number | null;
  wasKes?: number | null;
  extras?: number | null;
  tag?: DealRailBadge;
  expiresAt?: string | null;
  merchantId: string;
  isFavourite?: boolean;
  variant?: "horizontal" | "vertical" | "lead" | "row";
  showFavourite?: boolean;
  className?: string;
}) {
  // Direction A (decisions log 2026-08-22) adds two editorial variants:
  // "lead" — the one image-forward hero at the top of a rail, price anchored
  // in a bottom bar; "row" — the compact list row everything else recedes to.
  // Rail names, order and membership are untouched (rail-names.test.ts /
  // locked-feed-order.test.ts): these change how a rail draws, not what it is.
  if (variant === "lead") {
    return (
      <article
        className={cn(
          "relative overflow-hidden rounded-card bg-white shadow-card transition hover:shadow-md motion-safe:active:scale-[0.995]",
          className
        )}
      >
        {showFavourite ? (
          <div className="absolute right-2.5 top-2.5 z-10 rounded-full bg-white/95 shadow-card">
            <FavouriteButton merchantId={merchantId} initial={isFavourite} />
          </div>
        ) : null}
        <Link href={href} className="block">
          <div className="relative h-44 bg-stone-soft">
            <CoverImage src={imageUrl} alt={title} />
            <div className="absolute left-3 top-3 flex gap-1.5">
              <RailBadge tag={tag ?? null} />
            </div>
            {expiresAt ? (
              <div className="absolute bottom-3 left-3">
                <CountdownChip expiresAt={expiresAt} className="bg-white/95" />
              </div>
            ) : null}
          </div>
          <div className="p-4">
            <Meta as="p">
              {[[merchantName, mallName].filter(Boolean).join(" · "), distanceLabel]
                .filter(Boolean)
                .join(" · ")}
            </Meta>
            <HeadingMd as="h3" className="mt-1">
              {title}
            </HeadingMd>
            {pay != null ? (
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <Label>You pay</Label>
                <span className="flex items-baseline gap-2">
                  <span className="tnum text-[1.375rem] font-bold leading-none text-ink">
                    KES {pay.toLocaleString("en-KE")}
                  </span>
                  {wasKes != null ? (
                    <span className="tnum text-sm text-secondary line-through">
                      KES {wasKes.toLocaleString("en-KE")}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
            {pay != null && extras != null && extras > 0 ? (
              <p className="tnum mt-1.5 text-right text-[11px] text-secondary">
                {extrasLine(extras)}
              </p>
            ) : null}
          </div>
        </Link>
      </article>
    );
  }

  if (variant === "row") {
    return (
      <article
        className={cn(
          "relative flex items-center gap-3 rounded-card bg-white p-3 shadow-card transition hover:shadow-md motion-safe:active:scale-[0.995]",
          className
        )}
      >
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-soft">
            <CoverImage src={imageUrl} alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <Meta as="p" className="truncate">
              {[merchantName, distanceLabel ?? mallName].filter(Boolean).join(" · ")}
            </Meta>
            <HeadingSm as="h3" className="mt-0.5 truncate">
              {title}
            </HeadingSm>
            {pay != null ? (
              <p className="tnum mt-1 text-sm font-semibold text-ink">
                You pay KES {pay.toLocaleString("en-KE")}
                {wasKes != null ? (
                  <span className="ml-1.5 text-xs font-normal text-secondary line-through">
                    KES {wasKes.toLocaleString("en-KE")}
                  </span>
                ) : null}
              </p>
            ) : null}
            {pay != null && extras != null && extras > 0 ? (
              <p className="tnum text-[11px] text-secondary">{extrasLine(extras)}</p>
            ) : null}
          </div>
        </Link>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1.5 self-stretch py-0.5">
          {showFavourite ? (
            <FavouriteButton merchantId={merchantId} initial={isFavourite} className="p-1.5" />
          ) : null}
          {expiresAt ? <CountdownChip expiresAt={expiresAt} /> : null}
        </div>
      </article>
    );
  }

  if (variant === "vertical") {
    return (
      <article
        className={cn(
          "relative overflow-hidden rounded-card bg-white shadow-card transition hover:shadow-md motion-safe:active:scale-[0.995]",
          className
        )}
      >
        {showFavourite ? (
          <div className="absolute right-2.5 top-2.5 z-10 rounded-full bg-white/95 shadow-card">
            <FavouriteButton merchantId={merchantId} initial={isFavourite} />
          </div>
        ) : null}
        <Link href={href} className="block">
          <div className="relative h-44 bg-stone-soft">
            <CoverImage src={imageUrl} alt={title} />
            <div className="absolute left-3 top-3 flex gap-1.5">
              <RailBadge tag={tag ?? null} />
            </div>
            {expiresAt ? (
              <div className="absolute bottom-3 left-3">
                <CountdownChip expiresAt={expiresAt} className="bg-white/95" />
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5 p-4">
            <Meta>
              {merchantName}
              {mallName ? ` · ${mallName}` : ""}
            </Meta>
            <HeadingSm as="h3">{title}</HeadingSm>
            {(expiryLabel || distanceLabel) && (
              <Meta as="p">
                {[expiryLabel, distanceLabel].filter(Boolean).join(" · ")}
              </Meta>
            )}
            {pay != null ? (
              <div className="flex items-baseline gap-2 pt-1">
                <Label>You pay</Label>
                <span className="tnum text-lg font-semibold text-ink">
                  KES {pay.toLocaleString("en-KE")}
                </span>
                {wasKes != null ? (
                  <span className="tnum text-xs text-secondary line-through">
                    KES {wasKes.toLocaleString("en-KE")}
                  </span>
                ) : null}
              </div>
            ) : null}
            {pay != null && extras != null && extras > 0 ? (
              <p className="tnum text-[11px] text-secondary">{extrasLine(extras)}</p>
            ) : null}
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "relative flex w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-card bg-white shadow-card transition hover:shadow-md motion-safe:active:scale-[0.995]",
        className
      )}
    >
      {showFavourite ? (
        <div className="absolute right-1.5 top-1.5 z-10 rounded-full bg-white/95 shadow-card">
          <FavouriteButton
            merchantId={merchantId}
            initial={isFavourite}
            className="p-1.5"
          />
        </div>
      ) : null}
      <Link href={href} className="flex min-w-0 flex-1 flex-col">
        <div className="relative h-28 bg-stone-soft">
          <CoverImage src={imageUrl} alt="" />
          <div className="absolute left-2.5 top-2.5">
            <RailBadge tag={tag ?? null} />
          </div>
        </div>
        <div className="space-y-1 p-3 pr-8">
          <HeadingSm as="h4" className="truncate">
            {merchantName}
          </HeadingSm>
          <p className="truncate text-xs text-muted">{title}</p>
          {(expiryLabel || distanceLabel) && (
            <Meta as="p" className="truncate">
              {[expiryLabel, distanceLabel].filter(Boolean).join(" · ")}
            </Meta>
          )}
          {pay != null ? (
            <p className="tnum pt-0.5 text-sm font-semibold text-ink">
              You pay KES {pay.toLocaleString("en-KE")}
              {wasKes != null ? (
                <span className="ml-1.5 text-xs font-normal text-secondary line-through">
                  KES {wasKes.toLocaleString("en-KE")}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
