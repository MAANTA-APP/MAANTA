"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { BrowseDealPin, MapBounds } from "@/lib/browse";
import "leaflet/dist/leaflet.css";

// Default Leaflet marker icons break under bundlers — use CDN assets.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function BoundsWatcher({
  onBounds,
}: {
  onBounds: (bounds: MapBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBounds({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
    },
  });

  useEffect(() => {
    const b = map.getBounds();
    onBounds({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    });
  }, [map, onBounds]);

  return null;
}

function FlyTo({
  center,
  zoom,
}: {
  center: [number, number] | null;
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.flyTo(center, zoom ?? Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [center, zoom, map]);
  return null;
}

export function BrowseMap({
  pins,
  center,
  focus,
  selectedDealId,
  onBounds,
}: {
  pins: BrowseDealPin[];
  center: [number, number];
  focus: [number, number] | null;
  selectedDealId?: string | null;
  onBounds: (bounds: MapBounds) => void;
}) {
  const focusCenter = useMemo<[number, number] | null>(() => {
    if (focus) return focus;
    if (selectedDealId) {
      const pin = pins.find((p) => p.dealId === selectedDealId);
      if (pin) return [pin.lat, pin.lng];
    }
    return null;
  }, [focus, selectedDealId, pins]);

  return (
    <MapContainer
      center={center}
      zoom={15}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BoundsWatcher onBounds={onBounds} />
      <FlyTo center={focusCenter} />
      {pins.map((pin) => (
        <Marker key={pin.dealId} position={[pin.lat, pin.lng]} icon={markerIcon}>
          <Popup>
            <div className="min-w-[170px] space-y-1.5 rounded-xl p-0.5">
              <p className="text-sm font-semibold tracking-[-0.015em] text-ink">
                {pin.merchantName}
              </p>
              <p className="text-xs text-muted">{pin.title}</p>
              {pin.what3wordsAddress ? (
                <p className="font-mono text-[11px] text-ink">
                  {`///${pin.what3wordsAddress}`}
                </p>
              ) : null}
              <Link
                href={`/deals/${pin.dealId}`}
                className="mt-1 inline-flex h-9 items-center rounded-full bg-brand px-3 text-xs font-semibold text-black"
              >
                View deal
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
