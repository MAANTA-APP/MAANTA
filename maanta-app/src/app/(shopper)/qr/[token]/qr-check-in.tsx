"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLink, Button } from "@/components/ui/button";
import { IconCheck } from "@/components/ui/icons";

/**
 * The interactive half of the QR landing page.
 *
 * - Exactly one active claim: checks in automatically on mount — the scan IS
 *   the intent, and asking again is a tap the shopper doesn't owe us. (A
 *   mount effect never runs on a prefetch, so a link preview can't check
 *   anyone in; the server side is idempotent regardless.)
 * - Several claims: a lightweight choice — never guess which deal they mean.
 * - No claim: say so plainly and point at the shop's existing page. No
 *   auto-claiming, ever.
 * - After check-in: "staff will call your name", the Fast Visit outcome when
 *   earned, and a cancel that touches only the queue entry — never the claim.
 *
 * A late arrival is simply a normal check-in — no failure language (§11).
 */

type Claim = { redemptionId: string; dealTitle: string };

type CheckedIn = {
  merchantName: string;
  arrivedAt: string;
  fastVisitEligible: boolean;
  claimedAt?: string | null;
};

export function QrCheckIn({
  token,
  merchantId,
  merchantName,
  merchantFloor,
  claims,
  alreadyCheckedInFor,
}: {
  token: string;
  merchantId: string;
  merchantName: string;
  merchantFloor: string | null;
  claims: Claim[];
  alreadyCheckedInFor: string | null;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "posting" }
    | { kind: "checked-in"; info: CheckedIn; redemptionId: string; already: boolean }
    | { kind: "error"; message: string }
  >(
    alreadyCheckedInFor
      ? {
          kind: "checked-in",
          info: { merchantName, arrivedAt: "", fastVisitEligible: false },
          redemptionId: alreadyCheckedInFor,
          already: true,
        }
      : { kind: "idle" }
  );
  const autoFired = useRef(false);

  const checkIn = useCallback(
    async (redemptionId: string) => {
      setState({ kind: "posting" });
      try {
        const res = await fetch("/api/qr/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, redemptionId }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.checkedIn) {
          setState({
            kind: "error",
            message:
              body?.error ?? "Could not check you in. Please try again.",
          });
          return;
        }
        setState({
          kind: "checked-in",
          redemptionId,
          already: false,
          info: {
            merchantName: body.merchantName ?? merchantName,
            arrivedAt: body.arrivedAt ?? "",
            fastVisitEligible: body.fastVisitEligible === true,
          },
        });
      } catch {
        setState({
          kind: "error",
          message: "Could not check you in. Please try again.",
        });
      }
    },
    [token, merchantName]
  );

  // Single-claim auto check-in — once, on mount.
  useEffect(() => {
    if (autoFired.current) return;
    if (alreadyCheckedInFor || claims.length !== 1) return;
    autoFired.current = true;
    void checkIn(claims[0].redemptionId);
  }, [alreadyCheckedInFor, claims, checkIn]);

  const cancel = useCallback(async (redemptionId: string) => {
    await fetch("/api/qr/check-in", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redemptionId }),
    }).catch(() => null);
    setState({ kind: "idle" });
  }, []);

  const shopLine = merchantFloor
    ? `${merchantName}, ${merchantFloor}`
    : merchantName;

  if (claims.length === 0 && state.kind !== "checked-in") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">{shopLine}</h1>
        <p className="mt-3 text-sm text-secondary">
          You don&apos;t have an active claim for this shop.
        </p>
        <ButtonLink href={`/shops/${merchantId}`} full className="mt-8">
          View this shop&apos;s deals
        </ButtonLink>
      </div>
    );
  }

  if (state.kind === "checked-in") {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-ink bg-white">
          <IconCheck className="h-7 w-7 text-ink" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink">
          {state.already
            ? "You're already checked in."
            : `You're checked in at ${state.info.merchantName}.`}
        </h1>
        <p className="mt-2 text-sm text-secondary">Staff will call your name.</p>
        {state.info.fastVisitEligible ? (
          <div className="mt-5 rounded-card bg-white px-4 py-3.5 shadow-card">
            <p className="text-sm font-bold text-ink">You made it</p>
            <p className="mt-1 text-xs text-secondary">
              Fast Visit reward eligible — points pending. Complete your
              purchase and have staff verify your claim.
            </p>
          </div>
        ) : null}
        <ButtonLink
          href={`/tickets/${state.redemptionId}`}
          full
          className="mt-8"
        >
          Show my code
        </ButtonLink>
        <Button
          variant="ghost"
          full
          className="mt-3"
          onClick={() => void cancel(state.redemptionId)}
        >
          Cancel check-in
        </Button>
        <p className="mt-2 text-xs text-muted">
          Cancelling only leaves the queue — your claim stays valid.
        </p>
      </div>
    );
  }

  if (state.kind === "posting" || (claims.length === 1 && state.kind === "idle")) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">{shopLine}</h1>
        <p className="mt-3 text-sm text-secondary">Checking you in…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">{shopLine}</h1>
        <p className="mt-3 text-sm text-ink">{state.message}</p>
        <ButtonLink href="/my-deals" variant="ghost" full className="mt-8">
          My deals
        </ButtonLink>
      </div>
    );
  }

  // Several active claims — ask, never guess.
  return (
    <div>
      <h1 className="text-center text-xl font-bold text-ink">{shopLine}</h1>
      <p className="mt-2 text-center text-sm text-secondary">
        Which deal are you using?
      </p>
      <div className="mt-6 space-y-3">
        {claims.map((c) => (
          <button
            key={c.redemptionId}
            type="button"
            onClick={() => void checkIn(c.redemptionId)}
            className="w-full rounded-card bg-white px-4 py-3.5 text-left text-sm font-semibold text-ink shadow-card"
          >
            {c.dealTitle}
          </button>
        ))}
      </div>
    </div>
  );
}
