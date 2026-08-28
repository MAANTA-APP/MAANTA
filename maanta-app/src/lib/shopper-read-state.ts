/**
 * Three-state reads and the absent-wayfinding state, for shopper surfaces.
 *
 * ## The house defect this exists to stop
 *
 * D164, D185, D202 and PR 5's P1b are all one shape: a **two-state decision
 * over a three-state input**. A read can succeed with rows, succeed with none,
 * or fail — and `data ?? []` flattens the third into the second. The surface
 * then renders its empty state, which is an assertion: *there is nothing here*.
 *
 * On an operations console that is a misleading number. On `/my-deals` it is
 * worse than misleading, because that list is where a shopper keeps the codes
 * they redeem at a counter. A shopper shown "No claimed deals yet" while
 * holding a live ticket does not walk to the shop. The read failure becomes a
 * missed redemption, a merchant who never sees them, and a KES 30 success fee
 * that never happens — from a transient PostgREST error.
 *
 * D202 was literally `rewardBalance ?? 0` on a shopper surface, and `/you` now
 * carries a comment saying so. This module is that lesson made reusable
 * instead of re-learned per screen.
 *
 * ## Why a function and not a convention
 *
 * A source-scanning guard can only see the shapes it was told to look for, and
 * a convention is only as good as the next person's memory. A decision
 * function can be tested by *forcing the failure* — the asymmetry
 * `state(failed) !== state(empty)` is one assertion, and it either holds or it
 * does not. That is the standard PR 5's `queueAlertState()` was held to.
 *
 * Deliberately mirrors `MetricValue<T>` in `lib/merchant-owner-stats.ts` and
 * the three-state labelling in `lib/claims-window.ts` rather than introducing a
 * fourth vocabulary.
 */

/**
 * What a list surface should render.
 *
 * - `failed` — the read errored. Say so; never claim emptiness.
 * - `empty` — the read succeeded and there is genuinely nothing.
 * - `ready` — there are rows.
 */
export type ListReadState = "failed" | "empty" | "ready";

/**
 * Classify a Supabase list read.
 *
 * Takes the whole `{ data, error }` rather than pre-coalesced rows, because
 * the coalescing is the bug: once a caller writes `data ?? []` the failure is
 * already indistinguishable from an empty result and no later check can
 * recover it.
 */
export function listReadState<T>(result: {
  data: T[] | null;
  error: unknown;
}): ListReadState {
  if (result.error) return "failed";
  if (!result.data || result.data.length === 0) return "empty";
  return "ready";
}

/**
 * Rows to render for a list read — always an array, so callers keep mapping
 * over it, and never a claim that the list is empty.
 *
 * Pair it with {@link listReadState}: the state decides what the surface
 * *says*, this decides what it *iterates*.
 */
export function listReadRows<T>(result: { data: T[] | null; error: unknown }): T[] {
  return result.error ? [] : result.data ?? [];
}

/**
 * Copy for the failed-read state on a shopper list.
 *
 * Kept here so every shopper surface says the same thing, in the product's
 * closed vocabulary, and so the wording cannot drift into implying emptiness.
 *
 * It says exactly what the caller knows and nothing more, and getting there
 * took three passes because each one left a claim behind.
 *
 * `listReadState` establishes ONE fact: the query returned an error.
 *
 *  1. The first version said the cause was "a loading problem" and that
 *     "nothing of yours has been lost". A schema error, an RLS failure or a
 *     service outage is none of them connectivity, and none of them evidence
 *     about the state of the shopper's rows.
 *  2. The second dropped those and still said "it is not an empty list" —
 *     which asserts rows EXIST. The read failed, so emptiness was never
 *     determined; it was not disproved. A shopper who genuinely holds no
 *     tickets was told, falsely, that they hold some.
 *
 * The honest statement is that the list is UNKNOWN, not that it is non-empty.
 * That still does the job this state exists for: the screen must not read as
 * "you have nothing", and saying it does not show whether anything is here
 * prevents that without inventing the opposite.
 */
export const SHOPPER_LIST_READ_ERROR = {
  title: "Couldn't load this right now",
  sub: "We couldn't load this, so it doesn't show whether you have anything here. Try again in a moment, and if it keeps failing let us know.",
} as const;

/**
 * What the wayfinding control should do for a shop.
 *
 * `shopNavigationTarget()` returns null when a shop has neither a what3words
 * address nor coordinates. Both surfaces rendered that as `: null` — the
 * button simply was not there, with no explanation. A shopper holding a code
 * for a shop they cannot find gets no wayfinding AND no acknowledgement that
 * wayfinding is missing, which reads as a broken screen rather than an
 * incomplete shop record.
 *
 * The honest state is to say the shop has not shared its location and point at
 * what the shopper *does* have — the floor and unit already on the screen.
 * Deliberately NOT a fabricated destination and NOT a map centred on the mall:
 * either would send someone confidently to the wrong place, which is worse
 * than saying nothing.
 */
export type NavigationState = "available" | "unavailable";

export function navigationState(
  target: { href: string; external: boolean } | null
): NavigationState {
  return target ? "available" : "unavailable";
}

/**
 * The line shown in place of the Navigate control.
 *
 * It states the fact, then the fallback — and the fallback it names depends on
 * what the screen is actually showing.
 *
 * The first version always said "use the floor and unit above". Codex caught
 * that this can be a lie: `/tickets/[id]` did not fetch `unit_number` at all,
 * `/shops/[id]` fetched it without rendering it, and both render `floor` only
 * when it exists. A shopper with a locationless record could be pointed at
 * wayfinding that is not on the screen and may not exist — which is the same
 * class of failure as fabricating a destination, just quieter.
 *
 * So the caller passes the record and the copy names exactly the locators
 * that exist — floor and unit, floor only, unit only, or neither. It never says
 * "error": a shop with no recorded location is a gap in that shop's record,
 * not a failure of this screen, and telling the shopper to retry would be a
 * lie of a different kind.
 */
export function shopLocationUnavailable(shop: {
  floor?: string | null;
  unit_number?: string | null;
}): string {
  const floor = Boolean(shop.floor?.trim());
  const unit = Boolean(shop.unit_number?.trim());

  // Name only what is actually on the screen. The previous version took a
  // boolean and said "the floor and unit above" for ANY truthy value — but
  // `hasOnScreenLocationDetails` is floor OR unit, so a shop with just a floor,
  // or just a unit, was pointed at a second locator that does not exist. That
  // is the same defect this whole state was added to prevent, one level down:
  // not a fabricated destination, but fabricated wayfinding to it.
  if (floor && unit) {
    return "This shop hasn't shared a map location yet — use the floor and unit above to find it, or ask at the mall information desk.";
  }
  if (floor) {
    return "This shop hasn't shared a map location or unit number — use the floor above to find it, or ask at the mall information desk.";
  }
  if (unit) {
    return "This shop hasn't shared a map location or floor — use the unit number above to find it, or ask at the mall information desk.";
  }
  return "This shop hasn't shared a map location, floor or unit — ask at the mall information desk to find it.";
}

/**
 * True when a surface has something concrete to point the shopper at.
 *
 * Blank strings count as absent: a merchant record with `floor: ""` renders
 * nothing, so promising a floor would be as wrong as promising one that is
 * null.
 */
export function hasOnScreenLocationDetails(shop: {
  floor?: string | null;
  unit_number?: string | null;
}): boolean {
  return Boolean(shop.floor?.trim() || shop.unit_number?.trim());
}
