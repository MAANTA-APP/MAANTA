"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLink, Button } from "@/components/ui/button";
import { IconCheck } from "@/components/ui/icons";
import { isUnexpiredAt } from "@/lib/live-deals";
import { useShopperClock } from "@/lib/use-shopper-clock";

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

type Claim = { redemptionId: string; dealTitle: string; expiresAt: string };

type CheckedIn = {
  merchantName: string;
  arrivedAt: string;
  fastVisitEligible: boolean;
  claimedAt?: string | null;
  queueStatus: "waiting" | "called";
  calledAt: string | null;
};

/** D217's total bound from the expected queue lapse to a neutral answer. */
export const QUEUE_CONFIRMATION_BOUND_MS = 30_000;
/**
 * The shared shopper clock starts from the server render, so hydration delay
 * cannot be part of D217's correctness bound. A server poll at half the bound,
 * with the other half reserved for its response, closes that gap.
 */
export const QUEUE_MEMBERSHIP_POLL_MS = 15_000;
export const QUEUE_MEMBERSHIP_REQUEST_TIMEOUT_MS =
  QUEUE_CONFIRMATION_BOUND_MS - QUEUE_MEMBERSHIP_POLL_MS;

type MembershipResult =
  | {
      kind: "live";
      expiresAt: string;
      queueStatus: "waiting" | "called";
      calledAt: string | null;
    }
  | { kind: "lapsed" }
  | { kind: "unknown" };

export function QrCheckIn({
  token,
  merchantId,
  merchantName,
  merchantFloor,
  claims,
  alreadyCheckedInFor,
  alreadyCheckedInExpiresAt,
  alreadyCheckedInStatus = null,
  alreadyCalledAt = null,
}: {
  token: string;
  merchantId: string;
  merchantName: string;
  merchantFloor: string | null;
  claims: Claim[];
  alreadyCheckedInFor: string | null;
  alreadyCheckedInExpiresAt: string | null;
  alreadyCheckedInStatus?: "waiting" | "called" | null;
  alreadyCalledAt?: string | null;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "posting" }
    | { kind: "checked-in"; info: CheckedIn; redemptionId: string; already: boolean; queueExpiresAt: string }
    | { kind: "confirming-membership"; redemptionId: string }
    | { kind: "membership-lapsed"; redemptionId: string }
    | { kind: "membership-unknown"; redemptionId: string; message: string }
    | { kind: "cancelled"; redemptionId: string }
    | { kind: "cancel-error"; redemptionId: string; message: string }
    | { kind: "error"; message: string }
  >(
    alreadyCheckedInFor && alreadyCheckedInExpiresAt
      ? {
          kind: "checked-in",
          info: {
            merchantName,
            arrivedAt: "",
            fastVisitEligible: false,
            queueStatus: alreadyCheckedInStatus ?? "waiting",
            calledAt: alreadyCalledAt,
          },
          redemptionId: alreadyCheckedInFor,
          already: true,
          queueExpiresAt: alreadyCheckedInExpiresAt,
        }
      : { kind: "idle" }
  );
  const autoFired = useRef(false);
  const confirmationFiredFor = useRef<string | null>(null);
  const now = useShopperClock();

  const readMembership = useCallback(
    async (
      redemptionId: string,
      timeoutMs: number,
      outerSignal?: AbortSignal
    ): Promise<MembershipResult> => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      outerSignal?.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(
        abort,
        Math.max(0, Math.min(QUEUE_CONFIRMATION_BOUND_MS, timeoutMs))
      );
      try {
        const query = new URLSearchParams({ token, redemptionId });
        const res = await fetch(`/api/qr/check-in?${query.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: "unknown" };
        if (body?.checkedIn === true && typeof body.expiresAt === "string") {
          return {
            kind: "live",
            expiresAt: body.expiresAt,
            queueStatus: body.queueStatus === "called" ? "called" : "waiting",
            calledAt: typeof body.calledAt === "string" ? body.calledAt : null,
          };
        }
        return { kind: "lapsed" };
      } catch {
        return { kind: "unknown" };
      } finally {
        window.clearTimeout(timeout);
        outerSignal?.removeEventListener("abort", abort);
      }
    },
    [token]
  );

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
          queueExpiresAt: body.queueExpiresAt,
          info: {
            merchantName: body.merchantName ?? merchantName,
            arrivedAt: body.arrivedAt ?? "",
            fastVisitEligible: body.fastVisitEligible === true,
            queueStatus: body.queueStatus === "called" ? "called" : "waiting",
            calledAt: typeof body.calledAt === "string" ? body.calledAt : null,
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

  const confirmMembership = useCallback(
    async (redemptionId: string, timeoutMs = QUEUE_CONFIRMATION_BOUND_MS) => {
      setState({ kind: "confirming-membership", redemptionId });
      const result = await readMembership(redemptionId, timeoutMs);
      if (result.kind === "live") {
        confirmationFiredFor.current = null;
        setState({
          kind: "checked-in",
          redemptionId,
          already: true,
          queueExpiresAt: result.expiresAt,
          info: {
            merchantName,
            arrivedAt: "",
            fastVisitEligible: false,
            queueStatus: result.queueStatus,
            calledAt: result.calledAt,
          },
        });
        return;
      }
      if (result.kind === "lapsed") {
        setState({ kind: "membership-lapsed", redemptionId });
        return;
      }
      setState({
        kind: "membership-unknown",
        redemptionId,
        message: "We couldn’t confirm whether you’re still checked in.",
      });
    },
    [merchantName, readMembership]
  );

  // Single-claim auto check-in — once, on mount.
  //
  // Deliberately keyed on the claim set the page ARRIVED with, not on the live
  // one. A shopper standing at the counter deciding between two claims must not
  // have one of them checked in on their behalf just because the other expired
  // while they were reading: this component's rule is "ask, never guess", and
  // the auto path exists only because a single claim leaves nothing to ask.
  useEffect(() => {
    if (autoFired.current) return;
    if (alreadyCheckedInFor || claims.length !== 1) return;
    autoFired.current = true;
    void checkIn(claims[0].redemptionId);
  }, [alreadyCheckedInFor, claims, checkIn]);

  // Server-authoritative backstop. The shopper clock deliberately preserves
  // the SSR seed to keep every time-derived label in step, but a slow response
  // or hydration can make that seed older than the browser's wall clock. Poll
  // independently so that no such delay can extend a checked-in claim: within
  // 15 seconds we ask the server and within the remaining 15 seconds we either
  // have its answer or withdraw certainty.
  useEffect(() => {
    if (state.kind !== "checked-in") return;
    let inFlight = false;
    let controller: AbortController | null = null;
    const redemptionId = state.redemptionId;

    const pollMembership = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const result = await readMembership(
        redemptionId,
        QUEUE_MEMBERSHIP_REQUEST_TIMEOUT_MS,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (result.kind === "lapsed") {
        setState({ kind: "membership-lapsed", redemptionId });
      } else if (result.kind === "unknown") {
        setState({
          kind: "membership-unknown",
          redemptionId,
          message: "We couldn’t confirm whether you’re still checked in.",
        });
      } else {
        setState((current) =>
          current.kind === "checked-in" &&
          (current.info.queueStatus !== result.queueStatus ||
            current.info.calledAt !== result.calledAt)
            ? {
                ...current,
                queueExpiresAt: result.expiresAt,
                info: {
                  ...current.info,
                  queueStatus: result.queueStatus,
                  calledAt: result.calledAt,
                },
              }
            : current
        );
      }
      inFlight = false;
    };

    const timer = window.setInterval(
      pollMembership,
      QUEUE_MEMBERSHIP_POLL_MS
    );
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [readMembership, state]);

  // D217: the clock may decide WHEN to ask, never the answer. On the first
  // shared-clock tick at or after the expected lapse (at most 30 seconds),
  // withdraw both checked-in claims before making the server confirmation.
  useEffect(() => {
    if (state.kind !== "checked-in") return;
    if (new Date(state.queueExpiresAt).getTime() > now.getTime()) return;
    const key = `${state.redemptionId}:${state.queueExpiresAt}`;
    if (confirmationFiredFor.current === key) return;
    confirmationFiredFor.current = key;
    // The 30-second bound is TOTAL from the expected lapse, not another 30
    // seconds after this (up-to-30-second) clock tick noticed it. Spend only
    // the part of that budget that remains, so a hung request cannot extend
    // checked-in ambiguity to almost a minute.
    const lapsedByMs = Math.max(0, now.getTime() - new Date(state.queueExpiresAt).getTime());
    void confirmMembership(
      state.redemptionId,
      QUEUE_CONFIRMATION_BOUND_MS - lapsedByMs
    );
  }, [confirmMembership, now, state]);

  // D213 criterion 3 — an expired claim leaves the chooser rather than staying
  // selectable until the check-in API rejects the tap. Selection only; the
  // auto-check-in above stays on the arrival set.
  const liveClaims = claims.filter((c) => isUnexpiredAt(c.expiresAt, now));

  const cancel = useCallback(async (redemptionId: string) => {
    try {
      const res = await fetch("/api/qr/check-in", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redemptionId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.cancelled !== true) {
        setState({
          kind: "cancel-error",
          redemptionId,
          message: body?.error ?? "Could not leave the queue. Please try again.",
        });
        return;
      }
      // A distinct terminal state, NOT `idle`. The single-claim auto-check-in
      // effect is one-shot (`autoFired`), so returning to `idle` left the
      // shopper on the `claims.length === 1 && idle` branch — "Checking you
      // in…" — with no request in flight and nothing that could ever resolve
      // it: the screen said the opposite of what they had just asked for, and
      // only a full reload escaped. D196.
      setState({ kind: "cancelled", redemptionId });
    } catch {
      setState({
        kind: "cancel-error",
        redemptionId,
        message: "Could not leave the queue. Please try again.",
      });
    }
  }, []);

  const shopLine = merchantFloor
    ? `${merchantName}, ${merchantFloor}`
    : merchantName;

  if (liveClaims.length === 0 && state.kind !== "checked-in") {
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
          {state.info.queueStatus === "called"
            ? "It’s your turn."
            : state.already
              ? "You're already checked in."
              : `You're checked in at ${state.info.merchantName}.`}
        </h1>
        <p className="mt-2 text-sm text-secondary">
          {state.info.queueStatus === "called"
            ? "Please go to the counter now."
            : "You’re in the queue. Stay nearby — staff will call you here."}
        </p>
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

  if (state.kind === "confirming-membership") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">Confirming your queue status…</h1>
        <p className="mt-3 text-sm text-secondary">
          MAANTA is checking with the shop before showing a status.
        </p>
      </div>
    );
  }

  if (state.kind === "membership-lapsed") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">You’re no longer checked in.</h1>
        <p className="mt-3 text-sm text-secondary">
          Your queue entry ended. Your claim may still be valid.
        </p>
        <Button full className="mt-8" onClick={() => void checkIn(state.redemptionId)}>
          Check in again
        </Button>
        <ButtonLink href={`/tickets/${state.redemptionId}`} variant="ghost" full className="mt-3">
          Show my code
        </ButtonLink>
      </div>
    );
  }

  if (state.kind === "membership-unknown") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">Queue status unavailable</h1>
        <p className="mt-3 text-sm text-secondary">{state.message}</p>
        <p className="mt-2 text-xs text-muted">
          MAANTA won’t say you’re checked in until the shop confirms it.
        </p>
        <Button full className="mt-8" onClick={() => void confirmMembership(state.redemptionId)}>
          Try again
        </Button>
        <ButtonLink href={`/tickets/${state.redemptionId}`} variant="ghost" full className="mt-3">
          Show my code
        </ButtonLink>
      </div>
    );
  }

  // Left the queue. Terminal, and it says what is and is not affected: the
  // claim is untouched, so checking in again is one tap and the code stays
  // one tap away.
  if (state.kind === "cancelled") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">{shopLine}</h1>
        <p className="mt-3 text-sm text-secondary">
          You&apos;ve left the queue. Your claim is still valid.
        </p>
        <Button
          full
          className="mt-8"
          onClick={() => void checkIn(state.redemptionId)}
        >
          Check in again
        </Button>
        <ButtonLink
          href={`/tickets/${state.redemptionId}`}
          variant="ghost"
          full
          className="mt-3"
        >
          Show my code
        </ButtonLink>
      </div>
    );
  }

  if (state.kind === "cancel-error") {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">Couldn&apos;t leave the queue</h1>
        <p className="mt-3 text-sm text-secondary">{state.message}</p>
        <p className="mt-2 text-xs text-muted">
          You may still be visible to staff until MAANTA confirms the cancellation.
        </p>
        <Button
          full
          className="mt-8"
          onClick={() => void cancel(state.redemptionId)}
        >
          Try again
        </Button>
        <ButtonLink
          href={`/tickets/${state.redemptionId}`}
          variant="ghost"
          full
          className="mt-3"
        >
          Show my code
        </ButtonLink>
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
        {liveClaims.map((c) => (
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
