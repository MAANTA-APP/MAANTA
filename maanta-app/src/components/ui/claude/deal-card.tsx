"use client";

import Link from "next/link";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip } from "@/components/ui/chips";
import { FavouriteButton } from "@/components/favourite-button";
import { HeadingSm, Meta, Label } from "@/components/ui/claude/typography";
import { cn } from "@/lib/ui";

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
  collectionLabel,
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
  collectionLabel?: string | null;
  distanceLabel?: string | null;
  pay?: number | null;
  wasKes?: number | null;
  extras?: number | null;
  tag?: DealRailBadge;
  expiresAt?: string | null;
  merchantId: string;
  isFavourite?: boolean;
  variant?: "horizontal" | "vertical";
  showFavourite?: boolean;
  className?: string;
}) {
  if (variant === "vertical") {
    return (
      <article
        className={cn(
          "relative overflow-hidden rounded-card border border-line bg-white shadow-card transition hover:shadow-md motion-safe:active:scale-[0.995]",
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
            {(collectionLabel || distanceLabel) && (
              <Meta as="p">
                {[collectionLabel, distanceLabel].filter(Boolean).join(" · ")}
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
              <p className="tnum text-[11px] text-secondary">
                Includes KES {extras.toLocaleString("en-KE")} in taxes and charges
              </p>
            ) : null}
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "relative flex w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-white shadow-card transition hover:shadow-md motion-safe:active:scale-[0.995]",
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
          {(collectionLabel || distanceLabel) && (
            <Meta as="p" className="truncate">
              {[collectionLabel, distanceLabel].filter(Boolean).join(" · ")}
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

/** Back-compat alias used by earlier Discover wiring. */
export const DiscoverDealCard = DealCard;
