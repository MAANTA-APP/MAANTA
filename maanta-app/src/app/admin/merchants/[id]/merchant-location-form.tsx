"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField, inputClass } from "@/components/ui/inputs";
import { W3wChip } from "@/components/ui/chips";

/** Admin pickup location — w3w → coords, or lat/lng → optional reverse words. */
export function MerchantLocationForm({
  merchantId,
  initialW3w,
  initialLat,
  initialLng,
}: {
  merchantId: string;
  initialW3w: string;
  initialLat: number | null;
  initialLng: number | null;
}) {
  const router = useRouter();
  const [w3w, setW3w] = useState(initialW3w);
  const [lat, setLat] = useState(initialLat != null ? String(initialLat) : "");
  const [lng, setLng] = useState(initialLng != null ? String(initialLng) : "");
  const [mode, setMode] = useState<"w3w" | "coords">("w3w");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    what3wordsAddress: string;
    lat: number | null;
    lng: number | null;
  } | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    const payload =
      mode === "w3w"
        ? { what3wordsAddress: w3w.trim() }
        : {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            deriveWords: true,
          };
    const res = await fetch(`/api/admin/merchants/${merchantId}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save location.");
      return;
    }
    setSaved({
      what3wordsAddress: body.what3wordsAddress,
      lat: body.lat,
      lng: body.lng,
    });
    if (body.what3wordsAddress) setW3w(body.what3wordsAddress);
    if (typeof body.lat === "number") setLat(String(body.lat));
    if (typeof body.lng === "number") setLng(String(body.lng));
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-card bg-white shadow-card p-4">
      <h2 className="text-base font-bold text-ink">Pick-up location</h2>
      <p className="mt-1 text-xs text-muted">
        Set a what3words address (fills GPS) or paste coordinates (optionally derives
        the 3-word address). Used for Browse map pins and Discover distance.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("w3w")}
          className={
            mode === "w3w"
              ? "rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
              : "rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted"
          }
        >
          what3words
        </button>
        <button
          type="button"
          onClick={() => setMode("coords")}
          className={
            mode === "coords"
              ? "rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
              : "rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted"
          }
        >
          Coordinates
        </button>
      </div>

      {mode === "w3w" ? (
        <div className="mt-3">
          <TextField
            label="what3words address"
            value={w3w}
            onChange={(e) => setW3w(e.target.value)}
            placeholder="///market.square.entry"
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">Latitude</span>
            <input
              className={inputClass}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="-1.2746"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">Longitude</span>
            <input
              className={inputClass}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder="36.8501"
            />
          </label>
        </div>
      )}

      {error ? <p className="mt-2 text-sm font-medium text-ink">{error}</p> : null}
      {saved ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
          Saved <W3wChip address={saved.what3wordsAddress} />
          {saved.lat != null && saved.lng != null ? (
            <span className="tnum text-muted">
              ({saved.lat.toFixed(5)}, {saved.lng.toFixed(5)})
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4">
        <Button size="md" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save location"}
        </Button>
      </div>
    </section>
  );
}
