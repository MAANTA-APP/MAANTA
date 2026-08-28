import { describe, expect, it } from "vitest";
import {
  listReadState,
  listReadRows,
  navigationState,
  SHOPPER_LIST_READ_ERROR,
  shopLocationUnavailable,
  hasOnScreenLocationDetails,
} from "@/lib/shopper-read-state";

/**
 * Behavioural, by forcing the failure — not by scanning source for a shape.
 *
 * The single assertion that matters is the asymmetry: a failed read and a
 * genuinely empty result must not produce the same state. Every instance of
 * this defect class — D164, D185, D202, PR 5's P1b — passes a two-state test
 * happily, because two states is exactly what the bug has.
 */

describe("list reads keep failure and emptiness apart", () => {
  it("does not collapse a failed read into an empty one", () => {
    const failed = listReadState({ data: null, error: { message: "PostgREST 500" } });
    const empty = listReadState({ data: [], error: null });
    expect(failed).toBe("failed");
    expect(empty).toBe("empty");
    expect(failed).not.toBe(empty);
  });

  it("treats an error as failed even when rows came back with it", () => {
    // A partial result with an error is not a result. Trusting the rows here
    // would render a short list as though it were the whole list.
    expect(listReadState({ data: [1, 2], error: { message: "timeout" } })).toBe("failed");
  });

  it("reports ready only for a clean read with rows", () => {
    expect(listReadState({ data: [1], error: null })).toBe("ready");
  });

  it("treats a null data with no error as empty, not failed", () => {
    // PostgREST can return null data on a legitimately empty head/limit read.
    expect(listReadState({ data: null, error: null })).toBe("empty");
  });

  it("iterates nothing on failure, so a caller cannot render a partial list as whole", () => {
    expect(listReadRows({ data: [1, 2], error: { message: "boom" } })).toEqual([]);
    expect(listReadRows({ data: [1, 2], error: null })).toEqual([1, 2]);
    expect(listReadRows({ data: null, error: null })).toEqual([]);
  });

  it("says the read failed and never that the list is empty", () => {
    const text = `${SHOPPER_LIST_READ_ERROR.title} ${SHOPPER_LIST_READ_ERROR.sub}`;
    expect(text).toMatch(/not an empty list/i);
    // The words that would make the failure read as an assertion of emptiness.
    expect(text).not.toMatch(/\bno (claimed|deals|tickets)\b/i);
  });

  it("claims nothing about the cause or about the shopper's data", () => {
    // `listReadState` establishes ONE fact: the query returned an error. It
    // does not establish why. The first version asserted two things it could
    // not see — that the cause was "a loading problem" and that "nothing of
    // yours has been lost". A schema error, an RLS failure or a service outage
    // is none of them connectivity, and none of them evidence about the state
    // of the shopper's rows. A guarantee made from an error is the same defect
    // this state exists to prevent, pointed the other way.
    const text = `${SHOPPER_LIST_READ_ERROR.title} ${SHOPPER_LIST_READ_ERROR.sub}`;
    expect(text, "must not diagnose a cause it cannot see").not.toMatch(
      /loading problem|connection|connectivity|offline|network/i
    );
    expect(text, "must not guarantee the state of unread data").not.toMatch(
      /nothing.*lost|nothing.*gone|safe|intact|preserved/i
    );
  });

  it("still gives the shopper a next step", () => {
    // Dropping the unverifiable reassurance must not leave a dead end.
    expect(SHOPPER_LIST_READ_ERROR.sub).toMatch(/try again/i);
  });
});

describe("absent wayfinding is a stated state, not a missing control", () => {
  it("distinguishes a usable target from none", () => {
    expect(navigationState({ href: "/map?lat=1&lng=2", external: false })).toBe("available");
    expect(navigationState({ href: "https://what3words.com/a.b.c", external: true })).toBe(
      "available"
    );
    expect(navigationState(null)).toBe("unavailable");
  });

  /** The four shapes a merchant record can take for on-screen wayfinding. */
  const LOCATION_SHAPES = [
    { floor: "1st Floor", unit_number: "B-14" },
    { floor: "1st Floor", unit_number: null },
    { floor: null, unit_number: "B-14" },
    { floor: null, unit_number: null },
  ];

  it("never fabricates a destination, in any variant", () => {
    // A map centred on the mall, or any invented pin, sends a shopper
    // confidently to the wrong place — worse than saying nothing.
    for (const shop of LOCATION_SHAPES) {
      const copy = shopLocationUnavailable(shop);
      expect(copy).not.toMatch(/https?:\/\//);
      expect(copy).not.toMatch(/what3words|\/map|lat=|lng=/);
    }
  });

  it("names only the locators the screen is actually showing", () => {
    // The defect this replaces: the copy took a boolean and said "the floor
    // and unit above" for ANY truthy value, while hasOnScreenLocationDetails
    // is floor OR unit. So a shop with only a floor, or only a unit, was
    // pointed at a second locator that does not exist — fabricated wayfinding,
    // which is the same failure as a fabricated destination one level down.
    const both = shopLocationUnavailable({ floor: "1st Floor", unit_number: "B-14" });
    expect(both).toMatch(/floor and unit/i);

    const floorOnly = shopLocationUnavailable({ floor: "1st Floor", unit_number: null });
    expect(floorOnly).toMatch(/use the floor above/i);
    expect(floorOnly, "must not promise a unit that is not there").not.toMatch(
      /floor and unit/i
    );

    const unitOnly = shopLocationUnavailable({ floor: null, unit_number: "B-14" });
    expect(unitOnly).toMatch(/use the unit number above/i);
    expect(unitOnly, "must not promise a floor that is not there").not.toMatch(
      /floor and unit/i
    );

    const neither = shopLocationUnavailable({ floor: null, unit_number: null });
    expect(neither).not.toMatch(/floor and unit above/i);
  });

  it("treats a blank locator as absent in the copy, not just in the predicate", () => {
    // A record with floor: "" renders nothing, so the copy must not point at
    // it — the predicate already knows this and the copy must agree.
    const blankUnit = shopLocationUnavailable({ floor: "1st Floor", unit_number: "   " });
    expect(blankUnit).toMatch(/use the floor above/i);
    expect(blankUnit).not.toMatch(/floor and unit/i);
  });

  it("still offers a next step in every variant", () => {
    // Saying only "we don't know where this is" strands the shopper.
    for (const shop of LOCATION_SHAPES) {
      expect(shopLocationUnavailable(shop)).toMatch(/information desk/i);
    }
  });

  it("does not call a missing shop location an error, in any variant", () => {
    // It is a gap in the shop's record, not a failure of this screen, so
    // telling the shopper to retry would be a lie.
    for (const shop of LOCATION_SHAPES) {
      expect(shopLocationUnavailable(shop)).not.toMatch(/error|try again|reload/i);
    }
  });

  it("treats blank strings as absent, not as details", () => {
    // A record with floor: "" renders nothing, so promising a floor would be
    // as wrong as promising a null one.
    expect(hasOnScreenLocationDetails({ floor: "", unit_number: "   " })).toBe(false);
    expect(hasOnScreenLocationDetails({ floor: null, unit_number: null })).toBe(false);
    expect(hasOnScreenLocationDetails({ floor: "1st Floor", unit_number: null })).toBe(true);
    expect(hasOnScreenLocationDetails({ floor: null, unit_number: "B-14" })).toBe(true);
  });
});
