import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// D162 (founder ruling 2026-08-24) — "Locate my shop" is the primary self-serve
// location method, and what3words must never be able to block onboarding again.
//
// The behaviours below are properties of the SOURCE because they cannot be
// observed any other way here: vitest runs in a `node` environment, so there is
// no `navigator.geolocation` to grant or deny, and the decisions that can be
// isolated already live in `@/lib/shop-location` (see its suite). What is left
// is wiring — which is exactly where a regression would reappear.

const SRC = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

const STEP = read("app/merchant/onboard/locate-shop-step.tsx");
const WIZARD = read("app/merchant/onboard/onboard-wizard.tsx");
const MAP = read("components/merchant/shop-location-map.tsx");
const ROUTE = read("app/api/merchants/onboard/route.ts");

describe("merchant onboarding — location capture (D162)", () => {
  it("asks for a position only when the merchant taps, never on mount", () => {
    // "Do not continuously track the merchant. Request location only when they
    // explicitly use the location action."
    expect(STEP).not.toContain("watchPosition");
    const calls = Array.from(STEP.matchAll(/getCurrentPosition/g));
    expect(calls, "exactly one position request, in the tap handler").toHaveLength(1);
    const at = calls[0].index ?? 0;
    const handlerAt = STEP.indexOf("function locate()");
    expect(handlerAt).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(handlerAt);
    // No effect may reach it — an effect is a request the merchant did not make.
    for (const effect of Array.from(
      STEP.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[/g)
    )) {
      expect(effect[1]).not.toContain("getCurrentPosition");
    }
  });

  it("nothing else in the merchant onboarding flow requests a position", () => {
    expect(WIZARD).not.toContain("getCurrentPosition");
    expect(MAP).not.toContain("getCurrentPosition");
    expect(MAP).not.toContain("watchPosition");
    expect(MAP).not.toContain("navigator.geolocation");
  });

  it("says plainly that the location is read on tap and not afterwards", () => {
    // JSX wraps, so match across the line break rather than on one line.
    expect(STEP).toMatch(/only\s+when\s+you\s+tap/i);
    expect(STEP).toMatch(/never\s+follows\s+your\s+location/i);
  });

  it("requires an explicit confirmation of the pin before continuing", () => {
    expect(STEP).toContain('type="checkbox"');
    expect(STEP).toContain("confirmed: e.target.checked");
    expect(WIZARD).toContain("isLocationStepComplete");
  });

  it("drops a confirmation when a new reading replaces the pin", () => {
    // A tick that refers to a position no longer on screen is not a confirmation.
    const handler = STEP.slice(STEP.indexOf("function locate()"), STEP.indexOf("function movePin"));
    expect(handler).toContain("confirmed: false");
    const move = STEP.slice(STEP.indexOf("function movePin"), STEP.indexOf("function applyTypedCoords"));
    expect(move).toContain("confirmed: false");
  });

  it("offers a manual pin on every failure path rather than dead-ending", () => {
    expect(STEP).toContain('setFailure("unsupported")');
    expect(STEP).toContain("setManualOpen(true)");
    // The map itself is the manual correction: tap to place, drag to adjust.
    expect(MAP).toContain("draggable");
    expect(MAP).toContain("dragend");
    expect(MAP).toContain("click:");
    // And a typed-coordinate fallback for when map tiles will not load at all.
    expect(STEP).toContain("applyTypedCoords");
  });

  it("warns about a coarse reading without refusing it", () => {
    expect(STEP).toContain("isAccuracyAdequate");
    expect(STEP).toMatch(/too broad to tell one shop from the next/i);
    // Rule 5: warning is rust, never red or yellow.
    expect(STEP).toContain("border-rust");
    expect(STEP).not.toMatch(/text-flame|bg-flame|text-red-|bg-yellow-/);
  });

  it("keeps one amber action on the screen at a time (frozen UI rule 1)", () => {
    // Locate is the primary action until there is a pin; after that Continue is,
    // and Locate again steps back to a bordered button.
    expect(STEP).toContain('variant={hasPin ? "ghost" : "primary"}');
  });

  it("no longer collects or validates a what3words address anywhere in the wizard", () => {
    expect(WIZARD).not.toContain("/api/w3w/validate");
    expect(WIZARD).not.toContain("what3wordsAddress");
    // The step may still EXPLAIN why what3words is gone; it must not ask for it.
    expect(STEP).not.toContain("/api/w3w");
    expect(STEP).not.toContain("what3wordsAddress");
  });

  it("keeps what3words strictly best-effort on the server side", () => {
    expect(ROUTE).toContain("convertTo3Words");
    // Bounded, and every failure collapses to null rather than an error path.
    expect(ROUTE).toContain("W3W_ENRICHMENT_TIMEOUT_MS");
    expect(ROUTE).toMatch(/catch \{\s*w3wAddress = null;/);
  });

  it("loads leaflet only in the browser, so the build never evaluates it on the server", () => {
    expect(STEP).toContain("ssr: false");
    expect(STEP).toContain('dynamic(');
    expect(MAP).toContain('"use client"');
  });

  it("does not weaken approval — the route cannot make a shop active", () => {
    // onboard_merchant hardcodes status='pending' and only the admin approve
    // route flips it. This ruling relaxed a location requirement, nothing else.
    expect(ROUTE).not.toContain("'active'");
    expect(ROUTE).not.toContain('"active"');
    expect(ROUTE).not.toContain("p_status");
  });
});
