import { describe, expect, it } from "vitest";
import {
  GEOLOCATION_REQUEST_OPTIONS,
  SHOP_LOCATION_ACCURACY_WARN_M,
  formatAccuracy,
  formatCoordinate,
  geolocationFailureKind,
  geolocationFailureMessage,
  isAccuracyAdequate,
  isLocationStepComplete,
  isValidCoordinatePair,
  isValidLatitude,
  isValidLongitude,
  parseCoordinateInput,
  shopNavigationTarget,
} from "@/lib/shop-location";

// D162 (founder ruling 2026-08-24) — browser geolocation replaces mandatory
// what3words as the self-serve location method, and the coordinates it produces
// are MAANTA's canonical store location.
//
// These cover the decision logic the ruling names — permission granted, denied,
// unavailable, poor accuracy, manual correction — which lives here rather than
// in the component precisely so it can be tested: the vitest environment is
// `node`, so a browser permission dialog is not reachable, and logic that only
// exists inside a click handler is logic nothing verifies.

const BBS_MALL = { lat: -1.2746, lng: 36.8501 };

describe("shop location — coordinate validation", () => {
  it("accepts a real Nairobi shop coordinate", () => {
    expect(isValidCoordinatePair(BBS_MALL.lat, BBS_MALL.lng)).toBe(true);
  });

  it("rejects out-of-range values (mirrors merchants_lat_lng_range)", () => {
    expect(isValidLatitude(90.0001)).toBe(false);
    expect(isValidLatitude(-90.0001)).toBe(false);
    expect(isValidLongitude(180.0001)).toBe(false);
    expect(isValidLongitude(-180.0001)).toBe(false);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
  });

  it("rejects NaN and Infinity, which a CHECK would only surface as a 500", () => {
    expect(isValidCoordinatePair(NaN, 36.85)).toBe(false);
    expect(isValidCoordinatePair(-1.27, Infinity)).toBe(false);
    expect(isValidCoordinatePair(-Infinity, -Infinity)).toBe(false);
  });

  it("rejects half a pair and non-numbers (mirrors merchants_lat_lng_pair)", () => {
    expect(isValidCoordinatePair(BBS_MALL.lat, null)).toBe(false);
    expect(isValidCoordinatePair(null, BBS_MALL.lng)).toBe(false);
    expect(isValidCoordinatePair("-1.2746", "36.8501")).toBe(false);
    expect(isValidCoordinatePair(undefined, undefined)).toBe(false);
  });

  it("does not treat 0,0 as absence — Null Island is a valid pair, just not a shop", () => {
    expect(isValidCoordinatePair(0, 0)).toBe(true);
  });

  it("parses typed coordinates and refuses half-typed ones", () => {
    expect(parseCoordinateInput(" -1.2746 ")).toBe(-1.2746);
    expect(parseCoordinateInput("36.8501")).toBe(36.8501);
    expect(parseCoordinateInput("")).toBeNull();
    expect(parseCoordinateInput("-")).toBeNull();
    expect(parseCoordinateInput("1.2.3")).toBeNull();
    expect(parseCoordinateInput("south")).toBeNull();
  });
});

describe("shop location — geolocation outcomes", () => {
  it("asks for a fresh high-accuracy fix, never a cached one", () => {
    // A cached fix from the merchant's home this morning is exactly the wrong
    // answer: the whole point is a reading taken at the shop door.
    expect(GEOLOCATION_REQUEST_OPTIONS.maximumAge).toBe(0);
    expect(GEOLOCATION_REQUEST_OPTIONS.enableHighAccuracy).toBe(true);
    expect(GEOLOCATION_REQUEST_OPTIONS.timeout).toBeGreaterThan(0);
  });

  it("classifies a denied permission", () => {
    expect(geolocationFailureKind({ code: 1 })).toBe("permission_denied");
    expect(geolocationFailureMessage("permission_denied")).toMatch(/permission/i);
  });

  it("classifies an unavailable position", () => {
    expect(geolocationFailureKind({ code: 2 })).toBe("unavailable");
  });

  it("classifies a timeout separately from an unavailable position", () => {
    expect(geolocationFailureKind({ code: 3 })).toBe("timeout");
    expect(geolocationFailureMessage("timeout")).not.toBe(
      geolocationFailureMessage("unavailable")
    );
  });

  it("treats an unrecognised or absent error as unavailable rather than throwing", () => {
    expect(geolocationFailureKind({ code: 99 })).toBe("unavailable");
    expect(geolocationFailureKind(null)).toBe("unavailable");
    expect(geolocationFailureKind(undefined)).toBe("unavailable");
  });

  it("offers the manual pin in every failure message — none of them dead-ends", () => {
    for (const kind of ["unsupported", "permission_denied", "unavailable", "timeout"] as const) {
      expect(geolocationFailureMessage(kind), kind).toMatch(/pin on the map/i);
    }
  });

  it("never says a failure is the merchant's fault", () => {
    for (const kind of ["unsupported", "permission_denied", "unavailable", "timeout"] as const) {
      expect(geolocationFailureMessage(kind), kind).not.toMatch(/\byou(r)? (mistake|error)\b/i);
    }
  });
});

describe("shop location — accuracy", () => {
  it("accepts a fix that can identify one shop entrance", () => {
    expect(isAccuracyAdequate(8)).toBe(true);
    expect(isAccuracyAdequate(SHOP_LOCATION_ACCURACY_WARN_M)).toBe(true);
  });

  it("flags a fix too coarse to tell one shop from the next", () => {
    expect(isAccuracyAdequate(SHOP_LOCATION_ACCURACY_WARN_M + 1)).toBe(false);
    expect(isAccuracyAdequate(2400)).toBe(false);
  });

  it("does not punish a device that reports no accuracy at all", () => {
    expect(isAccuracyAdequate(null)).toBe(true);
    expect(isAccuracyAdequate(undefined)).toBe(true);
    expect(isAccuracyAdequate(NaN)).toBe(true);
  });

  it("renders accuracy as a plain distance", () => {
    expect(formatAccuracy(12.4)).toBe("12 m");
    expect(formatAccuracy(1400)).toBe("1.4 km");
    expect(formatAccuracy(NaN)).toBe("unknown");
  });
});

describe("shop location — the step gate", () => {
  it("blocks until the merchant confirms, even with a perfect fix", () => {
    expect(
      isLocationStepComplete({ lat: BBS_MALL.lat, lng: BBS_MALL.lng, confirmed: false })
    ).toBe(false);
  });

  it("blocks a confirmation with no coordinates behind it", () => {
    expect(isLocationStepComplete({ lat: null, lng: null, confirmed: true })).toBe(false);
  });

  it("passes on a confirmed, valid pin", () => {
    expect(
      isLocationStepComplete({ lat: BBS_MALL.lat, lng: BBS_MALL.lng, confirmed: true })
    ).toBe(true);
  });

  it("does NOT block on poor accuracy — that is a warning and a manual pin, not a refusal", () => {
    // Refusing here would recreate the dead end D162 exists to remove.
    expect(isAccuracyAdequate(900)).toBe(false);
    expect(
      isLocationStepComplete({ lat: BBS_MALL.lat, lng: BBS_MALL.lng, confirmed: true })
    ).toBe(true);
  });

  it("formats a coordinate to metre-level precision for read-back", () => {
    expect(formatCoordinate(-1.27461234)).toBe("-1.27461");
    expect(formatCoordinate(36.85)).toBe("36.85000");
  });
});

describe("shop location — where Navigate sends a shopper", () => {
  it("prefers the three words when the shop has them", () => {
    expect(
      shopNavigationTarget({ what3words_address: "stove.cactus.rally", lat: null, lng: null })
    ).toEqual({ href: "https://what3words.com/stove.cactus.rally", external: true });
  });

  it("falls back to the in-app map for a coordinate-only shop", () => {
    expect(
      shopNavigationTarget({ what3words_address: null, ...BBS_MALL })
    ).toEqual({ href: `/map?lat=${BBS_MALL.lat}&lng=${BBS_MALL.lng}`, external: false });
  });

  it("returns null rather than a broken link when a shop has no location at all", () => {
    expect(shopNavigationTarget({ what3words_address: null, lat: null, lng: null })).toBeNull();
  });

  it("strips a leading /// so the link never doubles it", () => {
    expect(
      shopNavigationTarget({ what3words_address: "///filled.count.soap", lat: null, lng: null })
    ).toEqual({ href: "https://what3words.com/filled.count.soap", external: true });
  });
});
