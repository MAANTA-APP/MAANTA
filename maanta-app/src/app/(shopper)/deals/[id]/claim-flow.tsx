"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StickyCtaBar } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlays";
import { W3wChip } from "@/components/ui/chips";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  claimTransportFailure,
  interpretClaimResponse,
} from "@/lib/claim-response";
import posthog from "posthog-js";
import { DEAL_GRACE_MINUTES } from "@/lib/deal-expiry";

/**
 * 8h Claim confirm (bottom sheet) → 8y location check in progress → ticket.
 * Location is best-effort: denial or timeout never blocks the claim
 * (geofence flags are recorded server-side at claim time).
 */
export function ClaimFlow({
  dealId,
  dealTitle,
  merchantName,
  w3w,
  node,
  signedIn,
  pay,
  was,
}: {
  dealId: string;
  dealTitle: string;
  merchantName: string;
  w3w: string;
  node: string;
  signedIn: boolean;
  /** YOU PAY for the decision bar — the same lib/pricing figure the page
   *  shows above (frozen rule 7: identical on tile, detail and claimed code).
   *  The itemised breakdown stays detail-body-only; the bar carries only the
   *  figure. */
  pay?: number | null;
  was?: number | null;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  function getPosition(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    });
  }

  async function confirmClaim() {
    setSheetOpen(false);
    setChecking(true);
    setCancelled(false);
    setError(null);

    posthog.capture("deal_claim_started", { deal_id: dealId, node });

    const pos = await getPosition();
    if (cancelled) return;

    // Transport and interpretation are separated deliberately. Only a rejected
    // `fetch` is a transport failure; a response that arrived but could not be
    // parsed is a *server* failure, and conflating the two is what told a
    // shopper "Network error" for a claim that had already committed. See
    // `@/lib/claim-response` and
    // docs/ops/claim-response-reliability-fix-2026-08-14.md.
    let res: Response;
    try {
      res = await fetch("/api/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          lat: pos?.coords.latitude,
          lng: pos?.coords.longitude,
        }),
      });
    } catch {
      setChecking(false);
      setError(claimTransportFailure().message);
      return;
    }

    const outcome = await interpretClaimResponse(res);

    if (outcome.kind === "success") {
      router.push(`/tickets/${outcome.redemptionId}?claimed=1`);
      router.refresh();
      return;
    }

    setChecking(false);

    if (outcome.kind === "redirect") {
      // Phone-required-at-claim gate: an email-only session must add a phone
      // (SMS OTP) first, then land back on this deal to finish claiming. A
      // lapsed session goes to login and returns the same way.
      const next = encodeURIComponent(`/deals/${dealId}`);
      router.push(
        outcome.to === "phone"
          ? `/verify-phone?next=${next}`
          : `/login?next=${next}`
      );
      return;
    }

    setError(outcome.message);
  }

  if (checking) {
    // 8y Claim — location check in progress (full-screen takeover)
    return (
      <div className="fixed inset-0 z-50 mx-auto flex max-w-mobile animate-fade-in flex-col items-center justify-center bg-paper px-8 text-center">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-ink"
        />
        <h2 className="mt-5 text-lg font-bold text-ink">
          Checking you&apos;re at {node}…
        </h2>
        <div className="mt-3">
          <W3wChip address={w3w} />
        </div>
        <p className="mt-3 text-xs text-muted">This keeps codes fair for merchants.</p>
        <Button
          variant="ghost"
          size="md"
          className="mt-8"
          onClick={() => {
            setCancelled(true);
            setChecking(false);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <>
      <StickyCtaBar>
        {error ? (
          // S3 — a claim failure is an error (flame), not a warning (rust);
          // reuse the shared InlineAlert instead of a hand-rolled alert.
          <InlineAlert variant="error" className="mb-2">
            {error}
          </InlineAlert>
        ) : null}
        {/* Money never breaks mid-figure (`whitespace-nowrap`), so when the
            price and the action cannot share a line the ROW wraps and the
            button drops to its own line. Without the wrap the nowrap figure
            would overflow its column and paint over the amber fill — the
            shape of drift D148. Nothing is clipped and nothing overlaps at
            any width or text-zoom level. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {pay != null ? (
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                You pay
              </div>
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="tnum whitespace-nowrap text-2xl font-bold leading-tight text-ink">
                  KES {pay.toLocaleString("en-KE")}
                </span>
                {was != null ? (
                  /* "Was …", as the body and the ticket say it — the same
                     screen must not word the same fact two ways depending on
                     whether the deal happens to be claimable. */
                  <span className="tnum whitespace-nowrap text-sm font-normal text-secondary line-through">
                    Was KES {was.toLocaleString("en-KE")}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          <Button
            full={pay == null}
            className={pay != null ? "shrink-0" : undefined}
            onClick={() => {
              if (!signedIn) {
                router.push(`/login?next=/deals/${dealId}`);
                return;
              }
              setSheetOpen(true);
            }}
          >
            Claim deal
          </Button>
        </div>
      </StickyCtaBar>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <h2 className="text-center text-base font-bold text-ink">
          Claim: {dealTitle} — {merchantName}
        </h2>
        <p className="mt-2 text-center text-sm text-muted">
          Your code will be valid until the deal expires, plus a {DEAL_GRACE_MINUTES}-minute
          grace period.
        </p>
        <Button full className="mt-5" onClick={confirmClaim}>
          Confirm
        </Button>
        <Button full variant="ghost" className="mt-3" onClick={() => setSheetOpen(false)}>
          Cancel
        </Button>
      </BottomSheet>
    </>
  );
}
