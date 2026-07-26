"use client";

import Link from "next/link";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip, FlashTag, BoostedTag } from "@/components/ui/chips";
import { FavouriteButton } from "@/components/favourite-button";
import { cn } from "@/lib/ui";

/** TGTG-style discover card — image, merchant/mall, window, distance, YOU PAY, heart. */
export function DiscoverDealCard({
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
  tag?: "flash" | "boosted" | null;
  expiresAt?: string | null;
  merchantId: string;
  isFavourite?: boolean;
  variant?: "horizontal" | "vertical";
  showFavourite?: boolean;
}) {
  if (variant === "vertical") {
    return (
      <div className="relative overflow-hidden rounded-card border border-line bg-white transition hover:shadow-md motion-safe:active:scale-[0.99]">
        {showFavourite ? (
          <div className="absolute right-2 top-2 z-10 rounded-full bg-white/95 shadow">
            <FavouriteButton merchantId={merchantId} initial={isFavourite} />
          </div>
        ) : null}
        <Link href={href} className="block">
          <div className="relative h-40 bg-cream">
            <CoverImage src={imageUrl} alt={title} />
            <div className="absolute left-3 top-3 flex gap-1.5">
              {tag === "flash" ? <FlashTag /> : null}
              {tag === "boosted" ? <BoostedTag /> : null}
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
              {mallName ? ` · ${mallName}` : ""}
            </p>
            <h3 className="text-base font-bold leading-snug text-ink">{title}</h3>
            {(collectionLabel || distanceLabel) && (
              <p className="text-[11px] text-faint">
                {[collectionLabel, distanceLabel].filter(Boolean).join(" · ")}
              </p>
            )}
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
            {pay != null && extras != null && extras > 0 ? (
              <p className="tnum text-[11px] text-secondary">
                Includes KES {extras.toLocaleString("en-KE")} in taxes and charges
              </p>
            ) : null}
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex w-64 shrink-0 snap-start gap-3 rounded-card border border-line bg-white p-3 transition hover:shadow-md motion-safe:active:scale-[0.99]"
      )}
    >
      {showFavourite ? (
        <div className="absolute right-1 top-1 z-10">
          <FavouriteButton
            merchantId={merchantId}
            initial={isFavourite}
            className="p-1.5"
          />
        </div>
      ) : null}
      <Link href={href} className="flex min-w-0 flex-1 gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
          <CoverImage src={imageUrl} alt="" />
        </div>
        <div className="min-w-0 pr-6">
          {tag === "flash" ? <FlashTag /> : tag === "boosted" ? <BoostedTag /> : null}
          <h4 className="mt-1 truncate text-sm font-bold text-ink">{merchantName}</h4>
          <p className="truncate text-xs text-muted">{title}</p>
          {(collectionLabel || distanceLabel) && (
            <p className="mt-0.5 truncate text-[11px] text-faint">
              {[collectionLabel, distanceLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          {pay != null ? (
            <p className="tnum mt-0.5 text-sm font-bold text-ink">
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
    </div>
  );
}
