import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppUser, getDeal, getVerifiedCounts } from "@/lib/data";
import { dealPricing, chargeAmount } from "@/lib/pricing";
import { currentClerkUserId } from "@/lib/auth";
import { captureDealViewed } from "@/lib/analytics";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip, FlashTag, BoostedTag, W3wChip } from "@/components/ui/chips";
import { IconArrowLeft, IconCheck, IconPin } from "@/components/ui/icons";
import { ButtonLink, StickyCtaBar } from "@/components/ui/button";
import { ClaimFlow } from "./claim-flow";

export const dynamic = "force-dynamic";

/** 8g Deal detail (+ 8ae fully-claimed state). */
export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const deal = await getDeal(params.id);
  if (!deal || !deal.merchants) notFound();

  const [verified, user, clerkUserId] = await Promise.all([
    getVerifiedCounts([deal.merchant_id]),
    getAppUser(),
    currentClerkUserId(),
  ]);

  void captureDealViewed({
    clerkUserId,
    dealId: deal.id,
    merchantId: deal.merchant_id,
    dealType: deal.deal_type ?? "standard",
    priceKes: deal.price_kes ?? null,
  });
  const verifiedCount = verified.get(deal.merchant_id) ?? 0;

  const expired = deal.expires_at ? new Date(deal.expires_at) <= new Date() : false;
  const fullyClaimed =
    deal.max_claims != null && deal.claims_count >= deal.max_claims;
  const claimable = deal.is_active && !expired && !fullyClaimed;
  const m = deal.merchants;
  const { pay, was, extras, charges } = dealPricing(deal);

  return (
    <main className="pb-28">
      <div className="relative h-64 bg-cream">
        <CoverImage src={deal.image_url} alt={deal.title} />
        <Link
          href="/feed"
          aria-label="Back"
          className="absolute left-4 top-4 rounded-full bg-white/90 p-2 text-ink shadow"
        >
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <div className="absolute bottom-4 left-4 flex gap-1.5">
          {fullyClaimed ? (
            <span className="rounded-full bg-cream-dark px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              Fully claimed
            </span>
          ) : (
            <>
              {deal.deal_type === "flash" ? <FlashTag /> : null}
              {deal.boost_active ? <BoostedTag /> : null}
              <CountdownChip expiresAt={deal.expires_at} className="bg-white/95" />
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="text-2xl font-bold leading-tight text-ink">{deal.title}</h1>
        {deal.description ? (
          <p className="mt-2 text-sm text-muted">{deal.description}</p>
        ) : null}

        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1">
            <IconPin className="h-3.5 w-3.5" />
            <Link href={`/shops/${m.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
              {m.merchant_name}
            </Link>
          </span>
          {m.floor ? <span>· {m.floor}</span> : null}
        </p>

        <section className="mt-5 rounded-card border border-line bg-white p-4">
          <h2 className="text-sm font-bold text-ink">Pick-up location</h2>
          <p className="mt-1 text-sm text-muted">
            {m.mall_name ?? deal.node}
            {" · "}
            <Link
              href={`/shops/${m.id}`}
              className="font-semibold text-ink underline-offset-2 hover:underline"
            >
              {m.merchant_name}
            </Link>
            {m.floor ? ` · ${m.floor}` : ""}
            {m.unit_number ? `, ${m.unit_number}` : ""}
          </p>
          {m.what3words_address ? (
            <div className="mt-2">
              <W3wChip address={m.what3words_address} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-faint">See directions at pickup</p>
          )}
          {typeof m.lat === "number" && typeof m.lng === "number" ? (
            <div className="mt-3">
              <ButtonLink
                href={`/browse?lat=${m.lat}&lng=${m.lng}&dealId=${deal.id}`}
                variant="ghost"
                size="sm"
              >
                View on map
              </ButtonLink>
            </div>
          ) : m.what3words_address ? (
            <p className="mt-2 text-xs text-faint">
              Map pin unavailable — use the what3words address at the mall.
            </p>
          ) : null}
        </section>

        {pay != null ? (
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              You pay
            </div>
            <div className="tnum text-2xl font-bold text-ink">
              KES {pay.toLocaleString("en-KE")}
            </div>
            {extras > 0 ? (
              <div className="tnum mt-0.5 text-sm text-secondary">
                Includes KES {extras.toLocaleString("en-KE")} in taxes and charges
              </div>
            ) : null}
            {was != null ? (
              <div className="tnum text-sm text-secondary line-through">
                Was KES {was.toLocaleString("en-KE")}
              </div>
            ) : null}

            {/* Itemised breakdown — the ONE place it appears (brief §4). */}
            {extras > 0 && deal.price_kes != null ? (
              <div className="mt-3 flex flex-col gap-2 rounded-card border border-line bg-white p-3.5">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Deal price</span>
                  <span className="tnum font-medium">
                    KES {Math.round(deal.price_kes).toLocaleString("en-KE")}
                  </span>
                </div>
                {charges.map((c, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-secondary">{c.label}</span>
                    <span className="tnum font-medium">
                      KES {chargeAmount(c, deal.price_kes!).toLocaleString("en-KE")}
                    </span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <span className="text-sm font-bold">Total you pay</span>
                  <span className="tnum text-lg font-bold">
                    KES {pay.toLocaleString("en-KE")}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 flex items-center gap-1.5 text-sm text-ink">
          <IconCheck className="h-4 w-4 text-verified" />
          <span className="font-semibold">{verifiedCount} verified redemptions</span>
          {deal.max_claims != null ? (
            <span className="text-muted">
              ·{" "}
              {fullyClaimed
                ? `${deal.claims_count} of ${deal.max_claims} claimed — no codes left`
                : `${deal.claims_count} of ${deal.max_claims} claimed`}
            </span>
          ) : null}
        </p>
      </div>

      {claimable ? (
        <ClaimFlow
          dealId={deal.id}
          dealTitle={deal.title}
          merchantName={m.merchant_name}
          w3w={m.what3words_address}
          node={m.mall_name ?? deal.node}
          signedIn={!!user}
        />
      ) : (
        <StickyCtaBar>
          <div className="space-y-2.5">
            <div className="flex h-12 w-full items-center justify-center rounded-full bg-cream-dark text-base font-semibold text-faint">
              {fullyClaimed ? "Fully claimed" : "Deal ended"}
            </div>
            <ButtonLink href="/feed" variant="ghost" full>
              See similar deals
            </ButtonLink>
          </div>
        </StickyCtaBar>
      )}
    </main>
  );
}
