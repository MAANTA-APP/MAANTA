"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StickyCtaBar } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlays";
import { W3wChip } from "@/components/ui/chips";

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
}: {
  dealId: string;
  dealTitle: string;
  merchantName: string;
  w3w: string;
  node: string;
  signedIn: boolean;
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

    const pos = await getPosition();
    if (cancelled) return;

    try {
      const res = await fetch("/api/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          lat: pos?.coords.latitude,
          lng: pos?.coords.longitude,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setChecking(false);
        setError(body.error ?? "Could not claim this deal.");
        return;
      }
      router.push(`/tickets/${body.redemptionId}?claimed=1`);
      router.refresh();
    } catch {
      setChecking(false);
      setError("Network error — please try again.");
    }
  }

  if (checking) {
    // 8y Claim — location check in progress (full-screen takeover)
    return (
      <div className="fixed inset-0 z-50 mx-auto flex max-w-mobile flex-col items-center justify-center bg-white px-8 text-center">
        <span className="text-3xl" aria-hidden>
          ⏳
        </span>
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
          <p className="mb-2 text-center text-xs font-semibold text-flame">{error}</p>
        ) : null}
        <Button
          full
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
      </StickyCtaBar>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <h2 className="text-center text-base font-bold text-ink">
          Claim: {dealTitle} — {merchantName}
        </h2>
        <p className="mt-2 text-center text-sm text-muted">
          Your code will be valid until the deal expires, plus a 15-minute grace
          period.
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
