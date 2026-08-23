import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppUser, getDeal, getVerifiedCounts } from "@/lib/data";
import { dealPricing, chargeAmount, extrasLine } from "@/lib/pricing";
import { currentClerkUserId } from "@/lib/auth";
import { captureDealViewed } from "@/lib/analytics";
import { isDealClaimable } from "@/lib/deal-expiry";
import { createServiceClient } from "@/lib/supabase/service";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip, FlashTag, BoostedTag, W3wChip } from "@/components/ui/chips";
import { IconCheck, IconPin } from "@/components/ui/icons";
import { ButtonLink, StickyCtaBar } from "@/components/ui/button";
import { BackIconButton } from "@/components/ui/claude";
import { ClaimFlow } from "./claim-flow";

export const dynamic = "force-dynamic";

/** 8g Deal detail (+ 8ae fully-claimed state + paused / own-ticket states). */
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

  // If this shopper already holds a live ticket, surface it — especially when
  // the merchant has since paused the deal (ticket stays valid until expiry).
  let existingTicketId: string | null = null;
  if (user) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("deal_id", deal.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      // D164: this ordered by `created_at`, which redemptions has never had, so
      // the query ERRORED and `existing` came back undefined. A shopper already
      // holding a live pending ticket was therefore shown "Claim deal" instead
      // of their ticket, and got a 409 on tap — the API backstop covering a
      // broken screen. Ordered by `redeemed_at` deliberately, not the new
      // `claimed_at`: for a pending row `redeemed_at` IS the claim time and it
      // is NOT NULL on every row, whereas `claimed_at` is NULL for everything
      // claimed before 20260823140000 and DESC sorts NULLs first in Postgres —
      // which would surface a stale pre-migration ticket as the newest one.
      //
      // `redeemed_at` is admittedly a fragile recency key: the NAME implies the
      // redemption instant, and it only doubles as claim time because it
      // defaults at insert and is overwritten at verification. That is why the
      // secondary `id DESC` is here and not optional — two tickets sharing a
      // timestamp must still resolve deterministically rather than by whatever
      // order Postgres happens to return. Once there is enough post-migration
      // history, this should move to `claimed_at` with explicit NULL handling.
      .order("redeemed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingTicketId = existing?.id ?? null;
  }

  // Most viewers here are signed out — browsing does not require an account. By
  // founder ruling anonymous analytics is cookieless/in-memory, so a signed-out
  // view is attributed as "none" server-side (volume-only); the client's posthog-js
  // attributes the pageview itself and aliases it on sign-in. See analytics.ts.
  void captureDealViewed({
    clerkUserId,
    dealId: deal.id,
    merchantId: deal.merchant_id,
    dealType: deal.deal_type ?? "standard",
    priceKes: deal.price_kes ?? null,
    node: deal.node,
  });
  const verifiedCount = verified.get(deal.merchant_id) ?? 0;

  const paused = deal.is_paused === true;
  const claimable =
    !existingTicketId &&
    deal.is_active &&
    !paused &&
    isDealClaimable(deal.expires_at) &&
    !(deal.max_claims != null && deal.claims_count >= deal.max_claims);
  const fullyClaimed =
    deal.max_claims != null && deal.claims_count >= deal.max_claims;
  const m = deal.merchants;
  const { pay, was, extras, charges } = dealPricing(deal);

  return (
    <main className="pb-28">
      <div className="relative h-64 bg-cream">
        <CoverImage src={deal.image_url} alt={deal.title} />
        <div className="absolute left-4 top-4">
          <BackIconButton fallback="/feed" />
        </div>
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

        <section className="mt-5 rounded-card bg-white shadow-card p-4">
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
                href={`/map?lat=${m.lat}&lng=${m.lng}&dealId=${deal.id}`}
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

        {pay != null && (!claimable || extras > 0) ? (
          <div className="mt-5">
            {/* Direction A: on a claimable deal the figure lives in the
                anchored decision bar beside the action, so it is not repeated
                here. When the deal cannot be claimed there is no bar, and the
                shopper still has to be able to see what it costs. The itemised
                breakdown below is detail-only either way (frozen rule 7). */}
            {!claimable ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  You pay
                </div>
                <div className="tnum text-2xl font-bold text-ink">
                  KES {pay.toLocaleString("en-KE")}
                </div>
                {extras > 0 ? (
                  <div className="tnum mt-0.5 text-sm text-secondary">{extrasLine(extras)}</div>
                ) : null}
                {was != null ? (
                  <div className="tnum text-sm text-secondary line-through">
                    Was KES {was.toLocaleString("en-KE")}
                  </div>
                ) : null}
              </>
            ) : null}

            {extras > 0 && deal.price_kes != null ? (
              <div className="mt-3 flex flex-col gap-2 rounded-card bg-white shadow-card p-3.5">
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
          pay={pay}
          was={was}
        />
      ) : existingTicketId ? (
        <StickyCtaBar>
          <div className="space-y-2.5">
            {paused ? (
              <p className="text-center text-xs text-muted">
                Deal paused by merchant — your ticket stays valid until expiry.
              </p>
            ) : null}
            <ButtonLink href={`/tickets/${existingTicketId}`} full>
              View your ticket
            </ButtonLink>
            <ButtonLink href="/my-deals" variant="ghost" full>
              My deals
            </ButtonLink>
          </div>
        </StickyCtaBar>
      ) : (
        <StickyCtaBar>
          <div className="space-y-2.5">
            <div className="flex h-12 w-full items-center justify-center rounded-full bg-cream-dark text-base font-semibold text-faint">
              {fullyClaimed
                ? "Fully claimed"
                : paused
                  ? "Deal paused by merchant"
                  : "Deal ended"}
            </div>
            {paused ? (
              <p className="text-center text-xs text-muted">
                No new claims while paused. Already-claimed tickets remain in My
                deals until expiry.
              </p>
            ) : null}
            <ButtonLink href="/feed" variant="ghost" full>
              See similar deals
            </ButtonLink>
          </div>
        </StickyCtaBar>
      )}
    </main>
  );
}
