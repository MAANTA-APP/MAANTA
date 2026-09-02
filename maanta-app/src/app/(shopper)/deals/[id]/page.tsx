import Link from "next/link";
import { notFound } from "next/navigation";
import { BOOST_WINDOW_HOURS, getAppUser, getDeal, getVerifiedCounts } from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { currentClerkUserId } from "@/lib/auth";
import { captureDealViewed } from "@/lib/analytics";
import { isDealClaimable } from "@/lib/deal-expiry";
import { createServiceClient } from "@/lib/supabase/service";
import { CoverImage } from "@/components/ui/cards";
import { CountdownChip, FlashTag, BoostedTag, W3wChip } from "@/components/ui/chips";
import { IconCheck, IconPin } from "@/components/ui/icons";
import { ButtonLink, StickyCtaBar } from "@/components/ui/button";
import { BackIconButton } from "@/components/ui/claude";
import { ClaimGate } from "@/components/shopper/claim-gate";
import { ExpiryGate } from "@/components/shopper/expiry-gate";
import { DealPriceDetail } from "./deal-price-detail";
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
  let existingTicketExpiresAt: string | null = null;
  if (user) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("redemptions")
      // `expires_at` is SELECTED, not only filtered on: the CTA it drives is
      // time-derived, and a page left open past the ticket's own deadline kept
      // offering "View your ticket" for a ticket that had died (D213).
      .select("id, expires_at")
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
      // claimed before 20260824130000 and DESC sorts NULLs first in Postgres —
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
    existingTicketExpiresAt =
      (existing as { expires_at?: string | null } | null)?.expires_at ?? null;
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

  // One ended state, shared by the branch that starts there and the branch the
  // clock sends there, so a CTA withdrawn on an open page lands on exactly what
  // a fresh render would have shown — fully-claimed and paused wordings
  // included.
  const endedCta = (
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
  );

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

        {/*
          R3 disclosure. The BOOSTED chip above names the mechanism; this names
          the commercial fact behind it. A chip alone reads as an editorial
          badge, and the rail it belongs to is titled "Neighbourhood
          favourites" (frozen by R2), which carries an implied popularity claim
          a paid placement has not earned. Drift D223.

          Detail, not the tile: a tile has no room for a sentence and the
          shopper meets this before claiming. Muted, adjacent to the deal it
          describes, never dressed as a warning — a boost is a legitimate
          product, and the point is disclosure, not discouragement.
        */}
        {deal.boost_active ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            This shop paid to feature this deal for {BOOST_WINDOW_HOURS} hours.
          </p>
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

        {pay != null ? (
          <DealPriceDetail
            pay={pay}
            was={was}
            extras={extras}
            charges={charges}
            priceKes={deal.price_kes}
            serverClaimable={claimable}
            expiresAt={deal.expires_at}
          />
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
        // D213 criterion 3 — the server decides claimability from data the
        // client cannot re-derive; the gate then withdraws the offer when the
        // deadline passes, so an open page cannot show a live "Claim deal"
        // beside an expired countdown.
        <ClaimGate
          expiresAt={deal.expires_at}
          expired={
            <StickyCtaBar>
              <div className="space-y-2.5">
                <div className="flex h-12 w-full items-center justify-center rounded-full bg-cream-dark text-base font-semibold text-faint">
                  Deal ended
                </div>
                <ButtonLink href="/feed" variant="ghost" full>
                  See similar deals
                </ButtonLink>
              </div>
            </StickyCtaBar>
          }
        >
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
        </ClaimGate>
      ) : existingTicketId ? (
        // D213 criterion 3 — the ticket has its own deadline, so this CTA has
        // one too. Past it the shopper is offered the ended state, which is
        // exactly what a fresh render would have shown them.
        <ExpiryGate expiresAt={existingTicketExpiresAt} expired={endedCta}>
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
        </ExpiryGate>
      ) : (
        endedCta
      )}
    </main>
  );
}