"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/inputs";
import { IconCheck, IconPin } from "@/components/ui/icons";
import { cn } from "@/lib/ui";
import {
  GEOLOCATION_REQUEST_OPTIONS,
  formatAccuracy,
  formatCoordinate,
  geolocationFailureKind,
  geolocationFailureMessage,
  isAccuracyAdequate,
  isValidCoordinatePair,
  parseCoordinateInput,
  type GeolocationFailureKind,
} from "@/lib/shop-location";

const ShopLocationMap = dynamic(
  () => import("@/components/merchant/shop-location-map").then((m) => m.ShopLocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-card bg-cream text-sm text-muted">
        Loading map…
      </div>
    ),
  }
);

/**
 * The shop location as the wizard holds it. Owned by the wizard rather than
 * this component so stepping back to Business details and returning does not
 * silently discard a confirmed pin.
 */
export type ShopLocationValue = {
  lat: number | null;
  lng: number | null;
  /** Radius of the device reading, in metres. Null once the pin is moved by hand. */
  accuracyMetres: number | null;
  /** How the current pin got there — shown back to the merchant, nothing more. */
  source: "device" | "manual" | null;
  /** The merchant's explicit "this is my shop" — never inferred. */
  confirmed: boolean;
};

export const EMPTY_SHOP_LOCATION: ShopLocationValue = {
  lat: null,
  lng: null,
  accuracyMetres: null,
  source: null,
  confirmed: false,
};

/**
 * Step 2 of merchant onboarding — "Locate my shop" (D162, founder ruling
 * 2026-08-24).
 *
 * The merchant stands at their own entrance and taps once; the browser asks for
 * permission at that moment and at no other. Every way that can fail — declined
 * permission, no fix, a slow fix, a fix too coarse to tell one shop from the
 * next — lands on the same fallback rather than a dead end: the map below, where
 * the pin can be placed and dragged by hand. Nothing continues until the
 * merchant confirms the pin, and what is submitted is the confirmed pin, not
 * the phone's first reading.
 *
 * what3words is not asked for here at all. It was mandatory until this ruling,
 * which is how a lapsed provider quota (D162) came to block sign-up entirely;
 * the server now derives it after the fact, best-effort, and onboarding does not
 * care whether that succeeds.
 */
export function LocateShopStep({
  value,
  onChange,
  nodeCentre,
  nodeLabel,
}: {
  value: ShopLocationValue;
  onChange: (next: ShopLocationValue) => void;
  nodeCentre: [number, number];
  nodeLabel: string;
}) {
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<GeolocationFailureKind | null>(null);
  // Opened by a failure or a coarse reading, and by the merchant on request.
  const [manualOpen, setManualOpen] = useState(
    () => value.lat != null && !isAccuracyAdequate(value.accuracyMetres)
  );
  const [coordsOpen, setCoordsOpen] = useState(false);
  const [latInput, setLatInput] = useState(value.lat != null ? String(value.lat) : "");
  const [lngInput, setLngInput] = useState(value.lng != null ? String(value.lng) : "");
  const [coordsError, setCoordsError] = useState<string | null>(null);
  // Bumped only when a fresh DEVICE reading lands, so the map recentres then
  // and never while the merchant is dragging the pin.
  const [recenterKey, setRecenterKey] = useState(0);

  // A request in flight when the merchant leaves must not write to a dead
  // component, and must not be mistaken for a new one when they come back.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const hasPin = isValidCoordinatePair(value.lat, value.lng);
  const coarse = hasPin && !isAccuracyAdequate(value.accuracyMetres);

  function locate() {
    setFailure(null);
    setCoordsError(null);

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setFailure("unsupported");
      setManualOpen(true);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!live.current) return;
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        if (!isValidCoordinatePair(latitude, longitude)) {
          setFailure("unavailable");
          setManualOpen(true);
          return;
        }
        const accuracyMetres = Number.isFinite(accuracy) ? accuracy : null;
        setLatInput(String(latitude));
        setLngInput(String(longitude));
        setRecenterKey((k) => k + 1);
        // A new reading replaces the pin, so the previous confirmation no
        // longer describes what is on screen.
        onChange({
          lat: latitude,
          lng: longitude,
          accuracyMetres,
          source: "device",
          confirmed: false,
        });
        if (!isAccuracyAdequate(accuracyMetres)) setManualOpen(true);
      },
      (err) => {
        if (!live.current) return;
        setLocating(false);
        const kind = geolocationFailureKind(err);
        setFailure(kind);
        setManualOpen(true);
      },
      GEOLOCATION_REQUEST_OPTIONS
    );
  }

  /** A pin the merchant placed or dragged. Device accuracy no longer applies. */
  function movePin(lat: number, lng: number) {
    if (!isValidCoordinatePair(lat, lng)) return;
    setLatInput(String(lat));
    setLngInput(String(lng));
    setCoordsError(null);
    onChange({
      lat,
      lng,
      accuracyMetres: null,
      source: "manual",
      confirmed: false,
    });
  }

  function applyTypedCoords() {
    const lat = parseCoordinateInput(latInput);
    const lng = parseCoordinateInput(lngInput);
    if (!isValidCoordinatePair(lat, lng)) {
      setCoordsError("Enter a latitude between -90 and 90 and a longitude between -180 and 180.");
      return;
    }
    setRecenterKey((k) => k + 1);
    movePin(lat as number, lng as number);
  }

  return (
    <>
      <div className="rounded-card bg-cream px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-ink">
          <IconPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Stand at your shop entrance in {nodeLabel}, then tap Locate my shop.
            Shoppers are sent to this exact spot.
          </span>
        </p>
      </div>

      <Button
        full
        className="mt-4"
        variant={hasPin ? "ghost" : "primary"}
        onClick={locate}
        loading={locating}
      >
        {hasPin ? "Locate again" : "Locate my shop"}
      </Button>
      <p className="mt-2 text-xs text-faint">
        We ask your device for its position only when you tap this. Maanta never
        follows your location afterwards.
      </p>

      {failure ? (
        <p className="mt-3 text-sm font-medium text-ink" role="alert">
          {geolocationFailureMessage(failure)}
        </p>
      ) : null}

      {hasPin ? (
        <div className="mt-4 rounded-card bg-white shadow-card px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconCheck className="h-4 w-4 text-verified" />
            Location captured
          </p>
          <p className="tnum mt-1 text-sm text-muted">
            {formatCoordinate(value.lat as number)}, {formatCoordinate(value.lng as number)}
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {value.source === "manual"
              ? "Pin placed by hand"
              : value.accuracyMetres != null
                ? `Accurate to about ${formatAccuracy(value.accuracyMetres)}`
                : "Accuracy not reported by your device"}
          </p>
          {coarse ? (
            <p className="mt-2 border-l-2 border-rust pl-2.5 text-xs font-medium text-ink">
              That reading is too broad to tell one shop from the next. Drag the
              pin onto your entrance before you continue.
            </p>
          ) : null}
        </div>
      ) : null}

      {hasPin || manualOpen ? (
        <div className="mt-4">
          <ShopLocationMap
            lat={value.lat}
            lng={value.lng}
            centre={nodeCentre}
            recenterKey={recenterKey}
            onMove={movePin}
          />
          <p className="mt-2 text-xs text-muted">
            {hasPin
              ? "Drag the pin, or tap the map, to move it onto your door."
              : "Tap the map to place your shop pin."}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="mt-4 text-sm font-semibold text-ink underline underline-offset-2"
        >
          Place the pin on a map instead
        </button>
      )}

      {manualOpen || hasPin ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setCoordsOpen((open) => !open)}
            className="text-xs font-semibold text-muted underline underline-offset-2"
            aria-expanded={coordsOpen}
          >
            {coordsOpen ? "Hide coordinates" : "Type coordinates instead"}
          </button>
          {coordsOpen ? (
            <div className="mt-2">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Latitude</span>
                  <input
                    className={cn(inputClass, "tnum")}
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="-1.27460"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Longitude</span>
                  <input
                    className={cn(inputClass, "tnum")}
                    value={lngInput}
                    onChange={(e) => setLngInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="36.85010"
                  />
                </label>
              </div>
              {coordsError ? (
                <p className="mt-2 text-sm font-medium text-ink" role="alert">
                  {coordsError}
                </p>
              ) : null}
              <Button size="sm" variant="ghost" className="mt-3" onClick={applyTypedCoords}>
                Use these coordinates
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasPin ? (
        <label className="mt-5 flex items-start gap-3">
          <input
            type="checkbox"
            checked={value.confirmed}
            onChange={(e) => onChange({ ...value, confirmed: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-ink"
          />
          <span className="text-sm font-medium text-ink">
            The pin is on my shop entrance.
          </span>
        </label>
      ) : null}
    </>
  );
}
