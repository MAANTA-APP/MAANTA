/**
 * How the shopper client reads a `POST /api/redemptions` response.
 *
 * ## Why this is its own module
 *
 * The claim flow used to do this inline, and the shape of it caused a real
 * production incident (`docs/ops/claim-failure-investigation-2026-08-14.md`):
 *
 * ```ts
 * const body = await res.json();          // ← threw on any non-JSON response
 * if (!res.ok) { … }                      // ← never reached
 * } catch { setError("Network error — please try again."); }
 * ```
 *
 * `res.json()` ran inside the `try` and *before* `res.ok` was consulted, so a
 * platform 500, a 504, or an empty body threw a parse error into the same
 * `catch` that handles a dropped connection — and that `catch` never inspected
 * what it caught. Every one of those reached the shopper as "Network error",
 * which is a diagnosis, and a wrong one: the request had in fact arrived, and
 * the claim may well have committed before the response was lost.
 *
 * That is the dangerous part. Telling someone a network failed invites them to
 * press the button again, when the honest instruction is to go and look at
 * their tickets first.
 *
 * So: parsing never throws, `res.ok` is evaluated on its own, and the three
 * outcomes a caller must distinguish are named rather than implied. Pure and
 * DOM-free on purpose — it takes a `Response` and returns a verdict, so the
 * table of cases can be tested directly instead of through a rendered
 * component.
 */

/**
 * Shown whenever the outcome of a claim is genuinely unknown to the client.
 *
 * Two distinct situations produce it, and they share this wording because the
 * shopper's correct next action is identical in both: the request may have been
 * processed, so **look before retrying**.
 *
 *  - `fetch` rejected — dropped connection, DNS, TLS, a backgrounded tab. The
 *    request may or may not have reached the server.
 *  - A response arrived but was not JSON — a platform 5xx or a function
 *    timeout. The request certainly arrived, and on a timeout the claim is
 *    likely already committed.
 *
 * It deliberately does not say "network", does not say "try again", and does
 * not apologise. It states what is not known and what to do about it.
 */
export const CLAIM_UNCONFIRMED_MESSAGE =
  "We couldn't confirm your claim. Check My Deals before trying again.";

/** Last-resort wording when the server returns a JSON error with no message. */
export const CLAIM_GENERIC_ERROR_MESSAGE = "Could not claim this deal.";

export type ClaimOutcome =
  /** Claim committed; `redemptionId` addresses the ticket. */
  | { kind: "success"; redemptionId: string }
  /** Server asked for a gate to be satisfied first; route the shopper there. */
  | { kind: "redirect"; to: "phone" | "login" }
  /**
   * Show `message` verbatim. Already shopper-safe — never a raw server error.
   *
   * `stale` means the server refused because the DEAL moved on, not because
   * anything about this shopper or this request was wrong: it sold out, was
   * paused, expired, or was switched off while the page sat open. The caller
   * should re-render the deal so its buttons and counts stop contradicting the
   * message. It is deliberately NOT set for a transport failure or an unknown
   * outcome — refreshing there would replace an honest "go and check" with a
   * page that may look claimable and invite a second attempt.
   */
  | { kind: "error"; message: string; stale?: true };

/** JSON body shapes the route can return. Anything else is treated as absent. */
type ClaimResponseBody = {
  redemptionId?: unknown;
  error?: unknown;
  code?: unknown;
};

/**
 * Parse without ever throwing.
 *
 * A rejected `res.json()` is indistinguishable here from a body that was never
 * JSON, and both mean the same thing to the caller: there is no structured
 * error to show.
 */
async function readJsonBody(res: Response): Promise<ClaimResponseBody | null> {
  try {
    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ClaimResponseBody;
  } catch {
    return null;
  }
}

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v : null;

/**
 * Turn a response the client actually received into an outcome.
 *
 * Ordering matters and is the whole point: the body is read defensively first,
 * `res.ok` decides the branch, and a missing or unparseable body can only ever
 * downgrade the message — it can never throw the caller into the transport
 * path, which is exactly the bug this replaces.
 */
export async function interpretClaimResponse(
  res: Response
): Promise<ClaimOutcome> {
  const body = await readJsonBody(res);

  if (!res.ok) {
    // Typed gates the client can act on rather than merely display.
    const code = asString(body?.code);
    if (code === "phone_required") return { kind: "redirect", to: "phone" };
    if (code === "sign_in_required") return { kind: "redirect", to: "login" };

    // The deal itself changed under the shopper. Same message, plus a signal
    // that what is on screen is out of date.
    const STALE_DEAL_CODES = new Set([
      "deal_claim_limit_reached",
      "deal_paused",
      "deal_expired",
    ]);

    const message = asString(body?.error);
    if (message) {
      return code && STALE_DEAL_CODES.has(code)
        ? { kind: "error", message, stale: true }
        : { kind: "error", message };
    }

    // Non-OK with no readable JSON error: a platform 5xx or a timed-out
    // function. The claim may already exist — say so instead of guessing.
    return { kind: "error", message: CLAIM_UNCONFIRMED_MESSAGE };
  }

  const redemptionId = asString(body?.redemptionId);
  if (!redemptionId) {
    // 2xx that carries no ticket id. Nothing safe to navigate to, and the
    // claim's true state is unknown — same instruction as a lost response.
    return { kind: "error", message: CLAIM_UNCONFIRMED_MESSAGE };
  }

  return { kind: "success", redemptionId };
}

/**
 * Outcome when `fetch` itself rejected, so no response exists.
 *
 * Named rather than inlined so the caller cannot accidentally reuse the old
 * "network error" phrasing: whether the server saw the request is unknowable
 * from here, which is precisely why the shopper is sent to check first.
 */
export function claimTransportFailure(): Extract<ClaimOutcome, { kind: "error" }> {
  return { kind: "error", message: CLAIM_UNCONFIRMED_MESSAGE };
}
