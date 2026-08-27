import { describe, expect, it } from "vitest";
import {
  listReadState,
  listReadRows,
  navigationState,
  SHOPPER_LIST_READ_ERROR,
  SHOP_LOCATION_UNAVAILABLE,
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

  it("says loading problem, never empty, in the failure copy", () => {
    const text = `${SHOPPER_LIST_READ_ERROR.title} ${SHOPPER_LIST_READ_ERROR.sub}`;
    expect(text).toMatch(/not an empty list/i);
    expect(text).toMatch(/nothing of yours has been lost/i);
    // The words that would make the failure read as an assertion of emptiness.
    expect(text).not.toMatch(/\bno (claimed|deals|tickets)\b/i);
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

  it("never fabricates a destination in the unavailable copy", () => {
    // A map centred on the mall, or any invented pin, sends a shopper
    // confidently to the wrong place — worse than saying nothing.
    expect(SHOP_LOCATION_UNAVAILABLE).not.toMatch(/https?:\/\//);
    expect(SHOP_LOCATION_UNAVAILABLE).not.toMatch(/what3words|\/map|lat=|lng=/);
  });

  it("points at the wayfinding the shopper does have", () => {
    expect(SHOP_LOCATION_UNAVAILABLE).toMatch(/floor and unit/i);
  });

  it("does not call a missing shop location an error", () => {
    // It is a gap in the shop's record, not a failure of this screen, so
    // telling the shopper to retry would be a lie.
    expect(SHOP_LOCATION_UNAVAILABLE).not.toMatch(/error|try again|reload/i);
  });
});
